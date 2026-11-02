use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    version: String,
    commit: Option<&'static str>,
    tracked_state: &'static str,
}

#[tauri::command]
pub fn get_build_info(app: tauri::AppHandle) -> BuildInfo {
    BuildInfo {
        version: app.package_info().version.to_string(),
        commit: match env!("SLATE_BUILD_COMMIT") {
            "" => None,
            value => Some(value),
        },
        tracked_state: env!("SLATE_BUILD_TRACKED_STATE"),
    }
}
