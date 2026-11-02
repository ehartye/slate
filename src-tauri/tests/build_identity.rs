#[path = "../build_identity.rs"]
mod identity;

use std::{fs, path::Path, process::Command};
use tempfile::TempDir;

fn git(root: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap().trim().to_owned()
}

fn init(root: &Path) {
    git(root, &["init", "-q"]);
    git(root, &["config", "user.email", "fixture@example.invalid"]);
    git(root, &["config", "user.name", "Build fixture"]);
}

fn commit(root: &Path) -> String {
    git(root, &["add", "-A"]);
    git(root, &["commit", "-qm", "fixture"]);
    git(root, &["rev-parse", "HEAD"])
}

#[test]
fn real_git_states_and_repository_boundaries() {
    let temp = TempDir::new().unwrap();
    let root = temp.path();
    assert_eq!(identity::collect(root).commit, None);
    init(root);
    assert_eq!(identity::collect(root).tracked_state, "unknown");
    fs::write(root.join("tracked.txt"), "initial").unwrap();
    let head = commit(root);
    assert_eq!(
        identity::collect(root).commit.as_deref(),
        Some(head.as_str())
    );
    assert_eq!(identity::collect(root).tracked_state, "clean");
    fs::write(root.join("untracked.txt"), "ignored by identity").unwrap();
    assert_eq!(identity::collect(root).tracked_state, "clean");
    fs::write(root.join("tracked.txt"), "modified").unwrap();
    assert_eq!(identity::collect(root).tracked_state, "modified");
    git(root, &["add", "tracked.txt"]);
    assert_eq!(identity::collect(root).tracked_state, "modified");
    git(root, &["reset", "--hard", "HEAD"]);
    git(root, &["add", "untracked.txt"]);
    assert_eq!(identity::collect(root).tracked_state, "modified");
    git(root, &["reset", "--hard", "HEAD"]);
    fs::remove_file(root.join("tracked.txt")).unwrap();
    assert_eq!(identity::collect(root).tracked_state, "modified");
    git(root, &["add", "-u"]);
    assert_eq!(identity::collect(root).tracked_state, "modified");
    fs::create_dir(root.join("archive")).unwrap();
    let nested = identity::collect(&root.join("archive"));
    assert_eq!(nested.commit, None);
    assert_eq!(nested.tracked_state, "unknown");
}

fn cargo_probe(root: &Path, expected_commit: Option<&str>, expected_state: &str, no_git: bool) {
    let mut cmd = Command::new(env!("CARGO"));
    cmd.current_dir(root).args(["run", "--offline", "--quiet"]);
    // Cargo and rustc are absolute; retain Windows linker/system paths while
    // excluding Git. This is local to the child, never global process state.
    if no_git {
        let filtered: Vec<_> = std::env::split_paths(&std::env::var_os("PATH").unwrap())
            .filter(|dir| {
                !dir.join(if cfg!(windows) { "git.exe" } else { "git" })
                    .is_file()
            })
            .collect();
        cmd.env("PATH", std::env::join_paths(filtered).unwrap());
    }
    let out = cmd.output().unwrap();
    assert!(
        out.status.success(),
        "cargo probe: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    let actual = String::from_utf8(out.stdout).unwrap();
    let expected = format!("{}|{}", expected_commit.unwrap_or(""), expected_state);
    assert_eq!(actual.trim(), expected);
    println!(
        "{}: {}",
        if no_git {
            "Git unavailable"
        } else {
            "Git available"
        },
        expected
    );
}

fn create_probe(root: &Path) {
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(
        root.join("Cargo.toml"),
        "[package]\nname='identity-probe'\nversion='0.0.0'\nedition='2021'\n[workspace]\n",
    )
    .unwrap();
    fs::write(root.join(".gitignore"), "/target/\n").unwrap();
    fs::write(
        root.join("build_identity.rs"),
        include_str!("../build_identity.rs"),
    )
    .unwrap();
    fs::write(root.join("build.rs"), "mod build_identity; fn main() { build_identity::emit(std::path::Path::new(&std::env::var(\"CARGO_MANIFEST_DIR\").unwrap())); }").unwrap();
    fs::write(root.join("src/main.rs"), "fn main() { println!(\"{}|{}\", env!(\"SLATE_BUILD_COMMIT\"), env!(\"SLATE_BUILD_TRACKED_STATE\")); }").unwrap();
    fs::write(root.join("frontend.txt"), "initial").unwrap();
    // Generate the dependency-free lock before committing so it isn't noise.
    let out = Command::new(env!("CARGO"))
        .current_dir(root)
        .args(["generate-lockfile", "--offline"])
        .output()
        .unwrap();
    assert!(out.status.success());
}

#[test]
fn incremental_cargo_normal_detached_worktree_and_archive() {
    let temp = TempDir::new().unwrap();
    let root = temp.path().join("checkout");
    fs::create_dir(&root).unwrap();
    create_probe(&root);
    init(&root);
    let first = commit(&root);
    cargo_probe(&root, Some(&first), "clean", false);
    fs::write(root.join("untracked.txt"), "untracked").unwrap();
    cargo_probe(&root, Some(&first), "clean", false);
    fs::write(root.join("frontend.txt"), "edited frontend").unwrap();
    cargo_probe(&root, Some(&first), "modified", false);
    git(&root, &["add", "frontend.txt"]);
    cargo_probe(&root, Some(&first), "modified", false);
    git(&root, &["reset", "--hard", "HEAD"]);
    cargo_probe(&root, Some(&first), "clean", false);
    git(&root, &["add", "untracked.txt"]);
    cargo_probe(&root, Some(&first), "modified", false);
    let second = commit(&root);
    cargo_probe(&root, Some(&second), "clean", false);
    git(&root, &["rm", "frontend.txt"]);
    cargo_probe(&root, Some(&second), "modified", false);
    git(&root, &["reset", "--hard", "HEAD"]);
    cargo_probe(&root, Some(&second), "clean", false);
    cargo_probe(&root, None, "unknown", true);
    cargo_probe(&root, Some(&second), "clean", false);
    git(&root, &["checkout", "--detach", &first]);
    cargo_probe(&root, Some(&first), "clean", false);
    let linked = temp.path().join("linked");
    git(
        &root,
        &[
            "worktree",
            "add",
            "--detach",
            linked.to_str().unwrap(),
            &second,
        ],
    );
    cargo_probe(&linked, Some(&second), "clean", false);
    fs::write(linked.join("frontend.txt"), "linked edit").unwrap();
    cargo_probe(&linked, Some(&second), "modified", false);
    git(&linked, &["reset", "--hard", "HEAD"]);
    cargo_probe(&linked, Some(&second), "clean", false);
    git(&linked, &["checkout", "--detach", &first]);
    cargo_probe(&linked, Some(&first), "clean", false);
    let archive = temp.path().join("archive");
    create_probe(&archive);
    cargo_probe(&archive, None, "unknown", false);
}
