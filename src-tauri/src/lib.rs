mod files;

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

const STARTER_THEMES: &[(&str, &str)] = &[
    ("aurora-dark.css", include_str!("../themes/aurora-dark.css")),
    ("aurora-light.css", include_str!("../themes/aurora-light.css")),
    ("ember-dark.css", include_str!("../themes/ember-dark.css")),
    ("ember-light.css", include_str!("../themes/ember-light.css")),
    ("verdant-dark.css", include_str!("../themes/verdant-dark.css")),
    ("verdant-light.css", include_str!("../themes/verdant-light.css")),
    ("noir-dark.css", include_str!("../themes/noir-dark.css")),
    ("noir-light.css", include_str!("../themes/noir-light.css")),
    ("arcade-dark.css", include_str!("../themes/arcade-dark.css")),
    ("arcade-light.css", include_str!("../themes/arcade-light.css")),
    ("terminal-dark.css", include_str!("../themes/terminal-dark.css")),
    ("terminal-light.css", include_str!("../themes/terminal-light.css")),
    ("overlord-dark.css", include_str!("../themes/overlord-dark.css")),
    ("overlord-light.css", include_str!("../themes/overlord-light.css")),
    ("buckethub-dark.css", include_str!("../themes/buckethub-dark.css")),
    ("buckethub-light.css", include_str!("../themes/buckethub-light.css")),
];

/// Pre-v2 starter filenames removed on seed so they don't linger alongside the new set.
const RETIRED_STARTERS: &[&str] = &["midnight.css", "paper.css", "minimal.css"];

#[derive(serde::Serialize)]
struct ThemeInfo {
    name: String,
    mode: String,
    mermaid: String,
    accent: String,
    bg: String,
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
    // Retire the old starter set so the new families aren't crowded by stale files.
    for name in RETIRED_STARTERS {
        let path = dir.join(name);
        if path.exists() {
            let _ = std::fs::remove_file(&path);
        }
    }
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
            let mode = files::parse_mode(&css);
            let mermaid = if mode == "dark" { "dark" } else { "default" }.to_string();
            out.push(ThemeInfo {
                name: files::parse_theme_name(&css),
                mode,
                mermaid,
                accent: files::parse_css_var(&css, "--accent"),
                bg: files::parse_css_var(&css, "--bg"),
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

/// The markdown file Windows passed on launch via the file association, if any.
#[tauri::command]
fn get_startup_file() -> Option<String> {
    std::env::args().skip(1).find(|a| {
        let p = std::path::Path::new(a);
        p.is_file()
            && p.extension()
                .and_then(|e| e.to_str())
                .map(|e| {
                    let e = e.to_ascii_lowercase();
                    e == "md" || e == "markdown"
                })
                .unwrap_or(false)
    })
}

/// Resolve a relative link in `base` (the current markdown file) to an absolute
/// path, returning it only if it points at an existing `.md`/`.markdown` file.
#[tauri::command]
fn resolve_md_link(base: String, href: String) -> Option<String> {
    files::resolve_md_link(std::path::Path::new(&base), &href)
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_window_icon(
    window: tauri::Window,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let icon = tauri::image::Image::new_owned(rgba, width, height);
    window.set_icon(icon).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_in_browser(app: tauri::AppHandle, html: String) -> Result<(), String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("slate-preview.html");
    std::fs::write(&path, html).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
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
            resolve_md_link,
            get_startup_file,
            list_themes,
            open_in_browser,
            set_window_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
