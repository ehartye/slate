mod files;

use tauri::Manager;

const STARTER_THEMES: &[(&str, &str)] = &[
    ("midnight.css", include_str!("../themes/midnight.css")),
    ("paper.css", include_str!("../themes/paper.css")),
    ("minimal.css", include_str!("../themes/minimal.css")),
];

#[derive(serde::Serialize)]
struct ThemeInfo {
    name: String,
    mermaid: String,
    css: String,
}

fn themes_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn seed_themes(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = themes_dir(app)?;
    for (name, body) in STARTER_THEMES {
        let path = dir.join(name);
        if !path.exists() {
            std::fs::write(&path, body).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn list_themes(app: tauri::AppHandle) -> Result<Vec<ThemeInfo>, String> {
    let dir = themes_dir(&app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("css") {
            let css = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            out.push(ThemeInfo {
                name: files::parse_theme_name(&css),
                mermaid: files::parse_mermaid_mode(&css),
                css,
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
fn list_markdown_files(folder: String) -> Result<Vec<String>, String> {
    let paths =
        files::markdown_files_in(std::path::Path::new(&folder)).map_err(|e| e.to_string())?;
    Ok(paths
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            seed_themes(&app.handle()).map_err(|e| e.to_string())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_markdown_files,
            read_file,
            write_file,
            list_themes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
