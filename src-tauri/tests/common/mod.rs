#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tempfile::TempDir;

/// A working repository with a bare `origin`, both inside one temp dir.
pub struct Fixture {
    pub dir: TempDir,
    pub repo: PathBuf,
    pub remote: PathBuf,
}

pub fn git(dir: &Path, args: &[&str]) -> String {
    git_env(dir, args, &[])
}

pub fn git_env(dir: &Path, args: &[&str], env: &[(&str, &str)]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .envs(env.iter().copied())
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

impl Fixture {
    /// `main` with one base commit, pushed to `origin`.
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let remote = dir.path().join("remote.git");
        let repo = dir.path().join("repo");
        fs::create_dir_all(&repo).unwrap();
        git(dir.path(), &["init", "-q", "--bare", "-b", "main", remote.to_str().unwrap()]);
        git(&repo, &["init", "-q", "-b", "main"]);
        for (k, v) in [
            ("user.name", "Tester"),
            ("user.email", "tester@example.com"),
            ("commit.gpgsign", "false"),
            ("core.autocrlf", "false"),
        ] {
            git(&repo, &["config", k, v]);
        }
        git(&repo, &["remote", "add", "origin", remote.to_str().unwrap()]);
        let f = Self { dir, repo, remote };
        f.commit("base.txt", "base\n", "initial commit", "Tester", "2026-01-01T10:00:00");
        git(&f.repo, &["push", "-q", "-u", "origin", "main"]);
        f
    }

    pub fn repo_str(&self) -> String {
        self.repo.to_string_lossy().into_owned()
    }

    pub fn worktrees(&self) -> PathBuf {
        self.dir.path().join("worktrees")
    }

    pub fn session_file(&self) -> PathBuf {
        self.dir.path().join("session.json")
    }

    pub fn git(&self, args: &[&str]) -> String {
        git(&self.repo, args)
    }

    /// Writes `file` and commits it; returns the new hash.
    pub fn commit(&self, file: &str, content: &str, message: &str, author: &str, date: &str) -> String {
        fs::write(self.repo.join(file), content).unwrap();
        self.git(&["add", file]);
        let email = format!("{}@example.com", author.to_lowercase());
        git_env(
            &self.repo,
            &["commit", "-q", "-m", message],
            &[
                ("GIT_AUTHOR_NAME", author),
                ("GIT_AUTHOR_EMAIL", &email),
                ("GIT_AUTHOR_DATE", date),
                ("GIT_COMMITTER_DATE", date),
            ],
        );
        self.git(&["rev-parse", "HEAD"])
    }

    pub fn checkout(&self, branch: &str) {
        self.git(&["checkout", "-q", branch]);
    }

    pub fn new_branch(&self, branch: &str, from: &str) {
        self.git(&["checkout", "-q", "-b", branch, from]);
    }

    pub fn remote_log(&self, branch: &str) -> Vec<String> {
        git(&self.remote, &["log", "--format=%s", branch])
            .lines()
            .map(String::from)
            .collect()
    }
}
