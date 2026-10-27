//! Reads a branch's files straight from git (no checkout) for the Files tab: the file
//! list, a file's content, its blame and its history.

use std::collections::HashMap;

use chrono::{DateTime, FixedOffset};
use serde::Serialize;

use crate::commits::{log_format, parse_log, ticket_regex, Commit};
use crate::error::{AppError, AppResult};
use crate::git::Git;
use crate::history::{blob, commit_id};

/// Commits listed in a file's history; enough to scroll through, cheap to load.
const MAX_FILE_LOG: usize = 500;

/// Every file path of `rev`, sorted as git lists them.
pub fn list_files(git: &Git, rev: &str) -> AppResult<Vec<String>> {
    let commit = commit_id(git, rev)?;
    let out = git.run(&["ls-tree", "-r", "-z", "--name-only", "--full-tree", &commit])?;
    Ok(out.split('\0').filter(|p| !p.is_empty()).map(String::from).collect())
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    /// None for binary or too large files.
    pub content: Option<String>,
    pub binary: bool,
    pub too_large: bool,
}

pub fn read_file(git: &Git, rev: &str, path: &str) -> AppResult<FileContent> {
    let commit = commit_id(git, rev)?;
    let (text, binary, too_large) = blob(git, &commit, path)?.ok_or_else(|| AppError::Invalid(format!("file not found: {path}")))?;
    Ok(FileContent { content: (!binary && !too_large).then_some(text), binary, too_large })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BlameCommit {
    pub author: String,
    /// Author date, ISO 8601 with the author's offset.
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Blame {
    /// The commit of each line, in line order.
    pub lines: Vec<String>,
    pub commits: HashMap<String, BlameCommit>,
}

fn iso_date(epoch: &str, tz: &str) -> String {
    let secs: i64 = epoch.parse().unwrap_or(0);
    // `+0130` -> seconds east of UTC.
    let offset = tz
        .get(1..)
        .and_then(|d| Some(d.get(..2)?.parse::<i32>().ok()? * 3600 + d.get(2..4)?.parse::<i32>().ok()? * 60))
        .map(|s| if tz.starts_with('-') { -s } else { s })
        .and_then(FixedOffset::east_opt)
        .unwrap_or_else(|| FixedOffset::east_opt(0).expect("zero offset"));
    DateTime::from_timestamp(secs, 0).map(|d| d.with_timezone(&offset).to_rfc3339()).unwrap_or_default()
}

/// `git blame --porcelain`: each line starts with `<hash> <orig> <final> [count]`; the
/// first time a commit appears its author, time and summary follow.
pub fn blame(git: &Git, rev: &str, path: &str) -> AppResult<Blame> {
    let commit = commit_id(git, rev)?;
    let out = git.run(&["blame", "--porcelain", &commit, "--", path])?;
    let mut lines = Vec::new();
    let mut commits: HashMap<String, BlameCommit> = HashMap::new();
    let mut current = String::new();
    let (mut time, mut tz) = (String::new(), String::new());
    for line in out.lines() {
        if line.starts_with('\t') {
            lines.push(current.clone());
            continue;
        }
        let (key, value) = line.split_once(' ').unwrap_or((line, ""));
        if key.len() == 40 && key.chars().all(|c| c.is_ascii_hexdigit()) {
            current = key.to_string();
            continue;
        }
        let entry = commits.entry(current.clone()).or_insert_with(|| BlameCommit { author: String::new(), date: String::new(), subject: String::new() });
        match key {
            "author" => entry.author = value.to_string(),
            "author-time" => time = value.to_string(),
            "author-tz" => {
                tz = value.to_string();
                entry.date = iso_date(&time, &tz);
            }
            "summary" => entry.subject = value.to_string(),
            _ => {}
        }
    }
    Ok(Blame { lines, commits })
}

/// Commits that touched `path` on `rev`, newest first, following renames.
pub fn file_log(git: &Git, rev: &str, path: &str, ticket_pattern: &str) -> AppResult<Vec<Commit>> {
    let re = ticket_regex(ticket_pattern)?;
    let commit = commit_id(git, rev)?;
    let max = format!("--max-count={MAX_FILE_LOG}");
    let out = git.run(&["log", &log_format(), &max, "--follow", &commit, "--", path])?;
    Ok(parse_log(&out, &re))
}
