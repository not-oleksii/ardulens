use tauri_plugin_fs::FsExt;

/// Extends the fs plugin's runtime scope to cover a user-picked GeoTag photo folder (and its
/// `_geotagged` output subfolder, created alongside it) - the folder is chosen freely via the
/// dialog plugin's folder picker, so it can be anywhere on disk, outside the fs plugin's static
/// default scope (app-specific directories only). Granted narrowly to just this one directory
/// tree rather than a broad `$HOME/**` capability, and re-granted (idempotent) every time a
/// folder is picked rather than accumulated across the app's lifetime.
#[tauri::command]
pub fn grant_geotag_folder_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())
}
