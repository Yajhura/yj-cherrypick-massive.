mod common;

use cherrypick_masive_lib::commits::Commit;
use cherrypick_masive_lib::export::{export, to_csv, to_markdown, to_txt, ExportFormat};
use cherrypick_masive_lib::git::Git;
use cherrypick_masive_lib::naming::{render_branch_name, validate_branch_name};
use cherrypick_masive_lib::settings::{Settings, SettingsStore};

fn commit(subject: &str, tickets: &[&str], is_merge: bool) -> Commit {
    Commit {
        hash: "0123456789abcdef0123456789abcdef01234567".into(),
        short_hash: "01234567".into(),
        parents: vec![],
        author_name: "Ana".into(),
        author_email: "ana@example.com".into(),
        date: "2026-02-01T10:00:00+00:00".into(),
        subject: subject.into(),
        body: String::new(),
        tickets: tickets.iter().map(|t| t.to_string()).collect(),
        is_merge,
        already_in_target: false,
    }
}

#[test]
fn csv_has_bom_header_and_quoted_values() {
    let csv = to_csv(&[commit("fix, \"quoted\"", &["JIRA-1", "OPS-2"], false)]).unwrap();
    assert!(csv.starts_with('\u{FEFF}'));
    let lines: Vec<&str> = csv.trim_start_matches('\u{FEFF}').lines().collect();
    assert_eq!(lines[0], "Hash,Date,Author,Email,Subject,Tickets,Merge");
    assert_eq!(
        lines[1],
        "0123456789abcdef0123456789abcdef01234567,2026-02-01T10:00:00+00:00,Ana,ana@example.com,\"fix, \"\"quoted\"\"\",\"JIRA-1, OPS-2\",no"
    );
}

#[test]
fn markdown_escapes_pipes_and_uses_short_hash() {
    let md = to_markdown(&[commit("a | b", &[], true)]);
    let lines: Vec<&str> = md.lines().collect();
    assert_eq!(lines[0], "| Hash | Date | Author | Email | Subject | Tickets | Merge |");
    assert_eq!(lines[1], "|---|---|---|---|---|---|---|");
    assert_eq!(lines[2], "| 01234567 | 2026-02-01T10:00:00+00:00 | Ana | ana@example.com | a \\| b |  | yes |");
}

#[test]
fn txt_lists_full_hashes_with_subject_and_author_as_comments() {
    let mut second = commit("JIRA-2 # not a comment start", &[], false);
    second.hash = "fedcba9876543210fedcba9876543210fedcba98".into();
    second.author_name = "Bruno".into();
    let txt = to_txt(&[commit("JIRA-1 fix", &[], false), second]);
    assert_eq!(
        txt,
        "0123456789abcdef0123456789abcdef01234567  # JIRA-1 fix (Ana)
fedcba9876543210fedcba9876543210fedcba98  # JIRA-2 # not a comment start (Bruno)
"
    );
}

#[test]
fn writes_each_format_to_disk() {
    let dir = tempfile::tempdir().unwrap();
    let commits = [commit("one", &["JIRA-1"], false)];
    for (format, name) in [(ExportFormat::Csv, "h.csv"), (ExportFormat::Markdown, "h.md"), (ExportFormat::Xlsx, "h.xlsx"), (ExportFormat::Txt, "h.txt")] {
        let path = dir.path().join(name);
        export(&commits, format, &path).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(!bytes.is_empty(), "{name} is empty");
        if format == ExportFormat::Xlsx {
            assert_eq!(&bytes[..2], b"PK", "xlsx is a zip archive");
        }
    }
}

#[test]
fn renders_branch_templates() {
    let tickets = vec!["JIRA-9".to_string()];
    assert_eq!(
        render_branch_name("cherry-pick/{target}/{date}", "origin/release/1.x", &tickets, "20261025", "0930"),
        "cherry-pick/release/1.x/20261025"
    );
    assert_eq!(
        render_branch_name("cherry-pick/{target}/{date}-{time}", "origin/release/1.x", &tickets, "20261025", "0930"),
        "cherry-pick/release/1.x/20261025-0930"
    );
    assert_eq!(render_branch_name("{ticket}-to-{target}", "release", &tickets, "d", "t"), "JIRA-9-to-release");
    // A missing ticket leaves no empty segment or dangling separator.
    assert_eq!(render_branch_name("cp/{ticket}/{target}", "origin/main", &[], "d", "t"), "cp/main");
    assert_eq!(render_branch_name("cp/{target}-{ticket}", "main", &[], "d", "t"), "cp/main");
}

#[test]
fn validates_branch_names_with_git() {
    let f = common::Fixture::new();
    let git = Git::new(&f.repo);
    assert!(validate_branch_name(&git, "cherry-pick/release/1.x").is_ok());
    for bad in ["", "  ", "bad..name", "with space", "end.lock"] {
        assert!(validate_branch_name(&git, bad).is_err(), "{bad:?} should be invalid");
    }
}

#[test]
fn settings_default_roundtrip_and_recents() {
    let dir = tempfile::tempdir().unwrap();
    let store = SettingsStore::new(dir.path().join("nested").join("settings.json"));
    let mut settings = store.load();
    assert_eq!(settings, Settings::default());
    assert_eq!(settings.ticket_pattern, r"[A-Z]+-\d+");
    assert_eq!(settings.language, "auto");
    assert_eq!(settings.branch_template, "cherry-pick/{target}/{date}-{time}");

    for i in 0..12 {
        settings.add_recent(&format!("C:/repo{i}"));
    }
    settings.add_recent("c:/REPO5");
    assert_eq!(settings.recent_repos.len(), 10);
    assert_eq!(settings.recent_repos[0], "c:/REPO5");
    assert_eq!(settings.recent_repos.iter().filter(|r| r.eq_ignore_ascii_case("c:/repo5")).count(), 1);

    store.save(&settings).unwrap();
    assert_eq!(store.load(), settings);
}

#[test]
fn settings_written_before_language_existed_still_load() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    std::fs::write(&path, r#"{"recentRepos":["C:/r"],"ticketPattern":"X-\\d+","branchTemplate":"b/{date}","editorCommand":"code"}"#).unwrap();
    let settings = SettingsStore::new(path).load();
    assert_eq!(settings.recent_repos, ["C:/r"]);
    assert_eq!(settings.branch_template, "b/{date}", "a saved template is kept");
    assert_eq!(settings.language, "auto");
}

#[test]
fn the_old_default_template_gains_the_time() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    std::fs::write(&path, r#"{"recentRepos":[],"ticketPattern":"X-\d+","branchTemplate":"cherry-pick/{target}/{date}","editorCommand":"code"}"#).unwrap();
    assert_eq!(SettingsStore::new(path).load().branch_template, "cherry-pick/{target}/{date}-{time}");
}
