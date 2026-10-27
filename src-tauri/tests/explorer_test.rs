mod common;

use cherrypick_masive_lib::explorer::{blame, file_log, list_files, read_file};
use cherrypick_masive_lib::git::Git;
use common::Fixture;

/// `develop` (pushed) has two commits on `src/app.ts` by two authors and a binary file.
fn setup() -> (Fixture, String, String) {
    let f = Fixture::new();
    f.new_branch("develop", "main");
    std::fs::create_dir_all(f.repo.join("src/deep/er")).unwrap();
    let first = f.commit("src/app.ts", "one\ntwo\nthree\n", "JIRA-1 add app", "Ana", "2026-02-01T10:00:00");
    let second = f.commit("src/app.ts", "one\nTWO\nthree\nfour\n", "JIRA-2 edit app", "Bruno", "2026-02-02T10:00:00");
    f.commit("src/deep/er/x.json", "{}\n", "add json", "Ana", "2026-02-03T10:00:00");
    std::fs::write(f.repo.join("logo.bin"), b"\x00\x01\x02").unwrap();
    f.git(&["add", "logo.bin"]);
    f.git(&["commit", "-q", "-m", "add binary"]);
    f.git(&["push", "-q", "origin", "develop"]);
    f.checkout("main");
    (f, first, second)
}

#[test]
fn lists_every_file_of_a_branch_without_checking_it_out() {
    let (f, ..) = setup();
    let files = list_files(&Git::new(&f.repo), "origin/develop").unwrap();
    assert_eq!(files, ["base.txt", "logo.bin", "src/app.ts", "src/deep/er/x.json"]);
    assert_eq!(f.git(&["branch", "--show-current"]), "main", "no checkout");
    assert!(list_files(&Git::new(&f.repo), "origin/nope").is_err());
}

#[test]
fn reads_text_and_flags_binary_files() {
    let (f, ..) = setup();
    let git = Git::new(&f.repo);
    let text = read_file(&git, "origin/develop", "src/app.ts").unwrap();
    assert_eq!(text.content.as_deref(), Some("one\nTWO\nthree\nfour\n"));
    assert!(!text.binary && !text.too_large);
    let bin = read_file(&git, "origin/develop", "logo.bin").unwrap();
    assert!(bin.binary && bin.content.is_none());
    let err = read_file(&git, "origin/develop", "missing.txt").unwrap_err();
    assert_eq!(err.to_string(), "file not found: missing.txt");
}

#[test]
fn blame_gives_the_commit_of_every_line() {
    let (f, first, second) = setup();
    let b = blame(&Git::new(&f.repo), "origin/develop", "src/app.ts").unwrap();
    assert_eq!(b.lines, [first.clone(), second.clone(), first.clone(), second.clone()]);
    let c = &b.commits[&second];
    assert_eq!((c.author.as_str(), c.subject.as_str()), ("Bruno", "JIRA-2 edit app"));
    assert!(c.date.starts_with("2026-02-02"), "{}", c.date);
    assert_eq!(b.commits[&first].author, "Ana");
}

#[test]
fn file_history_lists_the_commits_that_touched_it_newest_first() {
    let (f, ..) = setup();
    let log = file_log(&Git::new(&f.repo), "origin/develop", "src/app.ts", r"[A-Z]+-\d+").unwrap();
    let subjects: Vec<&str> = log.iter().map(|c| c.subject.as_str()).collect();
    assert_eq!(subjects, ["JIRA-2 edit app", "JIRA-1 add app"]);
    assert_eq!(log[0].tickets, ["JIRA-2"]);
}
