mod common;

use cherrypick_masive_lib::commits::{list_commits, CommitQuery};
use cherrypick_masive_lib::git::Git;
use cherrypick_masive_lib::history::{commit_diff, commit_stat};
use cherrypick_masive_lib::repo::{list_branches, resolve_root};
use common::Fixture;

const PATTERN: &str = r"[A-Z]+-\d+";

fn query(source: &str) -> CommitQuery {
    CommitQuery {
        source: source.into(),
        ticket_pattern: PATTERN.into(),
        ..Default::default()
    }
}

/// develop: three commits by two authors plus a merge of `feature`.
fn develop_fixture() -> Fixture {
    let f = Fixture::new();
    f.new_branch("develop", "main");
    f.commit("a.txt", "a\n", "JIRA-1 add a", "Ana", "2026-02-01T10:00:00");
    f.commit("b.txt", "b\n", "JIRA-2 add b", "Bruno", "2026-02-10T10:00:00");
    f.new_branch("feature", "develop");
    f.commit("c.txt", "c\n", "OPS-7 add c\n\nrefs JIRA-2 and OPS-7", "Ana", "2026-03-01T10:00:00");
    f.checkout("develop");
    common::git_env(
        &f.repo,
        &["merge", "-q", "--no-ff", "-m", "Merge feature", "feature"],
        &[("GIT_AUTHOR_DATE", "2026-03-02T10:00:00"), ("GIT_COMMITTER_DATE", "2026-03-02T10:00:00")],
    );
    f
}

#[test]
fn lists_commits_with_tickets_and_merge_flag() {
    let f = develop_fixture();
    let list = list_commits(&Git::new(&f.repo), &query("develop")).unwrap();
    let subjects: Vec<&str> = list.commits.iter().map(|c| c.subject.as_str()).collect();
    assert_eq!(subjects, ["Merge feature", "OPS-7 add c", "JIRA-2 add b", "JIRA-1 add a", "initial commit"]);
    assert!(list.commits[0].is_merge);
    assert!(list.commits[1..].iter().all(|c| !c.is_merge));
    assert_eq!(list.commits[1].tickets, ["OPS-7", "JIRA-2"]);
    assert_eq!(list.commits[3].author_name, "Ana");
    assert_eq!(list.commits[3].short_hash.len(), 8);
    assert!(!list.truncated);
}

#[test]
fn filters_by_author_text_ticket_and_date_range() {
    let f = develop_fixture();
    let git = Git::new(&f.repo);
    let subjects = |q: CommitQuery| -> Vec<String> {
        list_commits(&git, &q).unwrap().commits.into_iter().map(|c| c.subject).collect()
    };

    assert_eq!(subjects(CommitQuery { author: Some("bruno".into()), ..query("develop") }), ["JIRA-2 add b"]);
    assert_eq!(subjects(CommitQuery { text: Some("ADD C".into()), ..query("develop") }), ["OPS-7 add c"]);
    // Exact ticket match: JIRA-2 appears in the subject of one commit and the body of another.
    assert_eq!(
        subjects(CommitQuery { ticket: Some("jira-2".into()), ..query("develop") }),
        ["OPS-7 add c", "JIRA-2 add b"]
    );
    assert!(subjects(CommitQuery { ticket: Some("JIRA-".into()), ..query("develop") }).is_empty());
    assert_eq!(
        subjects(CommitQuery {
            since: Some("2026-02-01".into()),
            until: Some("2026-02-10".into()),
            ..query("develop")
        }),
        ["JIRA-2 add b", "JIRA-1 add a"]
    );
}

