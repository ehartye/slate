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

/// Extract `/* @name X */` value, or "Untitled".
pub fn parse_theme_name(css: &str) -> String {
    parse_header(css, "@name").unwrap_or_else(|| "Untitled".to_string())
}

/// Extract `/* @mermaid dark|default */`, defaulting to "default".
pub fn parse_mermaid_mode(css: &str) -> String {
    match parse_header(css, "@mermaid").as_deref() {
        Some("dark") => "dark".to_string(),
        _ => "default".to_string(),
    }
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
    fn parses_theme_name_and_mermaid() {
        let css = "/* @name Midnight */\n/* @mermaid dark */\n:root{}";
        assert_eq!(parse_theme_name(css), "Midnight");
        assert_eq!(parse_mermaid_mode(css), "dark");
    }

    #[test]
    fn theme_defaults_when_absent() {
        assert_eq!(parse_theme_name(":root{}"), "Untitled");
        assert_eq!(parse_mermaid_mode(":root{}"), "default");
    }
}
