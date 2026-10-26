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
