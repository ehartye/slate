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
}
