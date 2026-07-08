use std::path::{Path, PathBuf};

/// Return absolute paths of `.md`/`.markdown` files directly in `dir`, sorted by file name.
pub fn markdown_files_in(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_file() {
            continue;
        }
        let is_md = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| {
                let e = e.to_ascii_lowercase();
                e == "md" || e == "markdown"
            })
            .unwrap_or(false);
        if is_md {
            out.push(path);
        }
    }
    out.sort_by_key(|p| p.file_name().map(|n| n.to_ascii_lowercase()));
    Ok(out)
}

/// Return absolute paths of immediate subdirectories of `dir`, sorted by
/// name, skipping hidden (dot-prefixed) directories like `.git`.
pub fn subfolders_in(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        let hidden = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with('.'))
            .unwrap_or(false);
        if hidden {
            continue;
        }
        out.push(path);
    }
    out.sort_by_key(|p| p.file_name().map(|n| n.to_ascii_lowercase()));
    Ok(out)
}

/// Join `href` onto `base_file`'s parent dir and canonicalize, but only if the
/// result exists as a file. Shared groundwork for the link/image resolvers below.
fn resolve_relative_existing(base_file: &Path, href: &str) -> Option<PathBuf> {
    let parent = base_file.parent()?;
    let joined = parent.join(href);
    let resolved = strip_verbatim(joined.canonicalize().ok()?);
    if resolved.is_file() {
        Some(resolved)
    } else {
        None
    }
}

fn has_extension(path: &Path, exts: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| exts.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

const MD_EXTENSIONS: &[&str] = &["md", "markdown"];

/// Image extensions supported for inline preview/export. Kept in sync with
/// `image_mime` below — every extension here must have a mapped MIME type.
pub const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"];

/// Resolve a relative link `href` (from a markdown file at `base_file`) to an
/// absolute path, but only if it points at an existing `.md`/`.markdown` file.
/// Returns `None` for missing files, non-markdown targets, or absolute/URL hrefs.
pub fn resolve_md_link(base_file: &Path, href: &str) -> Option<PathBuf> {
    let resolved = resolve_relative_existing(base_file, href)?;
    has_extension(&resolved, MD_EXTENSIONS).then_some(resolved)
}

/// Resolve a relative image `href` (from a markdown file at `base_file`) to an
/// absolute path, but only if it points at an existing supported image file.
pub fn resolve_image_link(base_file: &Path, href: &str) -> Option<PathBuf> {
    let resolved = resolve_relative_existing(base_file, href)?;
    has_extension(&resolved, IMAGE_EXTENSIONS).then_some(resolved)
}

/// MIME type for an image path, by extension. Falls back to a generic octet
/// stream for anything outside `IMAGE_EXTENSIONS` (shouldn't happen given
/// callers filter through `resolve_image_link` first).
pub fn image_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// Drop Windows' `\\?\` extended-length / verbatim prefix so the result matches
/// the plain `C:\...` paths used elsewhere in the app. No-op on other platforms
/// and for paths without the prefix.
fn strip_verbatim(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{}", rest));
    }
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    p
}

/// Extract `/* @name X */` value, or "Untitled".
pub fn parse_theme_name(css: &str) -> String {
    parse_header(css, "@name").unwrap_or_else(|| "Untitled".to_string())
}

/// Extract `/* @mode light|dark */`, defaulting to "light".
pub fn parse_mode(css: &str) -> String {
    match parse_header(css, "@mode").as_deref() {
        Some("dark") => "dark".to_string(),
        _ => "light".to_string(),
    }
}

/// Extract a CSS custom-property value, e.g. `parse_css_var(css, "--accent")`.
/// Returns the trimmed value (without trailing `;`) or empty string if absent.
pub fn parse_css_var(css: &str, name: &str) -> String {
    let needle = format!("{}:", name);
    for line in css.lines() {
        if let Some(idx) = line.find(&needle) {
            let rest = &line[idx + needle.len()..];
            let val = rest.split(';').next().unwrap_or("").trim();
            if !val.is_empty() {
                return val.to_string();
            }
        }
    }
    String::new()
}

