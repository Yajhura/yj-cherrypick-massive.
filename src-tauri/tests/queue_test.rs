mod common;

use std::fs;
use std::path::Path;

use cherrypick_masive_lib::cherry_pick::{abort, continue_pick, SessionState, SessionStore};
use cherrypick_masive_lib::queue::{
    advance_queue, current_queue, dismiss_queue, start_queue, Outcome, QueueRequest, QueueStore, QueueTarget,
};
use common::Fixture;

/// `develop` has two commits; `release/1` and `release/2` (pushed) only have `main`.
/// `release/1` changed a.txt, so picking develop's edit of a.txt conflicts there.
struct Setup {
    f: Fixture,
    edit_a: String,
    add_b: String,
}

fn setup() -> Setup {
    let f = Fixture::new();
    f.commit("a.txt", "line\n", "add a", "Ana", "2026-01-02T10:00:00");
    f.git(&["push", "-q", "origin", "main"]);
    f.new_branch("develop", "main");
    let edit_a = f.commit("a.txt", "develop\n", "JIRA-1 edit a", "Ana", "2026-02-01T10:00:00");
    let add_b = f.commit("b.txt", "b\n", "JIRA-2 add b", "Ana", "2026-02-02T10:00:00");
    f.new_branch("release/1", "main");
    f.commit("a.txt", "release\n", "release edit a", "Ana", "2026-02-01T11:00:00");
    f.git(&["push", "-q", "origin", "release/1"]);
    f.new_branch("release/2", "main");
    f.git(&["push", "-q", "origin", "release/2"]);
    f.checkout("develop");
    Setup { f, edit_a, add_b }
}

fn stores(f: &Fixture) -> (QueueStore, SessionStore) {
    (QueueStore::new(f.dir.path().join("queue.json")), SessionStore::new(f.session_file()))
}

fn request(f: &Fixture, hashes: &[&String], targets: &[(&str, &str)]) -> QueueRequest {
    QueueRequest {
        repo: f.repo_str(),
        hashes: hashes.iter().map(|h| h.to_string()).collect(),
        targets: targets.iter().map(|(t, b)| QueueTarget { target: t.to_string(), branch: b.to_string() }).collect(),
    }
}

fn outcomes(q: &cherrypick_masive_lib::queue::Queue) -> Vec<Outcome> {
    q.entries.iter().map(|e| e.outcome.clone()).collect()
}

#[test]
fn runs_every_target_in_order_when_nothing_conflicts() {
    let Setup { f, add_b, .. } = setup();
    let (qs, ss) = stores(&f);

    let state = start_queue(&qs, &ss, &f.worktrees(), request(&f, &[&add_b], &[("origin/release/1", "cp/r1"), ("origin/release/2", "cp/r2")])).unwrap();

    assert!(state.session.is_none(), "no target waits on the user");
    assert_eq!(outcomes(&state.queue), [Outcome::Pushed, Outcome::Pushed]);
    assert_eq!(state.queue.entries[0].applied, 1);
    assert_eq!(f.remote_log("cp/r1")[0], "JIRA-2 add b");
    assert_eq!(f.remote_log("cp/r2")[0], "JIRA-2 add b");
    assert!(ss.load().unwrap().is_none(), "finished sessions are cleared between targets");
    assert_eq!(current_queue(&qs, &ss).unwrap().unwrap().queue, state.queue, "persisted");
}

#[test]
fn a_conflict_pauses_only_its_target_and_the_queue_resumes_after_it() {
    let Setup { f, edit_a, add_b } = setup();
    let (qs, ss) = stores(&f);

    let state = start_queue(&qs, &ss, &f.worktrees(), request(&f, &[&edit_a, &add_b], &[("origin/release/1", "cp/r1"), ("origin/release/2", "cp/r2")])).unwrap();

    let session = state.session.expect("paused on the conflict");
    assert!(matches!(session.state, SessionState::Conflict { .. }));
    assert_eq!(outcomes(&state.queue), [Outcome::Running, Outcome::Pending]);
    // Nothing to advance while the target still needs the user.
    let same = advance_queue(&qs, &ss, &f.worktrees()).unwrap();
    assert_eq!(outcomes(&same.queue), [Outcome::Running, Outcome::Pending]);

    fs::write(Path::new(&session.worktree).join("a.txt"), "resolved\n").unwrap();
    continue_pick(&ss).unwrap();
    let state = advance_queue(&qs, &ss, &f.worktrees()).unwrap();

    assert!(state.session.is_none());
    assert_eq!(outcomes(&state.queue), [Outcome::Pushed, Outcome::Pushed]);
    assert_eq!(state.queue.entries[0].applied, 2);
    assert_eq!(f.remote_log("cp/r2")[..2], ["JIRA-2 add b", "JIRA-1 edit a"]);
}

