mod transport;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(transport::TransportState::default())
        .invoke_handler(tauri::generate_handler![
            transport::list_serial_ports,
            transport::connect_serial,
            transport::connect_udp,
            transport::disconnect,
            transport::send_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ardulens");
}
