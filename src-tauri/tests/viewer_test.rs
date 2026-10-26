mod common;

use std::fs;

use cherrypick_masive_lib::git::Git;
use cherrypick_masive_lib::history::{commit_files, file_diff, file_versions, FileChange};
use common::Fixture;

const DATE: &str = "2026-02-01T10:00:00";

fn commit_all(f: &Fixture, message: &str) -> String {
    f.git(&["add", "-A"]);
    common::git_env(&f.repo, &["commit", "-q", "-m", message], &[("GIT_AUTHOR_DATE", DATE), ("GIT_COMMITTER_DATE", DATE)]);
    f.git(&["rev-parse", "HEAD"])
}

fn change<'a>(files: &'a [FileChange], path: &str) -> &'a FileChange {
    files.iter().find(|c| c.path == path).unwrap_or_else(|| panic!("{path} not in {files:?}"))
}

#[test]
fn lists_files_with_status_renames_and_counts() {
    let f = Fixture::new();
    fs::write(f.repo.join("keep.txt"), "a\nb\nc\n").unwrap();
    fs::write(f.repo.join("gone.txt"), "x\n").unwrap();
    fs::write(f.repo.join("old name.cs"), (1..=20).map(|i| format!("line {i}\n")).collect::<String>()).unwrap();
    commit_all(&f, "setup");
    fs::write(f.repo.join("keep.txt"), "a\nB\nc\nd\n").unwrap();
    fs::remove_file(f.repo.join("gone.txt")).unwrap();
    fs::create_dir_all(f.repo.join("src/deep")).unwrap();
    fs::write(f.repo.join("src/deep/new.ts"), "export {}\n").unwrap();
    fs::remove_file(f.repo.join("old name.cs")).unwrap();
    fs::write(f.repo.join("src/new name.cs"), (1..=20).map(|i| format!("line {i}\n")).collect::<String>() + "line 21\n").unwrap();
    fs::write(f.repo.join("logo.bin"), [0u8, 1, 2, 0, 255]).unwrap();
    let hash = commit_all(&f, "changes");

    let files = commit_files(&Git::new(&f.repo), &hash).unwrap();

    assert_eq!(files.len(), 5, "{files:?}");
    let keep = change(&files, "keep.txt");
    assert_eq!((keep.status.as_str(), keep.additions, keep.deletions), ("modified", Some(2), Some(1)));
    assert_eq!(change(&files, "gone.txt").status, "deleted");
    assert_eq!(change(&files, "src/deep/new.ts").status, "added");
    let renamed = change(&files, "src/new name.cs");
    assert_eq!(renamed.status, "renamed");
    assert_eq!(renamed.old_path.as_deref(), Some("old name.cs"));
    assert_eq!((renamed.additions, renamed.deletions), (Some(1), Some(0)));
    let bin = change(&files, "logo.bin");
    assert_eq!((bin.status.as_str(), bin.additions), ("added", None));
}

#[test]
fn root_commit_files_are_listed_as_added() {
    let f = Fixture::new();
    let root = f.git(&["rev-list", "--max-parents=0", "HEAD"]);
    let files = commit_files(&Git::new(&f.repo), &root).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!((files[0].path.as_str(), files[0].status.as_str()), ("base.txt", "added"));
    let diff = file_diff(&Git::new(&f.repo), &root, "base.txt", None, false).unwrap();
    assert!(diff.patch.contains("+base"), "{}", diff.patch);
}

#[test]
fn diffs_one_file_and_can_ignore_whitespace() {
    let f = Fixture::new();
    fs::write(f.repo.join("a.cs"), "class A {\n  int x;\n}\n").unwrap();
    fs::write(f.repo.join("b.cs"), "b\n").unwrap();
    commit_all(&f, "setup");
    fs::write(f.repo.join("a.cs"), "class A {\n    int x;\n  int y;\n}\n").unwrap();
    fs::write(f.repo.join("b.cs"), "b2\n").unwrap();
    let hash = commit_all(&f, "indent and add");
    let git = Git::new(&f.repo);

    let diff = file_diff(&git, &hash, "a.cs", None, false).unwrap();
    assert!(diff.patch.contains("-  int x;") && diff.patch.contains("+    int x;"), "{}", diff.patch);
    assert!(!diff.patch.contains("b.cs"), "only the requested file");

    let ws = file_diff(&git, &hash, "a.cs", None, true).unwrap();
    assert!(!ws.patch.contains("-  int x;"), "{}", ws.patch);
    assert!(ws.patch.contains("+  int y;"), "{}", ws.patch);
}

