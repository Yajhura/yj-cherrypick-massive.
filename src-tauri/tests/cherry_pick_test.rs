mod common;

use std::fs;
use std::path::Path;

use cherrypick_masive_lib::cherry_pick::{
    abort, continue_pick, dismiss, retry_push, skip, start, PickStatus, Session, SessionState, SessionStore,
    StartRequest,
};
use common::Fixture;

const DATE: &str = "2026-02-01T10:00:00";

/// `develop` has three independent commits; `release` (pushed) only has `main`.
struct Setup {
    f: Fixture,
    c1: String,
    c2: String,
    c3: String,
}

fn setup() -> Setup {
    let f = Fixture::new();
    f.new_branch("develop", "main");
    let c1 = f.commit("a.txt", "a\n", "JIRA-1 add a", "Ana", "2026-02-01T10:00:00");
    let c2 = f.commit("b.txt", "b\n", "JIRA-2 add b", "Ana", "2026-02-02T10:00:00");
    let c3 = f.commit("c.txt", "c\n", "JIRA-3 add c", "Ana", "2026-02-03T10:00:00");
    f.new_branch("release", "main");
    f.git(&["push", "-q", "origin", "release"]);
    Setup { f, c1, c2, c3 }
}

fn store(f: &Fixture) -> SessionStore {
    SessionStore::new(f.session_file())
}

fn request(f: &Fixture, hashes: &[&String]) -> StartRequest {
    StartRequest {
        repo: f.repo_str(),
        target: "origin/release".into(),
        branch: "cherry-pick/release/test".into(),
        hashes: hashes.iter().map(|h| h.to_string()).collect(),
    }
}

fn statuses(s: &Session) -> Vec<PickStatus> {
    s.items.iter().map(|i| i.status).collect()
}

fn assert_pushed(s: &Session) {
    assert_eq!(
        s.state,
        SessionState::Completed { pushed: true, push_error: None, nothing_applied: false }
    );
}

#[test]
fn applies_commits_oldest_first_with_trailer_pushes_and_keeps_working_copy() {
    let Setup { f, c1, c2, c3 } = setup();
    // Local work in progress must survive the whole run.
    f.checkout("develop");
    fs::write(f.repo.join("a.txt"), "dirty\n").unwrap();

    let s = start(&store(&f), &f.worktrees(), request(&f, &[&c3, &c1, &c2])).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Applied; 3]);
    let hashes: Vec<&str> = s.items.iter().map(|i| i.hash.as_str()).collect();
    assert_eq!(hashes, [c1.as_str(), c2.as_str(), c3.as_str()]);
    assert_eq!(
        f.remote_log("cherry-pick/release/test"),
        ["JIRA-3 add c", "JIRA-2 add b", "JIRA-1 add a", "initial commit"]
    );
    let body = common::git(&f.remote, &["log", "-1", "--format=%B", "cherry-pick/release/test"]);
    assert!(body.contains(&format!("(cherry picked from commit {c3})")));

    assert!(!Path::new(&s.worktree).exists(), "worktree removed after push");
    assert_eq!(f.git(&["branch", "--show-current"]), "develop");
    assert_eq!(fs::read_to_string(f.repo.join("a.txt")).unwrap(), "dirty\n");
    assert!(s.is_finished());
}

#[test]
fn empty_commit_is_skipped_and_reported() {
    let Setup { f, c1, c2, .. } = setup();
    // release already has c1's change under another hash.
    f.git(&["cherry-pick", &c1]);
    f.git(&["push", "-q", "origin", "release"]);

    let s = start(&store(&f), &f.worktrees(), request(&f, &[&c1, &c2])).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Empty, PickStatus::Applied]);
    assert_eq!(s.items[0].new_hash, None);
}

#[test]
fn nothing_applied_does_not_push_and_deletes_branch() {
    let Setup { f, c1, .. } = setup();
    f.git(&["cherry-pick", &c1]);
    f.git(&["push", "-q", "origin", "release"]);

    let s = start(&store(&f), &f.worktrees(), request(&f, &[&c1])).unwrap();

    assert_eq!(
        s.state,
        SessionState::Completed { pushed: false, push_error: None, nothing_applied: true }
    );
    assert!(f.git(&["branch", "--list", "cherry-pick/release/test"]).is_empty());
    assert!(!Path::new(&s.worktree).exists());
}