fn parse_header(css: &str, key: &str) -> Option<String> {
    for line in css.lines().take(10) {
        if let Some(idx) = line.find(key) {
            let rest = line[idx + key.len()..].trim();
            let val = rest.trim_end_matches("*/").trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn lists_only_markdown_sorted() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "x").unwrap();
        fs::write(dir.path().join("a.MD"), "x").unwrap();
        fs::write(dir.path().join("note.markdown"), "x").unwrap();
        fs::write(dir.path().join("ignore.txt"), "x").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let files = markdown_files_in(dir.path()).unwrap();
        let names: Vec<String> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["a.MD", "b.md", "note.markdown"]);
    }

    #[test]
    fn lists_only_visible_subdirs_sorted() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("Zeta")).unwrap();
        fs::create_dir(dir.path().join("alpha")).unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join("note.md"), "x").unwrap();

        let dirs = subfolders_in(dir.path()).unwrap();
        let names: Vec<String> = dirs
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["alpha", "Zeta"]);
    }

    #[test]
    fn resolves_existing_sibling_md_link() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("index.md");
        fs::write(&base, "x").unwrap();
        fs::write(dir.path().join("other.md"), "y").unwrap();

        let got = resolve_md_link(&base, "other.md").unwrap();
        let want = strip_verbatim(dir.path().join("other.md").canonicalize().unwrap());
        assert_eq!(got, want);
        // No verbatim prefix leaks through.
        assert!(!got.to_string_lossy().contains(r"\\?\"));
        // A leading ./ resolves the same way.
        assert_eq!(resolve_md_link(&base, "./other.md").unwrap(), want);
    }

    #[test]
    fn resolves_parent_dir_md_link() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("up.md"), "y").unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let base = sub.join("index.md");
        fs::write(&base, "x").unwrap();

        let got = resolve_md_link(&base, "../up.md").unwrap();
        let want = strip_verbatim(dir.path().join("up.md").canonicalize().unwrap());
        assert_eq!(got, want);
    }

    #[test]
    fn resolves_existing_sibling_image() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("index.md");
        fs::write(&base, "x").unwrap();
        fs::write(dir.path().join("diagram.PNG"), "y").unwrap();

        let got = resolve_image_link(&base, "diagram.PNG").unwrap();
        let want = strip_verbatim(dir.path().join("diagram.PNG").canonicalize().unwrap());
        assert_eq!(got, want);
    }

    #[test]
    fn rejects_missing_and_non_image_images() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("index.md");
        fs::write(&base, "x").unwrap();
        fs::write(dir.path().join("notes.md"), "y").unwrap();

        assert!(resolve_image_link(&base, "missing.png").is_none());
        assert!(resolve_image_link(&base, "notes.md").is_none());
    }

    #[test]
    fn maps_image_mime_types() {
        assert_eq!(image_mime(Path::new("a.png")), "image/png");
        assert_eq!(image_mime(Path::new("a.JPG")), "image/jpeg");
        assert_eq!(image_mime(Path::new("a.jpeg")), "image/jpeg");
        assert_eq!(image_mime(Path::new("a.gif")), "image/gif");
        assert_eq!(image_mime(Path::new("a.webp")), "image/webp");
        assert_eq!(image_mime(Path::new("a.bmp")), "image/bmp");
        assert_eq!(image_mime(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(image_mime(Path::new("a.ico")), "image/x-icon");
        assert_eq!(image_mime(Path::new("a.xyz")), "application/octet-stream");
    }

    #[test]
    fn rejects_missing_and_non_markdown_links() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join("index.md");
        fs::write(&base, "x").unwrap();
        fs::write(dir.path().join("data.txt"), "y").unwrap();

        assert!(resolve_md_link(&base, "nope.md").is_none());
        assert!(resolve_md_link(&base, "data.txt").is_none());
    }

    #[test]
    fn parses_theme_name_and_mode() {
        let css = "/* @name Aurora */\n/* @mode dark */\n:root{ --accent: #4fd1c5; }";
        assert_eq!(parse_theme_name(css), "Aurora");
        assert_eq!(parse_mode(css), "dark");
        assert_eq!(parse_css_var(css, "--accent"), "#4fd1c5");
    }

    #[test]
    fn theme_defaults_when_absent() {
        assert_eq!(parse_theme_name(":root{}"), "Untitled");
        assert_eq!(parse_mode(":root{}"), "light");
        assert_eq!(parse_css_var(":root{}", "--accent"), "");
    }
}
