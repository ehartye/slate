//! Build-time source provenance. No runtime filesystem or Git dependency.
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, PartialEq, Eq)]
pub struct Identity {
    pub commit: Option<String>,
    pub tracked_state: &'static str,
    pub inputs: Vec<PathBuf>,
}

fn git(root: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let result = Command::new("git")
        .arg("--no-optional-locks")
        .args(args)
        .current_dir(root)
        // Ambient Git plumbing must not redirect a build into another index/tree.
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .output()
        .ok()?;
    result.status.success().then_some(result.stdout)
}

fn line(bytes: Vec<u8>) -> Option<String> {
    String::from_utf8(bytes)
        .ok()
        .map(|s| s.trim_end_matches(['\r', '\n']).to_owned())
}

pub fn collect(root: &Path) -> Identity {
    collect_with(root, |args| git(root, args))
}

fn collect_with(root: &Path, run: impl Fn(&[&str]) -> Option<Vec<u8>>) -> Identity {
    let mut info = Identity {
        commit: None,
        tracked_state: "unknown",
        inputs: vec![],
    };
    // In archives, watch the missing marker so creating a checkout is detected.
    // For linked worktrees it is a pointer file; never recursively watch .git.
    let marker = root.join(".git");
    if !marker.is_dir() {
        info.inputs.push(marker);
    }
    let Some(top) = run(&["rev-parse", "--show-toplevel"]).and_then(line) else {
        return info;
    };
    if root
        .canonicalize()
        .ok()
        .zip(Path::new(&top).canonicalize().ok())
        .map(|(a, b)| a == b)
        != Some(true)
    {
        return info;
    }

    for name in ["HEAD", "index", "packed-refs"] {
        if let Some(path) = run(&["rev-parse", "--git-path", name]).and_then(line) {
            info.inputs.push(root.join(path));
        }
    }
    if let Some(reference) = run(&["symbolic-ref", "-q", "HEAD"]).and_then(line) {
        if let Some(path) = run(&["rev-parse", "--git-path", &reference]).and_then(line) {
            info.inputs.push(root.join(path));
        }
    }
    if let Some(paths) = run(&["ls-files", "--cached", "-z"]) {
        for bytes in paths.split(|b| *b == 0).filter(|p| !p.is_empty()) {
            // Git paths are byte strings on Unix, UTF-8 on Windows.
            #[cfg(unix)]
            let path = {
                use std::os::unix::ffi::OsStrExt;
                PathBuf::from(std::ffi::OsStr::from_bytes(bytes))
            };
            #[cfg(not(unix))]
            let path = match std::str::from_utf8(bytes) {
                Ok(p) => PathBuf::from(p),
                Err(_) => continue,
            };
            info.inputs.push(root.join(path));
        }
    }
    let Some(commit) = run(&["rev-parse", "--verify", "HEAD^{commit}"])
        .and_then(line)
        .filter(|id| matches!(id.len(), 40 | 64) && id.bytes().all(|b| b.is_ascii_hexdigit()))
    else {
        return info;
    };
    info.commit = Some(commit);
    if let Some(status) = run(&[
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=no",
        "--ignore-submodules=untracked",
    ]) {
        info.tracked_state = if status.is_empty() {
            "clean"
        } else {
            "modified"
        };
    }
    info
}

pub fn emit(root: &Path) {
    let info = collect(root);
    println!("cargo:rerun-if-env-changed=PATH");
    println!("cargo:rerun-if-env-changed=PATHEXT");
    // Watch candidates as well as PATH: installing/removing Git in an unchanged
    // PATH must also invalidate metadata. Missing candidates may rerun cheaply.
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let executable = if cfg!(windows) { "git.exe" } else { "git" };
            watch(&dir.join(executable));
        }
    }
    for input in info.inputs {
        watch(&input);
    }
    println!(
        "cargo:rustc-env=SLATE_BUILD_COMMIT={}",
        info.commit.as_deref().unwrap_or("")
    );
    println!(
        "cargo:rustc-env=SLATE_BUILD_TRACKED_STATE={}",
        info.tracked_state
    );
}

fn watch(path: &Path) {
    // Cargo directives are line-based and cannot represent newlines in paths.
    // A missing sentinel forces fresh probes rather than silently stale data.
    let text = path.to_string_lossy();
    if text.contains(['\n', '\r']) {
        println!("cargo:rerun-if-changed=slate-build-identity-unrepresentable-path");
    } else {
        println!("cargo:rerun-if-changed={text}");
    }
}

#[cfg(test)]
mod failure_tests {
    use super::*;

    #[test]
    fn unavailable_git_and_failed_status_are_unknown() {
        let root = std::env::current_dir().unwrap();
        assert_eq!(collect_with(&root, |_| None).tracked_state, "unknown");
        for id in ["a".repeat(40), "b".repeat(64)] {
            let info = collect_with(&root, |args| match args[0] {
                "status" => None,
                "rev-parse" if args[1] == "--show-toplevel" => {
                    Some(root.to_string_lossy().as_bytes().to_vec())
                }
                "rev-parse" if args[1] == "--verify" => Some(id.as_bytes().to_vec()),
                _ => None,
            });
            assert_eq!(info.commit, Some(id));
            assert_eq!(info.tracked_state, "unknown");
        }
    }

    #[test]
    fn malformed_commit_never_implies_clean() {
        let root = std::env::current_dir().unwrap();
        for id in ["abc", &"z".repeat(40), &"a".repeat(41)] {
            let info = collect_with(&root, |args| match args[0] {
                "rev-parse" if args[1] == "--show-toplevel" => {
                    Some(root.to_string_lossy().as_bytes().to_vec())
                }
                "rev-parse" if args[1] == "--verify" => Some(id.as_bytes().to_vec()),
                _ => Some(Vec::new()),
            });
            assert_eq!(info.commit, None);
            assert_eq!(info.tracked_state, "unknown");
        }
    }
}