/// `release` changes a.txt so picking `develop`'s edit of a.txt conflicts.
fn conflict_setup() -> (Fixture, String, String) {
    let f = Fixture::new();
    f.commit("a.txt", "line\n", "add a", "Ana", DATE);
    f.git(&["push", "-q", "origin", "main"]);
    f.new_branch("develop", "main");
    let conflicting = f.commit("a.txt", "develop\n", "JIRA-1 edit a", "Ana", "2026-02-02T10:00:00");
    let clean = f.commit("b.txt", "b\n", "JIRA-2 add b", "Ana", "2026-02-03T10:00:00");
    f.new_branch("release", "main");
    f.commit("a.txt", "release\n", "release edit a", "Ana", "2026-02-02T11:00:00");
    f.git(&["push", "-q", "origin", "release"]);
    (f, conflicting, clean)
}

#[test]
fn conflict_pauses_and_continue_requires_resolution() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);

    let s = start(&store, &f.worktrees(), request(&f, &[&conflicting, &clean])).unwrap();
    assert_eq!(s.state, SessionState::Conflict { files: vec!["a.txt".into()] });
    assert_eq!(s.current, 0);

    // Still has conflict markers.
    let err = continue_pick(&store).unwrap_err();
    assert!(err.to_string().contains("unresolved conflict markers in: a.txt"));

    // The paused session survives a restart: a fresh store reads it from disk.
    let reloaded = SessionStore::new(f.session_file()).load().unwrap().unwrap();
    assert_eq!(reloaded, s);

    fs::write(Path::new(&s.worktree).join("a.txt"), "resolved\n").unwrap();
    let s = continue_pick(&SessionStore::new(f.session_file())).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Applied, PickStatus::Applied]);
    let content = common::git(&f.remote, &["show", "cherry-pick/release/test:a.txt"]);
    assert_eq!(content, "resolved");
    let body = common::git(&f.remote, &["log", "-1", "--skip=1", "--format=%B", "cherry-pick/release/test"]);
    assert!(body.contains(&format!("(cherry picked from commit {conflicting})")));
}

#[test]
fn resolving_to_target_content_counts_as_empty() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);
    let s = start(&store, &f.worktrees(), request(&f, &[&conflicting, &clean])).unwrap();

    fs::write(Path::new(&s.worktree).join("a.txt"), "release\n").unwrap();
    let s = continue_pick(&store).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Empty, PickStatus::Applied]);
}

#[test]
fn skip_on_conflict_continues_with_the_rest() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);
    start(&store, &f.worktrees(), request(&f, &[&conflicting, &clean])).unwrap();

    let s = skip(&store).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Skipped, PickStatus::Applied]);
    assert_eq!(f.remote_log("cherry-pick/release/test")[0], "JIRA-2 add b");
}

#[test]
fn abort_removes_worktree_branch_and_session() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);
    let s = start(&store, &f.worktrees(), request(&f, &[&conflicting, &clean])).unwrap();

    let aborted = abort(&store).unwrap();

    assert_eq!(aborted.state, SessionState::Aborted);
    assert!(aborted.warnings.is_empty(), "{:?}", aborted.warnings);
    assert!(!Path::new(&s.worktree).exists());
    assert!(f.git(&["branch", "--list", "cherry-pick/release/test"]).is_empty());
    assert!(store.load().unwrap().is_none());
    assert!(continue_pick(&store).is_err());
}

#[test]
fn rejects_merge_commits_existing_branch_and_concurrent_session() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);
    f.checkout("develop");
    f.git(&["merge", "-q", "--no-ff", "-m", "merge release", "release", "-X", "ours"]);
    let merge = f.git(&["rev-parse", "HEAD"]);

    let err = start(&store, &f.worktrees(), request(&f, &[&merge])).unwrap_err();
    assert!(err.to_string().contains("merge commits cannot be cherry-picked"));

    f.git(&["branch", "cherry-pick/release/test", "main"]);
    let err = start(&store, &f.worktrees(), request(&f, &[&clean])).unwrap_err();
    assert!(err.to_string().contains("already exists"));
    f.git(&["branch", "-D", "cherry-pick/release/test"]);

    start(&store, &f.worktrees(), request(&f, &[&conflicting])).unwrap();
    let mut other = request(&f, &[&clean]);
    other.branch = "other".into();
    let err = start(&store, &f.worktrees(), other).unwrap_err();
    assert!(err.to_string().contains("another cherry-pick session is in progress"));
}

#[test]
fn push_failure_is_reported_and_can_be_retried() {
    let Setup { f, c1, .. } = setup();
    let store = store(&f);
    // A pre-receive hook that rejects every push.
    let hook = f.remote.join("hooks").join("pre-receive");
    fs::write(&hook, "#!/bin/sh\necho rejected >&2\nexit 1\n").unwrap();

    let s = start(&store, &f.worktrees(), request(&f, &[&c1])).unwrap();
    let SessionState::Completed { pushed: false, push_error: Some(error), .. } = &s.state else {
        panic!("expected push failure, got {:?}", s.state);
    };
    assert!(error.contains("rejected"));
    assert!(!s.is_finished());
    assert!(Path::new(&s.worktree).exists(), "worktree kept for retry");
    assert!(dismiss(&store).is_err());

    fs::remove_file(&hook).unwrap();
    let s = retry_push(&store).unwrap();
    assert_pushed(&s);
    assert_eq!(f.remote_log("cherry-pick/release/test")[0], "JIRA-1 add a");
    dismiss(&store).unwrap();
    assert!(store.load().unwrap().is_none());
}

