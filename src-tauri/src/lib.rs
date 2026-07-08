mod files;

use std::sync::Mutex;
use std::time::Duration;
use notify_debouncer_mini::{
    new_debouncer, notify::RecursiveMode, notify::RecommendedWatcher, DebounceEventResult,
    Debouncer,
};
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

struct OpenedFile(Mutex<Option<String>>);
struct FileWatcher(Mutex<Option<Debouncer<RecommendedWatcher>>>);

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
    ("manuscript-light.css", include_str!("../themes/manuscript-light.css")),
    ("manuscript-dark.css", include_str!("../themes/manuscript-dark.css")),
    ("velvet-dark.css", include_str!("../themes/velvet-dark.css")),
    ("velvet-light.css", include_str!("../themes/velvet-light.css")),
    ("glacier-dark.css", include_str!("../themes/glacier-dark.css")),
    ("glacier-light.css", include_str!("../themes/glacier-light.css")),
    ("blueprint-dark.css", include_str!("../themes/blueprint-dark.css")),
    ("blueprint-light.css", include_str!("../themes/blueprint-light.css")),
    ("groovy-dark.css", include_str!("../themes/groovy-dark.css")),
    ("groovy-light.css", include_str!("../themes/groovy-light.css")),
    ("kapow-dark.css", include_str!("../themes/kapow-dark.css")),
    ("kapow-light.css", include_str!("../themes/kapow-light.css")),
    ("starship-dark.css", include_str!("../themes/starship-dark.css")),
    ("starship-light.css", include_str!("../themes/starship-light.css")),
    ("mainframe-dark.css", include_str!("../themes/mainframe-dark.css")),
    ("mainframe-light.css", include_str!("../themes/mainframe-light.css")),
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
        // Write when missing, and refresh when the bundled default has changed, so
        // built-in theme improvements reach existing installs. User-created themes
        // use other filenames and are never touched here.
        let current = std::fs::read_to_string(&path).ok();
        if current.as_deref() != Some(*body) {
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
fn list_subfolders(folder: String) -> Result<Vec<String>, String> {
    let paths = files::subfolders_in(std::path::Path::new(&folder)).map_err(|e| e.to_string())?;
    Ok(paths
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Resolve a relative `.md` link clicked in the preview to an absolute path,
/// or `None` if it doesn't point at an existing markdown file.
#[tauri::command]
fn resolve_md_link(base: String, href: String) -> Option<String> {
    files::resolve_md_link(std::path::Path::new(&base), &href)
        .map(|p| p.to_string_lossy().to_string())
}

/// Resolve a relative image `href` (from the markdown file at `base`) and read
/// it as a `data:` URL, so the preview and the standalone-HTML export can embed
/// it without needing filesystem/asset-protocol access from the webview.
/// Returns `Ok(None)` if `href` isn't a relative path to an existing supported
/// image file (missing file, non-image extension, or already an absolute/URL href).
#[tauri::command]
fn resolve_image_data_url(base: String, href: String) -> Result<Option<String>, String> {
    let Some(path) = files::resolve_image_link(std::path::Path::new(&base), &href) else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = files::image_mime(&path);
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Ok(Some(format!("data:{mime};base64,{b64}")))
}

/// The markdown file passed on launch — via Apple Events on macOS or CLI args on Windows.
#[tauri::command]
fn get_startup_file(state: tauri::State<OpenedFile>) -> Option<String> {
    // macOS: file delivered via Apple Events, stored in managed state
    if let Ok(guard) = state.0.lock() {
        if guard.is_some() {
            return guard.clone();
        }
    }
    // Windows: file delivered as a CLI argument
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

#[tauri::command]
fn watch_file(
    app: tauri::AppHandle,
    state: tauri::State<FileWatcher>,
    path: String,
) -> Result<(), String> {
    let file_path = std::path::PathBuf::from(&path);
    let parent = file_path
        .parent()
        .ok_or_else(|| "file has no parent directory".to_string())?
        .to_path_buf();

    let app_h = app.clone();
    let watched = path.clone();

    // Watch the parent dir so atomic-rename saves (vim, VSCode, etc.) are caught.
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let matches = events.iter().any(|e| e.path == file_path);
                if matches {
                    let _ = app_h.emit("file-changed", watched.clone());
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(debouncer);
    Ok(())
}

#[tauri::command]
fn unwatch_file(state: tauri::State<FileWatcher>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
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
        .manage(OpenedFile(Mutex::new(None)))
        .manage(FileWatcher(Mutex::new(None)))
        .setup(|app| {
            seed_themes(&app.handle()).map_err(|e| e.to_string())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_markdown_files,
            list_subfolders,
            read_file,
            resolve_md_link,
            resolve_image_data_url,
            write_file,
            watch_file,
            unwatch_file,
            get_startup_file,
            list_themes,
            open_in_browser,
            set_window_icon
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // macOS delivers file-association opens via Apple Events, not CLI args.
            // Store the path in managed state (for get_startup_file on cold launch)
            // and emit an event (for hot launch when the app is already running).
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &event {
                let path = urls.iter().find_map(|url| {
                    url.to_file_path().ok().and_then(|p| {
                        let ext = p
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_ascii_lowercase())
                            .unwrap_or_default();
                        if p.is_file() && (ext == "md" || ext == "markdown") {
                            Some(p.to_string_lossy().to_string())
                        } else {
                            None
                        }
                    })
                });
                if let Some(ref path_str) = path {
                    if let Some(state) = app.try_state::<OpenedFile>() {
                        if let Ok(mut guard) = state.0.lock() {
                            *guard = Some(path_str.clone());
                        }
                    }
                    let _ = app.emit("open-file", path_str.clone());
                }
            }
        });
}
