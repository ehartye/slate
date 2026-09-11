//! Listing the files and folders Slate shows for a folder.
//!
//! Split from `files.rs`, which had grown to cover listing, link resolution,
//! MIME lookup and theme parsing at once. Everything here answers one
//! question: given a directory, what should the sidebar show?

use crate::files::{has_extension, is_pdf, IMAGE_EXTENSIONS, MD_EXTENSIONS, PDF_EXTENSIONS, TEXT_EXTENSIONS};
use std::path::{Path, PathBuf};

/// Whether `path` should be treated as hidden.
///
/// Two conventions have to agree here, because Slate runs on both: a leading
/// dot (how Unix-like systems mark hidden files, and how Explorer-style
/// browsers conventionally show them) and, on Windows, the actual
/// `FILE_ATTRIBUTE_HIDDEN` bit. Checking only the name would list files the
/// user has explicitly hidden in Explorer, which have no leading dot.
fn is_hidden(path: &Path) -> bool {
    is_dotfile(path) || has_hidden_attribute(path)
}

fn is_dotfile(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

/// Windows marks hidden files with an attribute rather than the name, so the
/// dotfile check alone misses them.
#[cfg(windows)]
fn has_hidden_attribute(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    std::fs::metadata(path)
        .map(|m| m.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0)
        .unwrap_or(false)
}

/// Elsewhere the leading dot is the whole convention.
#[cfg(not(windows))]
fn has_hidden_attribute(_path: &Path) -> bool {
    false
}

/// Shared directory scan for the file-listing functions below: files only,
/// matching `exts`, optionally skipping dotfiles, sorted by name.
fn files_with_extensions_in(
    dir: &Path,
    exts: &[&str],
    show_hidden: bool,
) -> std::io::Result<Vec<PathBuf>> {
    let mut out: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_file() {
            continue;
        }
        if !show_hidden && is_hidden(&path) {
            continue;
        }
        if has_extension(&path, exts) {
            out.push(path);
        }
    }
    sort_by_file_name(&mut out);
    Ok(out)
}

/// Case-insensitive sort by file name, shared by every listing so they agree
/// on ordering.
fn sort_by_file_name(paths: &mut [PathBuf]) {
    paths.sort_by_key(|p| p.file_name().map(|n| n.to_ascii_lowercase()));
}

/// Return absolute paths of `.md`/`.markdown` files directly in `dir`, sorted
/// by file name. Dotfiles are skipped unless `show_hidden` is set.
pub fn markdown_files_in(dir: &Path, show_hidden: bool) -> std::io::Result<Vec<PathBuf>> {
    files_with_extensions_in(dir, MD_EXTENSIONS, show_hidden)
}

/// Return absolute paths of every file directly in `dir` that Slate can open
/// as text — the listing used when "Markdown only" mode is off. Hidden files
/// are skipped unless `show_hidden` is set.
///
/// Unlike the extension-keyed listings, this one falls back to reading the
/// file, so it covers `Makefile`, `LICENSE`, `.gitignore` and any format
/// nobody has added to `TEXT_EXTENSIONS` yet.
pub fn text_files_in(dir: &Path, show_hidden: bool) -> std::io::Result<Vec<PathBuf>> {
    let mut out: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_file() {
            continue;
        }
        if !show_hidden && is_hidden(&path) {
            continue;
        }
        if is_openable_text(&path) {
            out.push(path);
        }
    }
    sort_by_file_name(&mut out);
    Ok(out)
}

/// Whether `path` belongs in the text listing.
///
/// Order matters. Images and PDFs are excluded first because they have their
/// own surfaces in the app, and because an SVG would otherwise pass the
/// content check — it is valid UTF-8, and still an image.
///
/// A known text extension then answers without touching the disk, and without
/// consulting content: an empty `.rs` file is still a source file the user
/// expects to see, and sniffing it would say "empty", not "Rust".
fn is_openable_text(path: &Path) -> bool {
    if has_extension(path, IMAGE_EXTENSIONS) || is_pdf(path) {
        return false;
    }
    if has_extension(path, TEXT_EXTENSIONS) {
        return true;
    }
    crate::text_kind::looks_like_text(path)
}