#[test]
fn interleaved_merged_history_is_applied_by_date() {
    let f = Fixture::new();
    f.new_branch("develop", "main");
    let d1 = f.commit("d1.txt", "1\n", "d1", "Ana", "2026-02-01T10:00:00");
    f.new_branch("feature", "develop");
    let f2 = f.commit("f2.txt", "2\n", "f2", "Ana", "2026-02-02T10:00:00");
    let f4 = f.commit("f4.txt", "4\n", "f4", "Ana", "2026-02-04T10:00:00");
    f.checkout("develop");
    let d3 = f.commit("d3.txt", "3\n", "d3", "Ana", "2026-02-03T10:00:00");
    let d5 = f.commit("d5.txt", "5\n", "d5", "Ana", "2026-02-05T10:00:00");
    f.git(&["merge", "-q", "--no-ff", "-m", "merge feature", "feature"]);
    f.new_branch("release", "main");
    f.git(&["push", "-q", "origin", "release"]);

    let s = start(&store(&f), &f.worktrees(), request(&f, &[&d5, &f4, &d3, &f2, &d1])).unwrap();

    let subjects: Vec<&str> = s.items.iter().map(|i| i.subject.as_str()).collect();
    assert_eq!(subjects, ["d1", "f2", "d3", "f4", "d5"]);
    assert_pushed(&s);
}

#[test]
fn short_hashes_are_resolved_and_ordered() {
    let Setup { f, c1, c2, c3 } = setup();
    let short = |h: &String| h[..8].to_string();
    let (s1, s2, s3) = (short(&c1), short(&c2), short(&c3));

    let s = start(&store(&f), &f.worktrees(), request(&f, &[&s3, &s1, &s2])).unwrap();

    let hashes: Vec<&str> = s.items.iter().map(|i| i.hash.as_str()).collect();
    assert_eq!(hashes, [c1.as_str(), c2.as_str(), c3.as_str()]);
}

#[test]
fn pick_finished_in_the_ide_counts_as_applied_on_continue() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);
    let s = start(&store, &f.worktrees(), request(&f, &[&conflicting, &clean])).unwrap();
    let wt = Path::new(&s.worktree);
    fs::write(wt.join("a.txt"), "resolved\n").unwrap();
    common::git(wt, &["add", "a.txt"]);
    common::git_env(wt, &["cherry-pick", "--continue"], &[("GIT_EDITOR", "true")]);

    let s = continue_pick(&store).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Applied, PickStatus::Applied]);
    assert!(s.items[0].new_hash.is_some());
}

#[test]
fn skip_after_pick_finished_in_the_ide_reports_applied() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);
    let s = start(&store, &f.worktrees(), request(&f, &[&conflicting, &clean])).unwrap();
    let wt = Path::new(&s.worktree);
    fs::write(wt.join("a.txt"), "resolved\n").unwrap();
    common::git(wt, &["add", "a.txt"]);
    common::git_env(wt, &["cherry-pick", "--continue"], &[("GIT_EDITOR", "true")]);

    let s = skip(&store).unwrap();

    assert_eq!(statuses(&s), [PickStatus::Applied, PickStatus::Applied]);
}

#[test]
fn pick_aborted_in_the_ide_cannot_be_continued_but_can_be_skipped() {
    let (f, conflicting, clean) = conflict_setup();
    let store = store(&f);
    let s = start(&store, &f.worktrees(), request(&f, &[&conflicting, &clean])).unwrap();
    common::git(Path::new(&s.worktree), &["cherry-pick", "--abort"]);

    let err = continue_pick(&store).unwrap_err();
    assert!(err.to_string().contains("no cherry-pick in progress"), "{err}");

    let s = skip(&store).unwrap();
    assert_eq!(statuses(&s), [PickStatus::Skipped, PickStatus::Applied]);
}

