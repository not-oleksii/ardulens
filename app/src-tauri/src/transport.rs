use serde::Serialize;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

// TODO: these two literals are independently re-declared in
// src/services/mavlinkTransport/mavlinkTransport.ts (same names) - a rename on either side
// fails silently at runtime (listen()/emit() just stop matching, no compiler error across the
// Rust/TS boundary). Keep both sides in sync by hand until/unless a shared-constants generator
// is worth the setup cost.
pub const DATA_EVENT: &str = "mavlink-transport://data";
pub const STATUS_EVENT: &str = "mavlink-transport://status";

// Short enough that live telemetry/command latency is imperceptible, long enough to merge
// the many tiny reads a real UART driver delivers (some FTDI/CH340-class chips have their own
// 1-16ms internal latency timers) into far fewer IPC events - a real full ArduPilot parameter
// dump (1000-1700+ small MAVLink packets) was previously emitting roughly one Tauri event
// (JSON-serialized, cross-thread dispatched into the webview) per OS-level read(), regardless
// of how few bytes it returned, which was enough sustained tiny-event traffic on the UI
// thread to make the whole window report "Not Responding" in Windows even though the actual
// frontend table re-render was already separately throttled.
const COALESCE_WINDOW: Duration = Duration::from_millis(10);
// Flushes early if a burst is large enough that waiting out the rest of the window would just
// add latency without further reducing event count.
const COALESCE_MAX_BYTES: usize = 4096;
// Read timeout doubles as the coalescer's idle-flush polling interval - short enough that a
// lone packet arriving during a quiet period (e.g. a 1Hz heartbeat with nothing else on the
// link) still reaches the frontend promptly rather than sitting buffered until the next batch.
const READ_TIMEOUT: Duration = Duration::from_millis(20);

/// Accumulates bytes from many small reads into fewer, larger batches before they cross the
/// Tauri IPC boundary - kept as a plain struct (no Tauri/serialport types) so the batching
/// logic itself is directly unit-testable, independent of any real port.
struct ByteCoalescer {
    buf: Vec<u8>,
    batch_started_at: Instant,
}

impl ByteCoalescer {
    fn new() -> Self {
        Self { buf: Vec::new(), batch_started_at: Instant::now() }
    }

    /// Adds bytes to the pending batch. Returns the batch (clearing it) once it's grown large
    /// enough or been accumulating long enough that holding it any longer would only add
    /// latency, not meaningfully reduce the number of emitted events.
    fn push(&mut self, bytes: &[u8]) -> Option<Vec<u8>> {
        if self.buf.is_empty() {
            self.batch_started_at = Instant::now();
        }
        self.buf.extend_from_slice(bytes);
        if self.buf.len() >= COALESCE_MAX_BYTES || self.batch_started_at.elapsed() >= COALESCE_WINDOW {
            Some(std::mem::take(&mut self.buf))
        } else {
            None
        }
    }

    /// Called whenever a read comes back empty (timeout/no new data) - flushes a pending
    /// partial batch once it's been waiting long enough, so an isolated packet during a quiet
    /// period doesn't sit buffered indefinitely just because nothing else arrived to fill it.
    fn flush_if_stale(&mut self) -> Option<Vec<u8>> {
        if !self.buf.is_empty() && self.batch_started_at.elapsed() >= COALESCE_WINDOW {
            Some(std::mem::take(&mut self.buf))
        } else {
            None
        }
    }
}

