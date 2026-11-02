use crate::update_guard::Guard;
use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[cfg(not(feature = "updater-verification"))]
const ENDPOINT: &str = "https://raw.githubusercontent.com/ehartye/slate/updates/preview.json";
#[cfg(not(feature = "updater-verification"))]
const PUBLIC_KEY: &str = env!("SLATE_UPDATER_PUBLIC_KEY");
#[cfg(feature = "updater-verification")]
const ENDPOINT: &str = env!("SLATE_UPDATER_TEST_ENDPOINT");
#[cfg(feature = "updater-verification")]
const PUBLIC_KEY: &str = env!("SLATE_UPDATER_TEST_PUBLIC_KEY");
const PLATFORMS: [&str; 3] = ["windows-x86_64", "darwin-aarch64", "darwin-x86_64"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub phase: String,
    pub version: Option<String>,
    pub notes: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub message: String,
}
impl Default for UpdateStatus {
    fn default() -> Self {
        let available = !PUBLIC_KEY.is_empty() && supported_target();
        Self {
            phase: if available { "idle" } else { "unavailable" }.into(),
            version: None,
            notes: String::new(),
            downloaded_bytes: 0,
            total_bytes: None,
            message: if available {
                ""
            } else {
                "Update checking is unavailable in this build."
            }
            .into(),
        }
    }
}
fn supported_target() -> bool {
    cfg!(all(target_os = "windows", target_arch = "x86_64"))
        || cfg!(all(
            target_os = "macos",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ))
}
#[cfg(any(test, feature = "updater-verification"))]
fn verification_allowed(identifier: &str, endpoint: &str) -> bool {
    identifier != "com.hartye.slate"
        && url::Url::parse(endpoint).is_ok_and(|u| {
            matches!(u.scheme(), "http" | "https")
                && matches!(u.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
                && u.username().is_empty()
                && u.password().is_none()
        })
}
pub fn validate_configuration(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(feature = "updater-verification")]
    if !verification_allowed(&app.config().identifier, ENDPOINT) || PUBLIC_KEY.is_empty() {
        return Err("Updater verification requires an isolated identifier, loopback feed and explicit test public key".into());
    }
    #[cfg(not(feature = "updater-verification"))]
    let _ = app;
    Ok(())
}
#[derive(Default)]
pub struct Service {
    pub status: UpdateStatus,
    pub guard: Guard,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
    pub queued_opens: Vec<Option<String>>,
    pub opening_windows: u32,
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    pub initial_open_handled: bool,
}
impl Service {
    pub fn should_prevent_exit(&self, code: Option<i32>) -> bool {
        self.guard.frozen() && code != Some(tauri::RESTART_EXIT_CODE)
    }
    fn prepare_install(&mut self, windows: Vec<String>) -> Option<u64> {
        if busy(self) || self.bytes.is_none() {
            return None;
        }
        if self.opening_windows > 0 {
            self.status.message = "A window is opening. Retry installation.".into();
            return None;
        }
        let attempt = self.guard.begin(windows)?;
        self.status.phase = "preparing".into();
        self.status.message.clear();
        Some(attempt)
    }
    fn finish_attempt(
        &mut self,
        attempt: u64,
        phase: &str,
        message: &str,
    ) -> Option<Vec<Option<String>>> {
        if self.guard.attempt != attempt || !self.guard.frozen() {
            return None;
        }
        self.guard.abort();
        self.status.phase = phase.into();
        self.status.message = message.into();
        let queued = std::mem::take(&mut self.queued_opens);
        // These reservations prevent another install from committing between
        // releasing this attempt and creating the windows requested during it.
        self.opening_windows += queued.len() as u32;
        Some(queued)
    }
    /// Reserve creation under the same lock as the final install decision, but
    /// release that lock before calling the main-thread window builder.
    pub fn reserve_open(&mut self, path: Option<String>) -> Result<bool, String> {
        if self.guard.committed {
            return Err("Update installation in progress".into());
        }
        if self.guard.preparing {
            self.guard.failed = true;
            self.queued_opens.push(path);
            return Ok(false);
        }
        self.opening_windows += 1;
        Ok(true)
    }
}
#[derive(Default)]
pub struct Updates(pub Mutex<Service>);
fn publish(app: &tauri::AppHandle, s: &Service) {
    let _ = app.emit("update-status", s.status.clone());
}
fn fail(app: &tauri::AppHandle, message: &str) -> UpdateStatus {
    let state = app.state::<Updates>();
    let mut s = state.0.lock().unwrap();
    s.status.phase = "error".into();
    s.status.message = message.into();
    publish(app, &s);
    s.status.clone()
}
fn busy(s: &Service) -> bool {
    matches!(
        s.status.phase.as_str(),
        "checking" | "downloading" | "preparing" | "installing"
    )
}

