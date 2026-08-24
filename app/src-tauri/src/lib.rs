mod geotag;
mod transport;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(transport::TransportState::default())
        .invoke_handler(tauri::generate_handler![
            transport::list_serial_ports,
            transport::connect_serial,
            transport::connect_udp,
            transport::disconnect,
            transport::send_bytes,
            geotag::grant_geotag_folder_access,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ardulens");
}
