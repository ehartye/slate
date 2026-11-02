mod build_identity;

fn main() {
    let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    build_identity::emit(&manifest.parent().unwrap().to_path_buf());
    println!("cargo:rerun-if-changed=updater-public-key.txt");
    let public_key =
        std::fs::read_to_string(manifest.join("updater-public-key.txt")).unwrap_or_default();
    assert!(
        public_key
            .trim()
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b)),
        "invalid updater public-key handoff"
    );
    println!(
        "cargo:rustc-env=SLATE_UPDATER_PUBLIC_KEY={}",
        public_key.trim()
    );
    for name in [
        "SLATE_UPDATER_TEST_ENDPOINT",
        "SLATE_UPDATER_TEST_PUBLIC_KEY",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
        let value = if std::env::var_os("CARGO_FEATURE_UPDATER_VERIFICATION").is_some() {
            std::env::var(name)
                .expect("verification builds require explicit test endpoint and public key")
        } else {
            String::new()
        };
        assert!(
            !value.contains(['\n', '\r']),
            "invalid verification setting"
        );
        println!("cargo:rustc-env={name}={value}");
    }
    tauri_build::build()
}