pub fn preview_version(v: &str) -> Result<semver::Version, String> {
    let parsed = semver::Version::parse(v).map_err(|_| "Invalid Preview version")?;
    let n = parsed
        .pre
        .as_str()
        .strip_prefix("alpha.")
        .ok_or("Invalid Preview version")?;
    if !parsed.build.is_empty()
        || n.is_empty()
        || n.starts_with('0')
        || !n.bytes().all(|b| b.is_ascii_digit())
    {
        return Err("Invalid Preview version".into());
    }
    Ok(parsed)
}
pub fn validate_manifest(value: &serde_json::Value) -> Result<semver::Version, String> {
    let bad = || "Invalid Preview metadata".to_string();
    let version = value["version"].as_str().ok_or_else(bad)?;
    let parsed = preview_version(version)?;
    if !value["notes"].is_string() {
        return Err(bad());
    }
    if value.get("pub_date").is_some_and(|date| !date.is_string()) {
        return Err(bad());
    }
    let platforms = value["platforms"].as_object().ok_or_else(bad)?;
    if platforms.len() != 3 {
        return Err(bad());
    }
    for target in PLATFORMS {
        let entry = platforms.get(target).ok_or_else(bad)?;
        let url = entry["url"].as_str().ok_or_else(bad)?;
        let sig = entry["signature"].as_str().ok_or_else(bad)?;
        #[cfg(not(feature = "updater-verification"))]
        let prefix = format!("https://github.com/ehartye/slate/releases/download/v{version}/");
        #[cfg(feature = "updater-verification")]
        let prefix = format!(
            "{}/releases/download/v{version}/",
            url::Url::parse(ENDPOINT)
                .map_err(|_| bad())?
                .origin()
                .ascii_serialization()
        );
        let name = url.strip_prefix(&prefix).ok_or_else(bad)?;
        if sig.trim().is_empty()
            || name.is_empty()
            || !name.as_bytes()[0].is_ascii_alphanumeric()
            || name.contains("..")
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
            || !name.ends_with(if target.starts_with("windows") {
                ".exe"
            } else {
                ".app.tar.gz"
            })
        {
            return Err(bad());
        }
    }
    if platforms["darwin-aarch64"]["url"] != platforms["darwin-x86_64"]["url"]
        || platforms["darwin-aarch64"]["signature"] != platforms["darwin-x86_64"]["signature"]
    {
        return Err(bad());
    }
    // Tauri's deserializer performs RFC3339/calendar validation as well.
    serde_json::from_value::<tauri_plugin_updater::RemoteRelease>(value.clone())
        .map_err(|_| bad())?;
    Ok(parsed)
}

#[derive(Debug, PartialEq)]
enum ProbeError {
    Network,
    Invalid,
}
async fn probe_feed(endpoint: &str) -> Result<bool, ProbeError> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| ProbeError::Network)?;
    let response = client
        .get(endpoint)
        .send()
        .await
        .map_err(|_| ProbeError::Network)?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(false);
    }
    if !response.status().is_success() {
        return Err(ProbeError::Network);
    }
    let value = response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| ProbeError::Invalid)?;
    validate_manifest(&value).map_err(|_| ProbeError::Invalid)?;
    Ok(true)
}

