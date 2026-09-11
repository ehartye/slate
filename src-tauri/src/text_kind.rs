//! Deciding whether a file is one Slate can open as text.
//!
//! Extension allow-lists can only ever name the formats someone thought of;
//! they say nothing about `Makefile`, `LICENSE`, `.gitignore`, or the next
//! config format. This module answers the question by looking at the bytes
//! instead, so the listing covers anything actually readable.
//!
//! "Readable" here means exactly what `read_file` in `lib.rs` can open:
//! `std::fs::read_to_string`, which is UTF-8 or an error. Anything this
//! module accepts must therefore be valid UTF-8 — a UTF-16 file is text to a
//! human but would fail to open, so listing it would only offer the user a
//! file that errors when clicked.

use std::io::Read;
use std::path::Path;

/// How much of a file to look at. Enough for a confident verdict without
/// reading whole files during a directory listing; binaries almost always
/// reveal themselves in the first few bytes.
const SAMPLE_LEN: usize = 8192;

/// Whether `sample` — the leading bytes of a file — looks like UTF-8 text.
///
/// A NUL byte is the giveaway for binary content: it cannot appear in valid
/// UTF-8, and real binary formats are full of them.
///
/// The sample is a prefix of the file, so it can slice a multi-byte character
/// in half at the boundary. That truncation is an artifact of sampling rather
/// than evidence about the file, so it is accepted; invalid UTF-8 anywhere
/// earlier is a genuine verdict of "not text".
pub fn sample_looks_like_text(sample: &[u8]) -> bool {
    if sample.contains(&0) {
        return false;
    }
    match std::str::from_utf8(sample) {
        Ok(_) => true,
        // `error_len() == None` means the sample ended mid-character, which is
        // the cut described above. `Some(_)` is a genuinely invalid sequence.
        Err(e) => e.error_len().is_none(),
    }
}

/// Whether the file at `path` can be opened as text, by sampling its leading
/// bytes. Unreadable files (permissions, a race with deletion) are reported
/// as not-text so the listing silently omits what it could not open.
pub fn looks_like_text(path: &Path) -> bool {
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut buf = [0u8; SAMPLE_LEN];
    let mut filled = 0;
    // One `read` may return fewer bytes than asked for without being at EOF,
    // so fill the buffer until it is full or the file ends.
    loop {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => {
                filled += n;
                if filled == buf.len() {
                    break;
                }
            }
            Err(_) => return false,
        }
    }
    sample_looks_like_text(&buf[..filled])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_file_is_text() {
        assert!(sample_looks_like_text(b""));
    }

    #[test]
    fn ascii_is_text() {
        assert!(sample_looks_like_text(b"#!/bin/sh\necho hi\n"));
    }

    #[test]
    fn multibyte_utf8_is_text() {
        assert!(sample_looks_like_text("héllo — wörld ✓".as_bytes()));
    }

    #[test]
    fn nul_byte_is_not_text() {
        assert!(!sample_looks_like_text(b"MZ\x90\x00\x03\x00"));
    }

    #[test]
    fn nul_late_in_sample_is_not_text() {
        let mut sample = b"plausible text for a while".to_vec();
        sample.push(0);
        assert!(!sample_looks_like_text(&sample));
    }

    #[test]
    fn character_cut_by_the_sample_boundary_is_still_text() {
        // "é" is two bytes; keep only the first, as an 8KB cut would.
        let full = "café".as_bytes();
        let truncated = &full[..full.len() - 1];
        assert!(sample_looks_like_text(truncated));
    }

    #[test]
    fn invalid_utf8_before_the_end_is_not_text() {
        // A stray continuation byte followed by more content is a real error,
        // not the boundary cut above.
        assert!(!sample_looks_like_text(b"abc\xffdef ghi jkl"));
    }

    #[test]
    fn utf16_is_not_text_because_read_file_cannot_open_it() {
        // UTF-16LE "hi" — readable to a human, but `read_to_string` rejects it.
        assert!(!sample_looks_like_text(b"h\x00i\x00"));
    }

    #[test]
    fn reads_a_real_file_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let text = dir.path().join("Makefile");
        std::fs::write(&text, "all:\n\tcargo build\n").unwrap();
        assert!(looks_like_text(&text));

        let binary = dir.path().join("blob.bin");
        std::fs::write(&binary, [0x00, 0x01, 0x02, 0xff]).unwrap();
        assert!(!looks_like_text(&binary));
    }

    #[test]
    fn missing_file_is_not_text() {
        assert!(!looks_like_text(Path::new("definitely-not-here.xyz")));
    }
}
