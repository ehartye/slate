mod build_identity;

fn main() {
    let manifest = std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap());
    build_identity::emit(&manifest.parent().unwrap().to_path_buf());
    tauri_build::build()
}