#[tauri::command]
pub fn get_update_status(state: tauri::State<Updates>) -> UpdateStatus {
    state.0.lock().unwrap().status.clone()
}

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> UpdateStatus {
    {
        let state = app.state::<Updates>();
        let mut s = state.0.lock().unwrap();
        if busy(&s) || s.status.phase == "unavailable" {
            return s.status.clone();
        }
        s.update = None;
        s.bytes = None;
        s.status = UpdateStatus {
            phase: "checking".into(),
            ..Default::default()
        };
        publish(&app, &s);
    }
    // A separate status probe preserves the initial-feed 404 distinction. The
    // actual selected payload below is validated again from Tauri's own response.
    match probe_feed(ENDPOINT).await {
        Ok(false) => {
            let state = app.state::<Updates>();
            let mut s = state.0.lock().unwrap();
            s.status.phase = "noRelease".into();
            s.status.message = "No Preview release is available yet.".into();
            publish(&app, &s);
            return s.status.clone();
        }
        Ok(true) => (),
        Err(ProbeError::Invalid) => return fail(&app, "Invalid Preview update metadata."),
        Err(ProbeError::Network) => {
            return fail(
                &app,
                "Could not reach the Preview update feed. Check your connection and retry.",
            )
        }
    }
    let updater = app
        .updater_builder()
        .pubkey(PUBLIC_KEY)
        .endpoints(vec![ENDPOINT.parse().unwrap()])
        .and_then(|b| {
            b.version_comparator(|_, _| true)
                .timeout(Duration::from_secs(30))
                .build()
        });
    let result = match updater {
        Ok(u) => u.check().await,
        Err(e) => Err(e),
    };
    match result {
        Ok(Some(update)) => {
            let version = match validate_manifest(&update.raw_json) {
                Ok(v) => v,
                Err(_) => return fail(&app, "Invalid Preview update metadata."),
            };
            let current = match preview_version(&app.package_info().version.to_string()) {
                Ok(v) => v,
                Err(_) => return fail(&app, "This build is not eligible for Preview updates."),
            };
            let state = app.state::<Updates>();
            let mut s = state.0.lock().unwrap();
            if version <= current {
                s.status.phase = "upToDate".into();
                s.status.message = "Slate is up to date on Preview.".into();
            } else {
                s.status.phase = "available".into();
                s.status.version = Some(update.version.clone());
                s.status.notes = update.body.clone().unwrap_or_default();
                s.update = Some(update);
            }
            publish(&app, &s);
            s.status.clone()
        }
        _ => fail(
            &app,
            "Could not read valid Preview update metadata. Retry the check.",
        ),
    }
}

#[tauri::command]
pub async fn download_update(app: tauri::AppHandle) -> UpdateStatus {
    let update = {
        let state = app.state::<Updates>();
        let mut s = state.0.lock().unwrap();
        if busy(&s) {
            return s.status.clone();
        }
        let Some(update) = s.update.clone() else {
            return s.status.clone();
        };
        s.status.phase = "downloading".into();
        s.status.message.clear();
        s.status.downloaded_bytes = 0;
        s.status.total_bytes = None;
        s.bytes = None;
        publish(&app, &s);
        update
    };
    let progress_app = app.clone();
    match update
        .download(
            move |bytes, total| {
                let state = progress_app.state::<Updates>();
                let mut s = state.0.lock().unwrap();
                s.status.downloaded_bytes += bytes as u64;
                s.status.total_bytes = total;
                publish(&progress_app, &s);
            },
            || {},
        )
        .await
    {
        Ok(bytes) => {
            let state = app.state::<Updates>();
            let mut s = state.0.lock().unwrap();
            s.bytes = Some(bytes);
            s.status.phase = "downloaded".into();
            publish(&app, &s);
            s.status.clone()
        }
        Err(e) => {
            let message = match e {
                tauri_plugin_updater::Error::Minisign(_)
                | tauri_plugin_updater::Error::Base64(_)
                | tauri_plugin_updater::Error::SignatureUtf8(_)
                | tauri_plugin_updater::Error::SignedVersionMismatch { .. }
                | tauri_plugin_updater::Error::MissingSignedVersion => {
                    "The update signature is invalid. The installed app was not changed."
                }
                _ => "Update download failed. Retry the download.",
            };
            fail(&app, message)
        }
    }
}

