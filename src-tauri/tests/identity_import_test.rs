mod common;

use cherrypick_masive_lib::commits::import_hashes;
use cherrypick_masive_lib::git::Git;
use cherrypick_masive_lib::identity::{git_identity, set_git_identity, Scope};
use common::Fixture;

#[test]
fn shows_where_the_identity_comes_from_and_saves_it_for_this_repo_only() {
    let f = Fixture::new();
    let git = Git::new(&f.repo);
    // The fixture sets the user in the repo's own config.
    let id = git_identity(&git).unwrap();
    assert_eq!((id.name.as_str(), id.email.as_str(), id.scope), ("Tester", "tester@example.com", Scope::Local));

    set_git_identity(&git, "  Yajhura ", "yajhura@example.com").unwrap();
    let id = git_identity(&git).unwrap();
    assert_eq!((id.name.as_str(), id.email.as_str(), id.scope), ("Yajhura", "yajhura@example.com", Scope::Local));
    assert_eq!(f.git(&["config", "--local", "user.email"]), "yajhura@example.com");
}

#[test]
fn rejects_an_empty_name_or_an_email_without_at() {
    let f = Fixture::new();
    let git = Git::new(&f.repo);
    assert_eq!(set_git_identity(&git, " ", "a@b.c").unwrap_err().to_string(), "enter a name for git");
    assert_eq!(set_git_identity(&git, "Ana", "ana.example.com").unwrap_err().to_string(), "enter a valid email for git");
    assert_eq!(f.git(&["config", "--local", "user.name"]), "Tester", "nothing saved");
}

#[test]
fn imports_the_hashes_of_a_txt_with_comments() {
    let f = Fixture::new();
    let a = f.commit("a.txt", "a\n", "JIRA-1 add cafe", "Ana", "2026-02-01T10:00:00");
    let b = f.commit("b.txt", "b\n", "JIRA-2 add b", "Ana", "2026-02-02T10:00:00");
    let path = f.dir.path().join("picked.txt");
    std::fs::write(&path, format!("# from a teammate\r\n{a}  # JIRA-1 add cafe (Ana)\r\n{b}  # JIRA-2 add b (Ana)\r\nzzzz\r\n")).unwrap();

    let found = import_hashes(&Git::new(&f.repo), path.to_str().unwrap(), r"[A-Z]+-\d+").unwrap();

    let hashes: Vec<&str> = found.commits.iter().map(|c| c.hash.as_str()).collect();
    assert_eq!(hashes, [a.as_str(), b.as_str()]);
    assert_eq!(found.unknown, ["zzzz"]);
}

#[test]
fn import_refuses_a_missing_or_huge_file() {
    let f = Fixture::new();
    let git = Git::new(&f.repo);
    let missing = f.dir.path().join("nope.txt");
    assert!(import_hashes(&git, missing.to_str().unwrap(), r"[A-Z]+-\d+").unwrap_err().to_string().starts_with("could not read"));
    let big = f.dir.path().join("big.txt");
    std::fs::write(&big, "a".repeat(2 * 1024 * 1024)).unwrap();
    assert_eq!(import_hashes(&git, big.to_str().unwrap(), r"[A-Z]+-\d+").unwrap_err().to_string(), "the file is too large to be a list of hashes");
}