#[test]
fn branch_diff_lists_only_missing_commits_and_flags_already_applied() {
    let f = develop_fixture();
    let c1 = f.git(&["log", "--format=%H", "--grep=JIRA-1", "develop"]);
    let c2 = f.git(&["log", "--format=%H", "--grep=JIRA-2 add b", "develop"]);
    f.new_branch("release", "main");
    // Same patch, no trailer: detected by patch-id.
    f.git(&["cherry-pick", &c1]);
    // Trailer but different content: detected by `cherry picked from commit`.
    f.git(&["cherry-pick", "-x", &c2]);
    std::fs::write(f.repo.join("b.txt"), "b changed\n").unwrap();
    f.git(&["commit", "-q", "-a", "--amend", "--no-edit"]);

    let list = list_commits(
        &Git::new(&f.repo),
        &CommitQuery { target: Some("release".into()), ..query("develop") },
    )
    .unwrap();
    let flagged: Vec<(&str, bool)> = list
        .commits
        .iter()
        .map(|c| (c.subject.as_str(), c.already_in_target))
        .collect();
    assert_eq!(
        flagged,
        [("Merge feature", false), ("OPS-7 add c", false), ("JIRA-2 add b", true), ("JIRA-1 add a", true)]
    );
}

#[test]
fn rejects_invalid_ticket_pattern_and_missing_source() {
    let f = Fixture::new();
    let git = Git::new(&f.repo);
    let err = list_commits(&git, &CommitQuery { ticket_pattern: "[".into(), ..query("main") }).unwrap_err();
    assert!(err.to_string().contains("invalid ticket pattern"));
    assert!(list_commits(&git, &query(" ")).is_err());
}

#[test]
fn limit_truncates_the_list() {
    let f = develop_fixture();
    let list = list_commits(&Git::new(&f.repo), &CommitQuery { limit: Some(2), ..query("develop") }).unwrap();
    assert_eq!(list.commits.len(), 2);
    assert!(list.truncated);
}

#[test]
fn stat_and_diff_of_a_commit() {
    let f = Fixture::new();
    let hash = f.commit("a.txt", "one\ntwo\n", "add a", "Ana", "2026-02-01T10:00:00");
    let git = Git::new(&f.repo);
    let stat = commit_stat(&git, &hash).unwrap();
    assert_eq!(stat.len(), 1);
    assert_eq!(stat[0].path, "a.txt");
    assert_eq!((stat[0].additions, stat[0].deletions), (Some(2), Some(0)));
    let diff = commit_diff(&git, &hash).unwrap();
    assert!(diff.patch.contains("+one"));
    assert!(!diff.truncated);
}

#[test]
fn resolves_root_and_lists_local_and_remote_branches() {
    let f = develop_fixture();
    f.git(&["push", "-q", "origin", "develop"]);
    f.git(&["fetch", "-q", "origin"]);
    let nested = f.repo.join("sub");
    std::fs::create_dir_all(&nested).unwrap();
    let root = resolve_root(nested.to_str().unwrap()).unwrap();
    assert!(root.ends_with("repo"));
    assert!(resolve_root(f.dir.path().to_str().unwrap()).is_err());

    let branches = list_branches(&Git::new(&f.repo)).unwrap();
    let names: Vec<(&str, bool)> = branches.iter().map(|b| (b.name.as_str(), b.is_remote)).collect();
    assert!(names.contains(&("develop", false)));
    assert!(names.contains(&("origin/develop", true)));
    assert!(names.contains(&("origin/main", true)));
    assert!(names.iter().all(|(n, _)| !n.ends_with("HEAD") && *n != "origin"));
}

#[test]
fn lists_main_develop_and_releases_first() {
    let f = Fixture::new();
    for b in ["zeta", "alpha", "release/2.3", "develop", "feature/cem-1", "release/2.10", "hotfix/x"] {
        f.git(&["branch", b]);
        f.git(&["push", "-q", "origin", b]);
    }
    f.git(&["fetch", "-q", "origin"]);

    let branches = list_branches(&Git::new(&f.repo)).unwrap();
    let local: Vec<&str> = branches.iter().filter(|b| !b.is_remote).map(|b| b.name.as_str()).collect();
    let remote: Vec<&str> = branches.iter().filter(|b| b.is_remote).map(|b| b.name.as_str()).collect();

    // Releases newest first by version, the rest alphabetical.
    assert_eq!(local, ["main", "develop", "release/2.10", "release/2.3", "alpha", "feature/cem-1", "hotfix/x", "zeta"]);
    assert_eq!(
        remote,
        ["origin/main", "origin/develop", "origin/release/2.10", "origin/release/2.3", "origin/alpha", "origin/feature/cem-1", "origin/hotfix/x", "origin/zeta"]
    );
}