#[test]
fn diffs_a_renamed_file_against_its_old_path() {
    let f = Fixture::new();
    fs::write(f.repo.join("old.cs"), (1..=20).map(|i| format!("line {i}\n")).collect::<String>()).unwrap();
    commit_all(&f, "setup");
    fs::remove_file(f.repo.join("old.cs")).unwrap();
    fs::write(f.repo.join("new.cs"), (1..=20).map(|i| format!("line {i}\n")).collect::<String>() + "line 21\n").unwrap();
    let hash = commit_all(&f, "rename");

    let diff = file_diff(&Git::new(&f.repo), &hash, "new.cs", Some("old.cs"), false).unwrap();

    assert!(diff.patch.contains("rename from old.cs"), "{}", diff.patch);
    assert!(diff.patch.contains("+line 21") && !diff.patch.contains("-line 1\n"), "{}", diff.patch);
}

#[test]
fn reads_both_versions_of_a_file() {
    let f = Fixture::new();
    fs::write(f.repo.join("a.txt"), "old\n").unwrap();
    commit_all(&f, "setup");
    fs::write(f.repo.join("a.txt"), "new\n").unwrap();
    fs::write(f.repo.join("added.txt"), "fresh\n").unwrap();
    fs::write(f.repo.join("logo.bin"), [0u8, 1, 2, 0, 255]).unwrap();
    let hash = commit_all(&f, "edit");
    let git = Git::new(&f.repo);

    let v = file_versions(&git, &hash, "a.txt", None).unwrap();
    assert_eq!((v.old.as_deref(), v.new.as_deref(), v.binary, v.too_large), (Some("old\n"), Some("new\n"), false, false));
    let added = file_versions(&git, &hash, "added.txt", None).unwrap();
    assert_eq!((added.old, added.new.as_deref()), (None, Some("fresh\n")));
    let bin = file_versions(&git, &hash, "logo.bin", None).unwrap();
    assert!(bin.binary);
    assert_eq!((bin.old, bin.new), (None, None));
}

#[test]
fn rejects_paths_that_look_like_options() {
    let f = Fixture::new();
    let hash = f.git(&["rev-parse", "HEAD"]);
    let git = Git::new(&f.repo);
    assert!(file_diff(&git, &hash, "--output=x.txt", None, false).unwrap().patch.is_empty());
    assert!(!f.repo.join("x.txt").exists());
    assert!(file_versions(&git, "--help", "base.txt", None).is_err());
}

#[test]
fn whole_commit_patch_honours_ignore_whitespace() {
    use cherrypick_masive_lib::history::commit_patch;
    let f = Fixture::new();
    fs::write(f.repo.join("a.cs"), "class A {\n  int x;\n}\n").unwrap();
    fs::write(f.repo.join("b.cs"), "b\n").unwrap();
    commit_all(&f, "setup");
    fs::write(f.repo.join("a.cs"), "class A {\n    int x;\n}\n").unwrap();
    fs::write(f.repo.join("b.cs"), "b2\n").unwrap();
    let hash = commit_all(&f, "indent only in a");
    let git = Git::new(&f.repo);

    let all = commit_patch(&git, &hash, false).unwrap();
    assert!(all.patch.contains("+    int x;") && all.patch.contains("+b2"), "{}", all.patch);
    let ws = commit_patch(&git, &hash, true).unwrap();
    assert!(!ws.patch.contains("+    int x;") && ws.patch.contains("+b2"), "{}", ws.patch);
}