/// Return absolute paths of immediate subdirectories of `dir`, sorted by
/// name. Dotfiles (e.g. `.git`) are skipped unless `show_hidden` is set.
pub fn subfolders_in(dir: &Path, show_hidden: bool) -> std::io::Result<Vec<PathBuf>> {
    let mut out: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        if !show_hidden && is_hidden(&path) {
            continue;
        }
        out.push(path);
    }
    sort_by_file_name(&mut out);
    Ok(out)
}

/// Return absolute paths of PDF files directly in `dir`, sorted by file name
/// — listed alongside `text_files_in` when Markdown-only mode is off (PDF is
/// part of the same "non-markdown" browsing surface, just not text). Dotfiles
/// are skipped unless `show_hidden` is set.
pub fn pdf_files_in(dir: &Path, show_hidden: bool) -> std::io::Result<Vec<PathBuf>> {
    files_with_extensions_in(dir, PDF_EXTENSIONS, show_hidden)
}

/// Return absolute paths of image files directly in `dir`, sorted by file
/// name — listed alongside `text_files_in` when Markdown-only mode is off, on
/// the same footing as PDFs: part of the browsing surface, viewed rather than
/// edited. Hidden files are skipped unless `show_hidden` is set.
pub fn image_files_in(dir: &Path, show_hidden: bool) -> std::io::Result<Vec<PathBuf>> {
    files_with_extensions_in(dir, IMAGE_EXTENSIONS, show_hidden)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// File names of `paths`, in order — the assertion shape every listing
    /// test wants.
    fn names_of(paths: &[PathBuf]) -> Vec<String> {
        paths
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect()
    }
    #[test]
    fn lists_only_markdown_sorted() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "x").unwrap();
        fs::write(dir.path().join("a.MD"), "x").unwrap();
        fs::write(dir.path().join("note.markdown"), "x").unwrap();
        fs::write(dir.path().join("ignore.txt"), "x").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let files = markdown_files_in(dir.path(), false).unwrap();
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

        let dirs = subfolders_in(dir.path(), false).unwrap();
        let names: Vec<String> = dirs
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["alpha", "Zeta"]);
    }

    #[test]
    fn show_hidden_reveals_dotfiles_and_dotdirs() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".env"), "x").unwrap();
        fs::write(dir.path().join(".hidden.md"), "x").unwrap();
        fs::write(dir.path().join("visible.md"), "x").unwrap();

        let dirs = subfolders_in(dir.path(), true).unwrap();
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].file_name().unwrap(), ".git");

        let md = markdown_files_in(dir.path(), true).unwrap();
        let names: Vec<String> = md
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec![".hidden.md", "visible.md"]);
    }

    #[test]
    fn lists_broad_text_extensions_sorted() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("notes.md"), "x").unwrap();
        fs::write(dir.path().join("main.rs"), "x").unwrap();
        fs::write(dir.path().join("config.YAML"), "x").unwrap();
        fs::write(dir.path().join("data.json"), "x").unwrap();
        fs::write(dir.path().join("photo.png"), "x").unwrap();
        fs::write(dir.path().join(".hidden.txt"), "x").unwrap();

        let text = text_files_in(dir.path(), false).unwrap();
        let names: Vec<String> = text
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["config.YAML", "data.json", "main.rs", "notes.md"]);

        let with_hidden = text_files_in(dir.path(), true).unwrap();
        assert_eq!(with_hidden.len(), 5);
    }

    #[test]
    fn lists_pdf_files_sorted_separately_from_text() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("report.PDF"), "x").unwrap();
        fs::write(dir.path().join("appendix.pdf"), "x").unwrap();
        fs::write(dir.path().join("notes.md"), "x").unwrap();
        fs::write(dir.path().join(".hidden.pdf"), "x").unwrap();

        let pdfs = pdf_files_in(dir.path(), false).unwrap();
        let names: Vec<String> = pdfs
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["appendix.pdf", "report.PDF"]);

        // text_files_in doesn't pick up pdfs — they're listed separately and
        // merged by the caller (list_text_files in lib.rs).
        let text = text_files_in(dir.path(), false).unwrap();
        assert!(text.iter().all(|p| !is_pdf(p)));

        let with_hidden = pdf_files_in(dir.path(), true).unwrap();
        assert_eq!(with_hidden.len(), 3);
    }

    #[test]
    fn lists_extensionless_text_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("Makefile"), "all:
	cargo build
