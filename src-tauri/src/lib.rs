mod files;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use notify_debouncer_mini::{
    new_debouncer, notify::RecursiveMode, notify::RecommendedWatcher, DebounceEventResult,
    Debouncer,
};
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

struct OpenedFile(Mutex<Option<String>>);

/// File-watch state shared across the whole app. A single window can have
/// several tabs open (each watching its own file), and the same file can be
/// open in tabs across multiple windows — so watchers are refcounted per
/// path (one real fs watch per unique file, however many tabs care about it),
/// with a per-window path list kept alongside purely so a closed window's
/// watches can be unwound correctly (see `on_window_event` in `run()`).
struct FileWatchState {
    watchers: HashMap<PathBuf, (Debouncer<RecommendedWatcher>, u32)>,
    by_window: HashMap<String, Vec<PathBuf>>,
}
struct FileWatchers(Mutex<FileWatchState>);

/// Whether the first macOS `RunEvent::Opened` (the file that launched the
/// process, if any) has already been handled. Later opens, while the app is
/// already running, spawn a new window instead of hijacking an existing one.
struct FirstOpenHandled(Mutex<bool>);

/// Labels new windows uniquely for the lifetime of the process ("main" is
/// reserved for the initial window declared in `tauri.conf.json`).
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

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
fn list_markdown_files(folder: String, show_hidden: bool) -> Result<Vec<String>, String> {
    let paths = files::markdown_files_in(std::path::Path::new(&folder), show_hidden)
        .map_err(|e| e.to_string())?;
    Ok(paths
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// Listing used when "Markdown only" mode is off: every recognized text/code
/// file, not just `.md`/`.markdown` — plus PDFs, which join the same
/// "non-markdown" browsing surface despite being binary (they're read via
/// `read_pdf_as_data_url`, never through `read_file`/`text_files_in`).
#[tauri::command]
fn list_text_files(folder: String, show_hidden: bool) -> Result<Vec<String>, String> {
    let dir = std::path::Path::new(&folder);
    let mut paths = files::text_files_in(dir, show_hidden).map_err(|e| e.to_string())?;
    paths.extend(files::pdf_files_in(dir, show_hidden).map_err(|e| e.to_string())?);
    paths.sort_by_key(|p| p.file_name().map(|n| n.to_ascii_lowercase()));
    Ok(paths
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
fn list_subfolders(folder: String, show_hidden: bool) -> Result<Vec<String>, String> {
    let paths = files::subfolders_in(std::path::Path::new(&folder), show_hidden)
        .map_err(|e| e.to_string())?;
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

/// Read a PDF file's bytes as a `data:` URL, for the frontend's bundled
/// PDF.js viewer to load — a PDF is binary, so unlike markdown/text files it
/// never goes through `read_file`. Mirrors `resolve_image_data_url`'s
/// bytes-to-base64 pattern.
#[tauri::command]
fn read_pdf_as_data_url(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !files::is_pdf(p) {
        return Err("not a PDF file".to_string());
    }
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Ok(format!("data:application/pdf;base64,{b64}"))
}

/// The markdown/PDF file passed on launch — via Apple Events on macOS or CLI
/// args on Windows. Consumes the stored macOS value so it's only ever
/// delivered to one window.
#[tauri::command]
fn get_startup_file(state: tauri::State<OpenedFile>) -> Option<String> {
    // macOS: file delivered via Apple Events, stored in managed state
    if let Ok(mut guard) = state.0.lock() {
        if guard.is_some() {
            return guard.take();
        }
    }
    // Windows: file delivered as a CLI argument
    std::env::args().skip(1).find(|a| {
        let p = std::path::Path::new(a);
        p.is_file() && files::is_launch_openable(p)
    })
}

/// Decrement `path`'s refcount, removing (and thus dropping/stopping) its
/// watcher once nothing references it anymore.
fn decrement_watch(
    watchers: &mut HashMap<PathBuf, (Debouncer<RecommendedWatcher>, u32)>,
    path: &PathBuf,
) {
    let hit_zero = if let Some((_, count)) = watchers.get_mut(path) {
        *count = count.saturating_sub(1);
        *count == 0
    } else {
        false
    };
    if hit_zero {
        watchers.remove(path);
    }
}

#[tauri::command]
fn watch_file(
    app: tauri::AppHandle,
    window: tauri::Window,
    state: tauri::State<FileWatchers>,
    path: String,
) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    let parent = file_path
        .parent()
        .ok_or_else(|| "file has no parent directory".to_string())?
        .to_path_buf();

    let label = window.label().to_string();
    let mut st = state.0.lock().map_err(|e| e.to_string())?;

    // Track this path under the window regardless of whether it's the first
    // tab (anywhere) to watch it, so window-close cleanup unwinds correctly.
    st.by_window.entry(label).or_default().push(file_path.clone());

    if let Some((_, count)) = st.watchers.get_mut(&file_path) {
        *count += 1;
        return Ok(());
    }

    let app_h = app.clone();
    let watched = path.clone();
    let watch_target = file_path.clone();

    // Watch the parent dir so atomic-rename saves (vim, VSCode, etc.) are caught.
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let matches = events.iter().any(|e| e.path == watch_target);
                if matches {
                    // Broadcast: the same file can be open in tabs across
                    // several windows, each of which matches by path itself.
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

    st.watchers.insert(file_path, (debouncer, 1));
    Ok(())
}

#[tauri::command]
fn unwatch_file(
    window: tauri::Window,
    state: tauri::State<FileWatchers>,
    path: String,
) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    let label = window.label().to_string();
    let mut st = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(paths) = st.by_window.get_mut(&label) {
        if let Some(pos) = paths.iter().position(|p| p == &file_path) {
            paths.remove(pos);
        }
    }
    decrement_watch(&mut st.watchers, &file_path);
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

/// Create another Slate window, cloned from the `main` window's config
/// (size/title/etc.) with a fresh label, so multiple independent instances
/// can be open at once. `open_path`, if given, loads that file on mount.
fn spawn_window(app: &tauri::AppHandle, open_path: Option<&str>) -> Result<(), String> {
    let n = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("slate-{n}");
    let mut conf = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .ok_or_else(|| "no main window config to clone".to_string())?;
    conf.label = label;
    conf.url = tauri::WebviewUrl::App(files::new_window_url_path(open_path).into());

    tauri::WebviewWindowBuilder::from_config(app, &conf)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Open a new, independent Slate window (blank — no folder/file pre-selected).
#[tauri::command]
async fn open_new_window(app: tauri::AppHandle) -> Result<(), String> {
    spawn_window(&app, None)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedFile(Mutex::new(None)))
        .manage(FileWatchers(Mutex::new(FileWatchState {
            watchers: HashMap::new(),
            by_window: HashMap::new(),
        })))
        .manage(FirstOpenHandled(Mutex::new(false)))
        .setup(|app| {
            seed_themes(&app.handle()).map_err(|e| e.to_string())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_markdown_files,
            list_text_files,
            list_subfolders,
            read_file,
            resolve_md_link,
            resolve_image_data_url,
            read_pdf_as_data_url,
            write_file,
            watch_file,
            unwatch_file,
            get_startup_file,
            list_themes,
            open_in_browser,
            open_new_window,
            set_window_icon
        ])
        // Stop watching a window's tabs' files once it closes, so
        // `FileWatchers` doesn't accumulate stale entries as windows come
        // and go (each path's refcount is unwound, not just cleared).
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<FileWatchers>() {
                    if let Ok(mut st) = state.0.lock() {
                        if let Some(paths) = st.by_window.remove(window.label()) {
                            for p in paths {
                                decrement_watch(&mut st.watchers, &p);
                            }
                        }
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // macOS delivers file-association opens via Apple Events, not CLI args.
            // The first one (if any) is the file that launched the process, so it's
            // routed into the pre-existing `main` window the same way as before.
            // Any later one means the app was already running — that gets its own
            // new window instead of hijacking whatever's already open.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &event {
                let path = urls.iter().find_map(|url| {
                    url.to_file_path().ok().and_then(|p| {
                        if p.is_file() && files::is_launch_openable(&p) {
                            Some(p.to_string_lossy().to_string())
                        } else {
                            None
                        }
                    })
                });
                if let Some(ref path_str) = path {
                    if let Ok(mut first) = app.state::<FirstOpenHandled>().0.lock() {
                        if !*first {
                            *first = true;
                            if let Some(state) = app.try_state::<OpenedFile>() {
                                if let Ok(mut guard) = state.0.lock() {
                                    *guard = Some(path_str.clone());
                                }
                            }
                            let _ = app.emit_to("main", "open-file", path_str.clone());
                        } else {
                            drop(first);
                            let _ = spawn_window(app, Some(path_str));
                        }
                    }
                }
            }
        });
}