#[derive(Serialize, Clone)]
pub struct SerialPortInfo {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Serialize, Clone)]
struct DataPayload {
    bytes: Vec<u8>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum StatusPayload {
    Connected { detail: String },
    Disconnected,
    Error { message: String },
}

/// Enumerates serial ports as seen by the OS - a pure wrapper so it stays testable
/// independent of any Tauri machinery.
pub fn list_serial_ports_info() -> io::Result<Vec<SerialPortInfo>> {
    let ports = serialport::available_ports().map_err(|e| io::Error::other(e.to_string()))?;
    Ok(ports
        .into_iter()
        .map(|p| SerialPortInfo {
            name: p.port_name,
            description: match p.port_type {
                serialport::SerialPortType::UsbPort(info) => info.product.or(info.manufacturer),
                _ => None,
            },
        })
        .collect())
}

/// A background thread reading raw bytes from a serial port and forwarding them to
/// `on_data`, plus a matching writer handle - kept free of any Tauri types so it can be
/// exercised directly in unit tests.
pub struct SerialBridge {
    port: Box<dyn serialport::SerialPort>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl SerialBridge {
    pub fn start(
        port_name: &str,
        baud_rate: u32,
        on_data: impl Fn(Vec<u8>) + Send + 'static,
        on_error: impl Fn(String) + Send + 'static,
    ) -> io::Result<Self> {
        let port = serialport::new(port_name, baud_rate)
            .timeout(READ_TIMEOUT)
            .open()
            .map_err(|e| io::Error::other(e.to_string()))?;
        let mut reader = port.try_clone().map_err(|e| io::Error::other(e.to_string()))?;

        let stop = Arc::new(AtomicBool::new(false));
        let stop_reader = stop.clone();
        let thread = thread::spawn(move || {
            let mut buf = [0u8; 1024];
            let mut coalescer = ByteCoalescer::new();
            while !stop_reader.load(Ordering::SeqCst) {
                match reader.read(&mut buf) {
                    Ok(0) => {}
                    Ok(n) => {
                        if let Some(batch) = coalescer.push(&buf[..n]) {
                            on_data(batch);
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::TimedOut => {
                        if let Some(batch) = coalescer.flush_if_stale() {
                            on_data(batch);
                        }
                    }
                    Err(e) => {
                        on_error(e.to_string());
                        break;
                    }
                }
            }
        });

        Ok(Self { port, stop, thread: Some(thread) })
    }

    pub fn send(&self, bytes: &[u8]) -> io::Result<()> {
        self.port
            .try_clone()
            .map_err(|e| io::Error::other(e.to_string()))?
            .write_all(bytes)
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for SerialBridge {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Same shape as `SerialBridge` but over UDP: binds and listens on `bind_port` (matching
/// how ArduPilot SITL / most WiFi telemetry bridges proactively send *to* the GCS, rather
/// than waiting to be dialed), remembering the most recent sender so `send()` has somewhere
/// to reply to.
pub struct UdpBridge {
    socket: Arc<UdpSocket>,
    peer: Arc<Mutex<Option<SocketAddr>>>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl UdpBridge {
    /// `remote`, when given, is a specific peer to target instead of the default listen-only
    /// behavior (wait for whichever sender speaks first). Some setups are the other way around,
    /// with a companion computer or bridge that itself only listens (e.g. on 127.0.0.1), so the
    /// GCS has to dial out to it first. Pre-seeding `peer` here means `send()` (and this app's
    /// own periodic GCS heartbeat, sent immediately on connect) reaches it right away instead of
    /// erroring with "no sender seen yet".
    pub fn start(
        bind_port: u16,
        remote: Option<SocketAddr>,
        on_data: impl Fn(Vec<u8>, SocketAddr) + Send + 'static,
        on_error: impl Fn(String) + Send + 'static,
    ) -> io::Result<Self> {
        let socket = UdpSocket::bind(("0.0.0.0", bind_port))?;
        socket.set_read_timeout(Some(READ_TIMEOUT))?;
        let socket = Arc::new(socket);
        let peer: Arc<Mutex<Option<SocketAddr>>> = Arc::new(Mutex::new(remote));

        let stop = Arc::new(AtomicBool::new(false));
        let stop_reader = stop.clone();
        let socket_reader = socket.clone();
        let peer_reader = peer.clone();
        let thread = thread::spawn(move || {
            let mut buf = [0u8; 2048];
            while !stop_reader.load(Ordering::SeqCst) {
                match socket_reader.recv_from(&mut buf) {
                    Ok((n, from)) => {
                        *peer_reader.lock().unwrap() = Some(from);
                        on_data(buf[..n].to_vec(), from);
                    }
                    Err(e)
                        if e.kind() == io::ErrorKind::WouldBlock || e.kind() == io::ErrorKind::TimedOut =>
                    {
                        // No packet within the read timeout - expected, just loop and re-check `stop`.
                    }
                    Err(e) => {
                        on_error(e.to_string());
                        break;
                    }
                }
            }
        });

        Ok(Self { socket, peer, stop, thread: Some(thread) })
    }

    /// The actual bound local port - useful when `bind_port` was 0 (OS-assigned). Not yet
    /// called outside tests (no Tauri command exposes OS-assigned UDP ports in R1), kept for
    /// the loopback test below and for a likely future "auto" bind-port option.
    #[allow(dead_code)]
    pub fn local_port(&self) -> io::Result<u16> {
        Ok(self.socket.local_addr()?.port())
    }

    pub fn send(&self, bytes: &[u8]) -> io::Result<()> {
        let target = self
            .peer
            .lock()
            .unwrap()
            .ok_or_else(|| io::Error::other("no sender has been seen yet on this UDP port"))?;
        self.socket.send_to(bytes, target).map(|_| ())
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for UdpBridge {
    fn drop(&mut self) {
        self.stop();
    }
}

enum ActiveBridge {
    Serial(SerialBridge),
    Udp(UdpBridge),
}

#[derive(Default)]
pub struct TransportState(Mutex<Option<ActiveBridge>>);

fn close_existing(state: &TransportState) {
    // Dropping the old bridge (if any) stops its reader thread via `Drop`.
    state.0.lock().unwrap().take();
}

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    list_serial_ports_info().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn connect_serial(
    app: AppHandle,
    state: State<TransportState>,
    port_name: String,
    baud_rate: u32,
) -> Result<(), String> {
    close_existing(&state);

    let data_app = app.clone();
    let error_app = app.clone();
    let bridge = SerialBridge::start(
        &port_name,
        baud_rate,
        move |bytes| {
            let _ = data_app.emit(DATA_EVENT, DataPayload { bytes });
        },
        move |message| {
            let _ = error_app.emit(STATUS_EVENT, StatusPayload::Error { message });
        },
    )
    .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(ActiveBridge::Serial(bridge));
    let _ = app.emit(STATUS_EVENT, StatusPayload::Connected { detail: format!("serial:{port_name}@{baud_rate}") });
    Ok(())
}

#[tauri::command]
pub fn connect_udp(
    app: AppHandle,
    state: State<TransportState>,
    bind_port: u16,
    remote_host: Option<String>,
) -> Result<(), String> {
    close_existing(&state);

    // A blank/whitespace-only host from the UI means "no manual IP" - same as None, not a
    // parse error.
    let remote_host = remote_host.filter(|h| !h.trim().is_empty());
    let remote = remote_host
        .as_deref()
        .map(|host| format!("{host}:{bind_port}").parse::<SocketAddr>())
        .transpose()
        .map_err(|e| format!("Invalid IP address: {e}"))?;

    let data_app = app.clone();
    let error_app = app.clone();
    let bridge = UdpBridge::start(
        bind_port,
        remote,
        move |bytes, _from| {
            let _ = data_app.emit(DATA_EVENT, DataPayload { bytes });
        },
        move |message| {
            let _ = error_app.emit(STATUS_EVENT, StatusPayload::Error { message });
        },
    )
    .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(ActiveBridge::Udp(bridge));
    let detail = match &remote_host {
        Some(host) => format!("udp:{host}:{bind_port}"),
        None => format!("udp:0.0.0.0:{bind_port}"),
    };
    let _ = app.emit(STATUS_EVENT, StatusPayload::Connected { detail });
    Ok(())
}

#[tauri::command]
pub fn disconnect(app: AppHandle, state: State<TransportState>) -> Result<(), String> {
    close_existing(&state);
    let _ = app.emit(STATUS_EVENT, StatusPayload::Disconnected);
    Ok(())
}

#[tauri::command]
pub fn send_bytes(state: State<TransportState>, bytes: Vec<u8>) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    match guard.as_ref() {
        Some(ActiveBridge::Serial(bridge)) => bridge.send(&bytes).map_err(|e| e.to_string()),
        Some(ActiveBridge::Udp(bridge)) => bridge.send(&bytes).map_err(|e| e.to_string()),
        None => Err("Not connected".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn coalescer_holds_a_small_batch_until_the_window_elapses() {
        let mut c = ByteCoalescer::new();
        assert_eq!(c.push(b"AB"), None, "a couple bytes, well under the window, shouldn't flush yet");
        assert_eq!(c.push(b"CD"), None, "still under the window - keeps accumulating, not re-emitting per push");
        thread::sleep(COALESCE_WINDOW + Duration::from_millis(5));
        assert_eq!(c.push(b"EF"), Some(b"ABCDEF".to_vec()), "once the window elapses, the next push flushes everything accumulated so far");
    }

    #[test]
    fn coalescer_flushes_early_once_the_byte_threshold_is_reached() {
        let mut c = ByteCoalescer::new();
        let big = vec![0u8; COALESCE_MAX_BYTES - 1];
        assert_eq!(c.push(&big), None, "just under the byte threshold - still holding");
        let batch = c.push(&[1, 2]).expect("crossing the byte threshold should flush immediately, without waiting out the window");
        assert_eq!(batch.len(), COALESCE_MAX_BYTES + 1);
    }

    #[test]
    fn coalescer_flush_if_stale_is_a_noop_on_an_empty_or_fresh_buffer() {
        let mut c = ByteCoalescer::new();
        assert_eq!(c.flush_if_stale(), None, "nothing buffered yet");
        c.push(b"AB");
        assert_eq!(c.flush_if_stale(), None, "buffered, but the window hasn't elapsed - a read timeout right after a fresh push shouldn't flush early");
    }

    #[test]
    fn coalescer_flush_if_stale_flushes_a_lone_batch_once_the_window_elapses() {
        // Simulates an isolated packet arriving during otherwise-quiet traffic (e.g. a single
        // heartbeat with nothing else on the link) - it must still reach the frontend promptly
        // rather than sitting buffered forever waiting for more bytes that may not come.
        let mut c = ByteCoalescer::new();
        assert_eq!(c.push(b"heartbeat"), None);
        thread::sleep(COALESCE_WINDOW + Duration::from_millis(5));
        assert_eq!(c.flush_if_stale(), Some(b"heartbeat".to_vec()));
        assert_eq!(c.flush_if_stale(), None, "already flushed - nothing left to flush again");
    }

    /// Proves UdpBridge actually binds, receives real packets, tracks the sender, and can
    /// reply to it - a genuine loopback exercise of the wire logic, not just a compile check.
    #[test]
    fn udp_bridge_receives_and_replies() {
        let (tx, rx) = mpsc::channel::<(Vec<u8>, SocketAddr)>();
        let bridge = UdpBridge::start(
            0,
            None,
            move |bytes, from| {
                let _ = tx.send((bytes, from));
            },
            |message| panic!("unexpected UdpBridge error: {message}"),
        )
        .expect("bridge should bind on an OS-assigned port");
        let bridge_port = bridge.local_port().expect("bound socket should have a local port");

        let peer = UdpSocket::bind(("127.0.0.1", 0)).expect("peer socket should bind");
        peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        peer.send_to(b"heartbeat-bytes", ("127.0.0.1", bridge_port))
            .expect("peer should be able to send to the bridge");

        let (received, from) = rx
            .recv_timeout(Duration::from_secs(2))
            .expect("bridge should forward the received bytes within 2s");
        assert_eq!(received, b"heartbeat-bytes");
        assert_eq!(from.port(), peer.local_addr().unwrap().port());

        bridge.send(b"ack-bytes").expect("bridge should be able to reply to the tracked sender");
        let mut buf = [0u8; 64];
        let (n, _) = peer.recv_from(&mut buf).expect("peer should receive the bridge's reply");
        assert_eq!(&buf[..n], b"ack-bytes");
    }

    #[test]
    fn udp_bridge_send_before_any_peer_seen_errors() {
        let bridge = UdpBridge::start(0, None, |_, _| {}, |_| {}).expect("bridge should bind");
        let err = bridge.send(b"nobody-to-send-to").unwrap_err();
        assert!(err.to_string().contains("no sender"));
    }

    /// Proves the "dial out to a manually-entered IP" path: giving `remote` lets `send()`
    /// succeed immediately, with no incoming packet needed first - the scenario this exists
    /// for (a companion computer/bridge that itself only listens, so the GCS has to speak
    /// first).
    #[test]
    fn udp_bridge_with_remote_can_send_before_any_peer_seen() {
        let target = UdpSocket::bind(("127.0.0.1", 0)).expect("target socket should bind");
        target.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let target_addr = target.local_addr().unwrap();

        let bridge = UdpBridge::start(0, Some(target_addr), |_, _| {}, |message| panic!("unexpected UdpBridge error: {message}"))
            .expect("bridge should bind");
        bridge.send(b"hello-target").expect("bridge should be able to send to the pre-seeded remote");

        let mut buf = [0u8; 64];
        let (n, _) = target.recv_from(&mut buf).expect("target should receive the bridge's send");
        assert_eq!(&buf[..n], b"hello-target");
    }
}
