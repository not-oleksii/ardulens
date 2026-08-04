use serde::Serialize;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub const DATA_EVENT: &str = "mavlink-transport://data";
pub const STATUS_EVENT: &str = "mavlink-transport://status";

const READ_TIMEOUT: Duration = Duration::from_millis(200);

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
            while !stop_reader.load(Ordering::SeqCst) {
                match reader.read(&mut buf) {
                    Ok(0) => {}
                    Ok(n) => on_data(buf[..n].to_vec()),
                    Err(e) if e.kind() == io::ErrorKind::TimedOut => {}
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
    pub fn start(
        bind_port: u16,
        on_data: impl Fn(Vec<u8>, SocketAddr) + Send + 'static,
        on_error: impl Fn(String) + Send + 'static,
    ) -> io::Result<Self> {
        let socket = UdpSocket::bind(("0.0.0.0", bind_port))?;
        socket.set_read_timeout(Some(READ_TIMEOUT))?;
        let socket = Arc::new(socket);
        let peer: Arc<Mutex<Option<SocketAddr>>> = Arc::new(Mutex::new(None));

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
pub fn connect_udp(app: AppHandle, state: State<TransportState>, bind_port: u16) -> Result<(), String> {
    close_existing(&state);

    let data_app = app.clone();
    let error_app = app.clone();
    let bridge = UdpBridge::start(
        bind_port,
        move |bytes, _from| {
            let _ = data_app.emit(DATA_EVENT, DataPayload { bytes });
        },
        move |message| {
            let _ = error_app.emit(STATUS_EVENT, StatusPayload::Error { message });
        },
    )
    .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(ActiveBridge::Udp(bridge));
    let _ = app.emit(STATUS_EVENT, StatusPayload::Connected { detail: format!("udp:0.0.0.0:{bind_port}") });
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

    /// Proves UdpBridge actually binds, receives real packets, tracks the sender, and can
    /// reply to it - a genuine loopback exercise of the wire logic, not just a compile check.
    #[test]
    fn udp_bridge_receives_and_replies() {
        let (tx, rx) = mpsc::channel::<(Vec<u8>, SocketAddr)>();
        let bridge = UdpBridge::start(
            0,
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
        let bridge = UdpBridge::start(0, |_, _| {}, |_| {}).expect("bridge should bind");
        let err = bridge.send(b"nobody-to-send-to").unwrap_err();
        assert!(err.to_string().contains("no sender"));
    }
}