").unwrap();
        fs::write(dir.path().join("LICENSE"), "MIT License
").unwrap();
        fs::write(dir.path().join("Dockerfile"), "FROM rust:1
").unwrap();
        fs::write(dir.path().join("notes.txt"), "x").unwrap();

        let names = names_of(&text_files_in(dir.path(), false).unwrap());
        assert_eq!(names, vec!["Dockerfile", "LICENSE", "Makefile", "notes.txt"]);
    }

    #[test]
    fn lists_dotfiles_only_when_show_hidden() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".gitignore"), "target
").unwrap();
        fs::write(dir.path().join(".env"), "KEY=value
").unwrap();
        fs::write(dir.path().join("visible.txt"), "x").unwrap();

        assert_eq!(names_of(&text_files_in(dir.path(), false).unwrap()), vec!["visible.txt"]);
        assert_eq!(
            names_of(&text_files_in(dir.path(), true).unwrap()),
            vec![".env", ".gitignore", "visible.txt"]
        );
    }

    #[test]
    fn skips_binary_files_without_a_known_extension() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("program"), [0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01]).unwrap();
        fs::write(dir.path().join("readme"), "hello
").unwrap();

        assert_eq!(names_of(&text_files_in(dir.path(), false).unwrap()), vec!["readme"]);
    }

    #[test]
    fn excludes_images_and_pdfs_from_the_text_listing() {
        let dir = tempfile::tempdir().unwrap();
        // SVG is the trap: valid UTF-8 text, but it belongs to the image
        // surface, not the text listing.
        fs::write(dir.path().join("logo.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>").unwrap();
        fs::write(dir.path().join("shot.png"), [0x89, 0x50, 0x4e, 0x47]).unwrap();
        fs::write(dir.path().join("paper.pdf"), "%PDF-1.7
").unwrap();
        fs::write(dir.path().join("notes.md"), "# hi").unwrap();

        assert_eq!(names_of(&text_files_in(dir.path(), false).unwrap()), vec!["notes.md"]);
    }

    #[test]
    fn known_text_extension_lists_even_when_empty() {
        // The fast path must not depend on content: an empty .rs file is still
        // a source file the user expects to see.
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("empty.rs"), "").unwrap();
        assert_eq!(names_of(&text_files_in(dir.path(), false).unwrap()), vec!["empty.rs"]);
    }

    #[cfg(windows)]
    #[test]
    fn windows_hidden_attribute_counts_as_hidden() {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;

        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("plain.txt"), "x").unwrap();
        // Create with the hidden attribute set - the name has no leading dot,
        // so only the attribute marks it hidden.
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .attributes(FILE_ATTRIBUTE_HIDDEN)
            .open(dir.path().join("secret.txt"))
            .unwrap();

        assert_eq!(names_of(&text_files_in(dir.path(), false).unwrap()), vec!["plain.txt"]);
        assert_eq!(
            names_of(&text_files_in(dir.path(), true).unwrap()),
            vec!["plain.txt", "secret.txt"]
        );
    }

    #[test]
    fn lists_image_files_sorted_separately_from_text() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.PNG"), [0x89, 0x50]).unwrap();
        fs::write(dir.path().join("a.jpg"), [0xff, 0xd8]).unwrap();
        fs::write(dir.path().join("logo.svg"), "<svg/>").unwrap();
        fs::write(dir.path().join("notes.md"), "# hi").unwrap();

        assert_eq!(names_of(&image_files_in(dir.path(), false).unwrap()), vec!["a.jpg", "b.PNG", "logo.svg"]);
        // The text listing stays disjoint from it.
        assert_eq!(names_of(&text_files_in(dir.path(), false).unwrap()), vec!["notes.md"]);
    }

    #[test]
    fn hides_hidden_images_unless_asked() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".secret.png"), [0x89]).unwrap();
        fs::write(dir.path().join("shown.png"), [0x89]).unwrap();

        assert_eq!(names_of(&image_files_in(dir.path(), false).unwrap()), vec!["shown.png"]);
        assert_eq!(names_of(&image_files_in(dir.path(), true).unwrap()), vec![".secret.png", "shown.png"]);
    }
}