#[test]
fn aborting_a_target_records_it_and_the_rest_still_run() {
    let Setup { f, edit_a, .. } = setup();
    let (qs, ss) = stores(&f);
    start_queue(&qs, &ss, &f.worktrees(), request(&f, &[&edit_a], &[("origin/release/1", "cp/r1"), ("origin/release/2", "cp/r2")])).unwrap();

    abort(&ss).unwrap();
    let state = advance_queue(&qs, &ss, &f.worktrees()).unwrap();

    assert_eq!(outcomes(&state.queue), [Outcome::Aborted, Outcome::Pushed]);
    assert_eq!(f.git(&["branch", "--list", "cp/r1"]), "", "aborted branch removed");
    assert_eq!(f.remote_log("cp/r2")[0], "JIRA-1 edit a");
}

#[test]
fn a_target_that_already_has_everything_is_nothing_to_push() {
    let Setup { f, add_b, .. } = setup();
    let (qs, ss) = stores(&f);
    f.checkout("release/2");
    f.git(&["cherry-pick", &add_b]);
    f.git(&["push", "-q", "origin", "release/2"]);
    f.checkout("develop");

    let state = start_queue(&qs, &ss, &f.worktrees(), request(&f, &[&add_b], &[("origin/release/2", "cp/r2"), ("origin/release/1", "cp/r1")])).unwrap();

    assert_eq!(outcomes(&state.queue), [Outcome::NothingApplied, Outcome::Pushed]);
}

#[test]
fn every_target_and_name_is_checked_before_anything_runs() {
    let Setup { f, add_b, .. } = setup();
    let (qs, ss) = stores(&f);
    f.git(&["push", "-q", "origin", "develop:refs/heads/cp/taken"]);
    f.git(&["fetch", "-q", "origin"]);
    let run = |targets: &[(&str, &str)]| start_queue(&qs, &ss, &f.worktrees(), request(&f, &[&add_b], targets)).unwrap_err().to_string();

    assert_eq!(run(&[]), "choose at least one target branch");
    assert_eq!(run(&[("origin/release/1", "cp/x"), ("origin/release/1", "cp/y")]), "target 'origin/release/1' is listed twice");
    assert_eq!(run(&[("origin/release/1", "cp/x"), ("origin/release/2", "cp/x")]), "branch 'cp/x' is used for two targets");
    assert_eq!(run(&[("origin/release/1", "cp/ok"), ("origin/release/2", "cp/taken")]), "branch 'cp/taken' already exists on the remote");
    assert_eq!(run(&[("origin/nope", "cp/ok")]), "unknown target branch: origin/nope");

    assert!(current_queue(&qs, &ss).unwrap().is_none(), "nothing saved");
    assert_eq!(f.git(&["branch", "--list", "cp/ok"]), "", "no branch created");
}

#[test]
fn a_running_queue_blocks_a_new_one_and_can_only_be_dismissed_when_done() {
    let Setup { f, edit_a, add_b } = setup();
    let (qs, ss) = stores(&f);
    start_queue(&qs, &ss, &f.worktrees(), request(&f, &[&edit_a], &[("origin/release/1", "cp/r1")])).unwrap();

    let err = start_queue(&qs, &ss, &f.worktrees(), request(&f, &[&add_b], &[("origin/release/2", "cp/r2")])).unwrap_err();
    assert_eq!(err.to_string(), "another cherry-pick queue is in progress");
    assert_eq!(dismiss_queue(&qs).unwrap_err().to_string(), "the queue still has targets to run");

    abort(&ss).unwrap();
    advance_queue(&qs, &ss, &f.worktrees()).unwrap();
    dismiss_queue(&qs).unwrap();
    assert!(current_queue(&qs, &ss).unwrap().is_none());
}