#[test]
fn session_interrupted_while_running_can_be_resumed() {
    let Setup { f, c1, c2, .. } = setup();
    let store = store(&f);
    // Push fails so the worktree stays; then rewind the saved session to simulate a
    // crash after the first pick was committed but before the session was saved.
    let hook = f.remote.join("hooks").join("pre-receive");
    fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
    let mut s = start(&store, &f.worktrees(), request(&f, &[&c1, &c2])).unwrap();
    fs::remove_file(&hook).unwrap();
    let wt = Path::new(&s.worktree).to_path_buf();
    let first = s.items[0].new_hash.clone().unwrap();
    common::git(&wt, &["reset", "-q", "--hard", &first]);
    s.items[0].status = PickStatus::Pending;
    s.items[0].new_hash = None;
    s.items[1].status = PickStatus::Pending;
    s.items[1].new_hash = None;
    s.current = 0;
    s.state = SessionState::Running;
    s.pick_base = Some(common::git(&wt, &["rev-parse", "HEAD~1"]));
    store.save(&s).unwrap();

    let s = continue_pick(&store).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Applied, PickStatus::Applied]);
    assert_eq!(f.remote_log("cherry-pick/release/test"), ["JIRA-2 add b", "JIRA-1 add a", "initial commit"]);
}

#[test]
fn unreadable_session_file_can_be_dismissed() {
    let f = Fixture::new();
    let store = store(&f);
    fs::write(f.session_file(), "{ not json").unwrap();
    assert!(store.load().is_err());

    dismiss(&store).unwrap();

    assert!(store.load().unwrap().is_none());
}

#[test]
fn rejects_branch_that_already_exists_on_the_remote() {
    let Setup { f, c1, .. } = setup();
    f.git(&["push", "-q", "origin", "main:cherry-pick/release/test"]);

    let err = start(&store(&f), &f.worktrees(), request(&f, &[&c1])).unwrap_err();

    assert!(err.to_string().contains("already exists on the remote"), "{err}");
}

#[test]
fn pushes_when_the_remote_url_is_relative_to_the_repo() {
    let Setup { f, c1, .. } = setup();
    // A relative URL resolves against the main repository, not the worktree.
    f.git(&["remote", "set-url", "origin", "../remote.git"]);

    let s = start(&store(&f), &f.worktrees(), request(&f, &[&c1])).unwrap();

    assert_pushed(&s);
    assert_eq!(f.remote_log("cherry-pick/release/test")[0], "JIRA-1 add a");
}

#[test]
fn checks_out_targets_with_paths_longer_than_windows_max_path() {
    let Setup { f, c1, .. } = setup();
    // Committed through the index only, so the fixture never writes the long path itself.
    let deep = format!("{}/Repository.cs", ["SomeVeryLongProjectFolderName.Infrastructure"; 5].join("/"));
    f.checkout("release");
    fs::write(f.repo.join("blob.txt"), "x\n").unwrap();
    let blob = f.git(&["hash-object", "-w", "blob.txt"]);
    fs::remove_file(f.repo.join("blob.txt")).unwrap();
    f.git(&["update-index", "--add", "--cacheinfo", &format!("100644,{blob},{deep}")]);
    f.git(&["commit", "-q", "-m", "add deep file"]);
    f.git(&["push", "-q", "origin", "release"]);
    // The deep file is missing from disk; force past it.
    f.git(&["checkout", "-q", "-f", "develop"]);

    let s = start(&store(&f), &f.worktrees(), request(&f, &[&c1])).unwrap();

    assert_pushed(&s);
    assert_eq!(statuses(&s), [PickStatus::Applied]);
}

#[test]
fn failed_worktree_checkout_leaves_no_branch_behind() {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let Setup { f, c1, .. } = setup();
    // Windows cannot check out a path with ':', so `worktree add` fails after creating the branch.
    let blob = {
        fs::write(f.repo.join("blob.txt"), "x\n").unwrap();
        let blob = f.git(&["hash-object", "-w", "blob.txt"]);
        fs::remove_file(f.repo.join("blob.txt")).unwrap();
        blob
    };
    let mut mktree = Command::new("git")
        .current_dir(&f.repo)
        .arg("mktree")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    write!(mktree.stdin.take().unwrap(), "100644 blob {blob}\tbad:name.txt\n").unwrap();
    let tree = String::from_utf8(mktree.wait_with_output().unwrap().stdout).unwrap();
    let parent = f.git(&["rev-parse", "release"]);
    let commit = f.git(&["commit-tree", tree.trim(), "-p", &parent, "-m", "bad path"]);
    f.git(&["push", "-q", "-f", "origin", &format!("{commit}:refs/heads/release")]);

    let store = store(&f);
    assert!(start(&store, &f.worktrees(), request(&f, &[&c1])).is_err());

    assert_eq!(f.git(&["branch", "--list", "cherry-pick/release/test"]), "");
    assert!(store.load().unwrap().is_none(), "no session saved");
    assert_eq!(f.git(&["worktree", "list"]).lines().count(), 1);
}