#[derive(Serialize, Clone, Deserialize)]
pub struct Attempt {
    pub attempt: u64,
}
#[tauri::command]
pub fn ack_update_safety(
    window: tauri::Window,
    state: tauri::State<Updates>,
    attempt: u64,
    dirty: bool,
    pending_writes: u32,
) {
    state
        .0
        .lock()
        .unwrap()
        .guard
        .ack(attempt, window.label(), dirty, pending_writes);
}
fn labels(app: &tauri::AppHandle) -> Vec<String> {
    app.webview_windows().keys().cloned().collect()
}
pub fn release_guard(app: &tauri::AppHandle, expected_attempt: u64, phase: &str, message: &str) {
    let queued = {
        let state = app.state::<Updates>();
        let mut s = state.0.lock().unwrap();
        let Some(queued) = s.finish_attempt(expected_attempt, phase, message) else {
            return;
        };
        let _ = app.emit(
            "update-release",
            Attempt {
                attempt: expected_attempt,
            },
        );
        publish(app, &s);
        queued
    };
    for path in queued {
        let _ = crate::spawn_reserved_window(app, path.as_deref());
    }
}
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> UpdateStatus {
    let attempt = {
        let state = app.state::<Updates>();
        let mut s = state.0.lock().unwrap();
        let Some(attempt) = s.prepare_install(labels(&app)) else {
            publish(&app, &s);
            return s.status.clone();
        };
        publish(&app, &s);
        attempt
    };
    if app.emit("update-prepare", Attempt { attempt }).is_err() {
        release_guard(
            &app,
            attempt,
            "downloaded",
            "Could not contact every window. Retry installation.",
        );
        return get_status(&app);
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let (ready, failed) = {
            let state = app.state::<Updates>();
            let s = state.0.lock().unwrap();
            (
                s.guard.ready(),
                s.guard.failed || !s.guard.preparing || s.guard.attempt != attempt,
            )
        };
        if failed || Instant::now() >= deadline {
            release_guard(
                &app,
                attempt,
                "downloaded",
                "Save changes in all windows before installing, then retry.",
            );
            return get_status(&app);
        }
        if ready {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    let payload = {
        let state = app.state::<Updates>();
        let mut s = state.0.lock().unwrap();
        if s.guard.attempt == attempt && s.opening_windows == 0 && s.guard.commit(&labels(&app)) {
            s.status.phase = "installing".into();
            publish(&app, &s);
            Some((s.update.clone().unwrap(), s.bytes.take().unwrap()))
        } else {
            None
        }
    };
    let Some((update, bytes)) = payload else {
        release_guard(
            &app,
            attempt,
            "downloaded",
            "Windows changed during preparation. Retry installation.",
        );
        return get_status(&app);
    };
    let result = tauri::async_runtime::spawn_blocking(move || update.install(&bytes)).await;
    match result {
        Ok(Ok(())) => {
            #[cfg(target_os = "macos")]
            app.restart();
        }
        _ => {
            release_guard(
                &app,
                attempt,
                "error",
                "Update installation failed before restart. Download again to retry.",
            );
            return get_status(&app);
        }
    }
    get_status(&app)
}
fn get_status(app: &tauri::AppHandle) -> UpdateStatus {
    app.state::<Updates>().0.lock().unwrap().status.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn feed() -> serde_json::Value {
        serde_json::json!({"version":"0.2.0-alpha.2","notes":"notes","platforms":{
            "windows-x86_64":{"url":"https://github.com/ehartye/slate/releases/download/v0.2.0-alpha.2/a.exe","signature":"sig"},
            "darwin-x86_64":{"url":"https://github.com/ehartye/slate/releases/download/v0.2.0-alpha.2/a.app.tar.gz","signature":"sig"},
            "darwin-aarch64":{"url":"https://github.com/ehartye/slate/releases/download/v0.2.0-alpha.2/a.app.tar.gz","signature":"sig"}
        }})
    }
    #[test]
    fn native_contract_rejects_ineligible_versions_and_unsafe_payloads() {
        assert!(validate_manifest(&feed()).is_ok());
        for version in [
            "0.2.0",
            "0.2.0-beta.1",
            "0.2.0-rc.1",
            "0.2.0-dev.1",
            "0.2.0-alpha.0",
            "0.2.0-alpha.01",
            "0.2.0-alpha.1+meta",
        ] {
            assert!(preview_version(version).is_err());
        }
        assert!(
            preview_version("0.2.0-alpha.10").unwrap() > preview_version("0.2.0-alpha.9").unwrap()
        );
        for url in [
            "https://evil.test/a.exe",
            "https://github.com/ehartye/slate/releases/download/v0.2.0-alpha.2/../a.exe",
            "https://github.com/ehartye/slate/releases/download/v0.2.0-alpha.1/a.exe",
        ] {
            let mut v = feed();
            v["platforms"]["windows-x86_64"]["url"] = url.into();
            assert!(validate_manifest(&v).is_err());
        }
        let mut v = feed();
        v["platforms"]["darwin-aarch64"]["signature"] = "other".into();
        assert!(validate_manifest(&v).is_err());
        let mut v = feed();
        v["pub_date"] = "2026-02-30T00:00:00Z".into();
        assert!(validate_manifest(&v).is_err());
        let mut v = feed();
        v["pub_date"] = serde_json::Value::Null;
        assert!(validate_manifest(&v).is_err());
    }
    #[test]
    fn verification_rejects_production_identity_and_non_loopback() {
        assert!(!verification_allowed(
            "com.hartye.slate",
            "http://127.0.0.1:8123/preview.json"
        ));
        assert!(!verification_allowed(
            "com.hartye.slate.test",
            "http://evil.test/preview.json"
        ));
        assert!(verification_allowed(
            "com.hartye.slate.test",
            "http://127.0.0.1:8123/preview.json"
        ));
    }
    #[test]
    fn open_routing_aborts_prepare_queues_and_rejects_after_commit() {
        let mut service = Service::default();
        assert_eq!(service.reserve_open(None).unwrap(), true);
        assert_eq!(service.opening_windows, 1);
        service.opening_windows = 0;
        let attempt = service.guard.begin(vec!["main".into()]).unwrap();
        assert_eq!(service.reserve_open(Some("file.md".into())).unwrap(), false);
        assert!(service.guard.failed);
        assert_eq!(service.queued_opens, vec![Some("file.md".into())]);
        service.guard.ack(attempt, "main", false, 0);
        assert!(!service.guard.commit(&["main".into()]));
        service.guard.abort();
        let attempt = service.guard.begin(vec!["main".into()]).unwrap();
        service.guard.ack(attempt, "main", false, 0);
        assert!(service.guard.commit(&["main".into()]));
        assert!(service.reserve_open(None).is_err());
    }
    #[test]
    fn feed_probe_distinguishes_absent_network_and_invalid_metadata() {
        use std::io::{Read, Write};
        fn serve(status: &str, body: &str) -> String {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let endpoint = format!("http://{}/preview.json", listener.local_addr().unwrap());
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0; 2048];
                let _ = stream.read(&mut request);
                stream.write_all(response.as_bytes()).unwrap();
            });
            endpoint
        }
        assert_eq!(
            tauri::async_runtime::block_on(probe_feed(&serve("404 Not Found", ""))),
            Ok(false)
        );
        assert_eq!(
            tauri::async_runtime::block_on(probe_feed(&serve("200 OK", "garbage"))),
            Err(ProbeError::Invalid)
        );
        assert_eq!(
            tauri::async_runtime::block_on(probe_feed(&serve("503 Unavailable", ""))),
            Err(ProbeError::Network)
        );
        assert_eq!(
            tauri::async_runtime::block_on(probe_feed(&serve("200 OK", &feed().to_string()))),
            Ok(true)
        );
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        assert_eq!(
            tauri::async_runtime::block_on(probe_feed(&endpoint)),
            Err(ProbeError::Network)
        );
    }
    #[test]
    fn install_failure_is_atomic_and_queued_windows_reserve_before_release() {
        let mut service = Service::default();
        service.status.phase = "downloaded".into();
        service.bytes = Some(vec![1]);
        let attempt = service.prepare_install(vec!["main".into()]).unwrap();
        service.reserve_open(Some("queued.md".into())).unwrap();
        let queued = service
            .finish_attempt(attempt, "error", "install failed")
            .unwrap();
        assert!(!service.guard.frozen());
        assert_eq!(service.status.phase, "error");
        assert_eq!(queued, vec![Some("queued.md".into())]);
        assert_eq!(service.opening_windows, 1);
        assert!(service.prepare_install(vec!["main".into()]).is_none());
        // A new check may begin after the atomic failure, and an old completion
        // must never overwrite that busy state or release a later guard.
        service.status.phase = "checking".into();
        assert!(service
            .finish_attempt(attempt, "error", "old failure")
            .is_none());
        assert_eq!(service.status.phase, "checking");
        service.opening_windows -= 1;
        service.status.phase = "downloaded".into();
        let next = service
            .prepare_install(vec!["main".into(), "slate-1".into()])
            .unwrap();
        assert!(service.finish_attempt(attempt, "error", "stale").is_none());
        assert_eq!(service.guard.attempt, next);
        assert!(service.guard.frozen());
    }
    #[test]
    fn normal_quit_is_blocked_during_prepare_and_install_but_restart_is_allowed() {
        let mut service = Service::default();
        assert!(!service.should_prevent_exit(None));
        let attempt = service.guard.begin(vec!["main".into()]).unwrap();
        assert!(service.should_prevent_exit(None));
        assert!(service.should_prevent_exit(Some(0)));
        service.guard.ack(attempt, "main", false, 0);
        assert!(service.guard.commit(&["main".into()]));
        assert!(service.should_prevent_exit(None));
        assert!(!service.should_prevent_exit(Some(tauri::RESTART_EXIT_CODE)));
        service.guard.abort();
        assert!(!service.should_prevent_exit(None));
    }
}
