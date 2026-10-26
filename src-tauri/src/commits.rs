use std::collections::HashSet;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::git::Git;

const DEFAULT_LIMIT: usize = 5000;
const FIELD: char = '\x1f';
const RECORD: char = '\x1e';

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    /// Author date, strict ISO 8601.
    pub date: String,
    pub subject: String,
    pub body: String,
    pub tickets: Vec<String>,
    /// Commits with two or more parents. They are excluded from cherry-picks.
    pub is_merge: bool,
    /// An equivalent change already exists in the target branch.
    pub already_in_target: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CommitQuery {
    pub source: String,
    /// When set, only commits in `source` that are not in `target` are listed.
    pub target: Option<String>,
    /// Case-insensitive substring of author name or email.
    pub author: Option<String>,
    /// Author emails (case-insensitive); empty means any author.
    pub authors: Vec<String>,
    /// Inclusive author-date bounds, `YYYY-MM-DD`.
    pub since: Option<String>,
    pub until: Option<String>,
    /// Case-insensitive substring of the full message.
    pub text: Option<String>,
    /// Exact ticket id, matched against tickets extracted with `ticket_pattern`.
    pub ticket: Option<String>,
    pub ticket_pattern: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub name: String,
    pub email: String,
    pub commits: usize,
}

/// Authors of `source`, grouped by email (mailmap applied), most commits first.
pub fn list_authors(git: &Git, source: &str) -> AppResult<Vec<Author>> {
    if source.trim().is_empty() {
        return Err(AppError::Invalid("source branch is required".into()));
    }
    let out = git.run(&["log", "--format=%aN%x1f%aE", source, "--"])?;
    let mut authors: Vec<Author> = Vec::new();
    for (name, email) in out.lines().filter_map(|l| l.split_once(FIELD)) {
        // Log order is newest first, so the kept name is the most recent one.
        match authors.iter_mut().find(|a| a.email.eq_ignore_ascii_case(email)) {
            Some(a) => a.commits += 1,
            None => authors.push(Author { name: name.into(), email: email.into(), commits: 1 }),
        }
    }
    authors.sort_by(|a, b| b.commits.cmp(&a.commits).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(authors)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitList {
    pub commits: Vec<Commit>,
    pub truncated: bool,
}

fn non_empty(value: &Option<String>) -> Option<&str> {
    value.as_deref().map(str::trim).filter(|v| !v.is_empty())
}

pub fn ticket_regex(pattern: &str) -> AppResult<Regex> {
    Regex::new(pattern).map_err(|e| AppError::Invalid(format!("invalid ticket pattern: {e}")))
}

pub fn extract_tickets(re: &Regex, message: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    re.find_iter(message)
        .map(|m| m.as_str().to_string())
        .filter(|t| seen.insert(t.clone()))
        .collect()
}

pub fn parse_log(output: &str, re: &Regex) -> Vec<Commit> {
    output
        .split(RECORD)
        .map(|r| r.trim_start_matches(['\n', '\r']))
        .filter(|r| !r.is_empty())
        .filter_map(|record| {
            let f: Vec<&str> = record.splitn(7, FIELD).collect();
            if f.len() < 7 {
                return None;
            }
            let parents: Vec<String> = f[1].split_whitespace().map(String::from).collect();
            let body = f[6].trim_end().to_string();
            let subject = f[5].to_string();
            Some(Commit {
                short_hash: f[0].chars().take(8).collect(),
                hash: f[0].to_string(),
                is_merge: parents.len() > 1,
                parents,
                author_name: f[2].to_string(),
                author_email: f[3].to_string(),
                date: f[4].to_string(),
                tickets: extract_tickets(re, &format!("{subject}\n{body}")),
                subject,
                body,
                already_in_target: false,
            })
        })
        .collect()
}

/// Hashes of `source` commits whose change already exists in `target`, either by
/// patch-id (`git cherry`) or through a `cherry picked from commit` trailer.
pub fn applied_in_target(git: &Git, source: &str, target: &str) -> AppResult<HashSet<String>> {
    let mut applied: HashSet<String> = git
        .run(&["cherry", target, source])?
        .lines()
        .filter_map(|l| l.strip_prefix("- "))
        .map(|h| h.trim().to_string())
        .collect();

    let trailer = Regex::new(r"cherry picked from commit ([0-9a-f]{7,40})").expect("valid regex");
    let range = format!("{source}..{target}");
    let bodies = git.run(&["log", "--format=%B", &range])?;
    let picked: Vec<String> = trailer
        .captures_iter(&bodies)
        .map(|c| c[1].to_string())
        .collect();
    if !picked.is_empty() {
        let range = format!("{target}..{source}");
        for hash in git.run(&["rev-list", &range])?.lines() {
            if picked.iter().any(|p| hash.starts_with(p.as_str())) {
                applied.insert(hash.to_string());
            }
        }
    }
    Ok(applied)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lookup {
    /// Found non-merge commits, in input order, without repeats.
    pub commits: Vec<Commit>,
    /// Inputs that are not a commit hash of this repository.
    pub unknown: Vec<String>,
    /// Short hashes of merge commits, which cannot be cherry-picked.
    pub merges: Vec<String>,
}

fn log_format() -> String {
    format!("--format=%H{FIELD}%P{FIELD}%an{FIELD}%ae{FIELD}%aI{FIELD}%s{FIELD}%b{RECORD}")
}

/// Resolves hashes pasted as free text (separated by spaces, commas, semicolons or
/// new lines). Only hex hashes are accepted, so a branch name is never resolved.
pub fn lookup_commits(git: &Git, text: &str, ticket_pattern: &str) -> AppResult<Lookup> {
    let re = ticket_regex(ticket_pattern)?;
    let mut found = Lookup { commits: Vec::new(), unknown: Vec::new(), merges: Vec::new() };
    let mut hashes: Vec<String> = Vec::new();
    // Everything after `#` on a line is a comment, as in the txt the app exports.
    let text: String = text.lines().map(|l| l.split('#').next().unwrap_or("")).collect::<Vec<_>>().join("
");
    for token in text.split(|c: char| c.is_whitespace() || c == ',' || c == ';').filter(|t| !t.is_empty()) {
        let hex = (4..=40).contains(&token.len()) && token.chars().all(|c| c.is_ascii_hexdigit());
        let full = if hex {
            let out = git.output(&["rev-parse", "--verify", "--quiet", &format!("{token}^{{commit}}")])?;
            out.success.then(|| out.stdout.trim().to_string())
        } else {
            None
        };
        match full {
            Some(h) if !hashes.contains(&h) => hashes.push(h),
            Some(_) => {}
            None => found.unknown.push(token.to_string()),
        }
    }
    if hashes.is_empty() {
        return Ok(found);
    }
    let mut args = vec!["log".to_string(), "--no-walk=unsorted".into(), log_format()];
    args.extend(hashes.iter().cloned());
    args.push("--".into());
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    for c in parse_log(&git.run(&args)?, &re) {
        if c.is_merge {
            found.merges.push(c.short_hash);
        } else {
            found.commits.push(c);
        }
    }
    Ok(found)
}

/// Which of `hashes` already exist in `target`: reachable from it, the same patch
/// (patch-id), or named by a `cherry picked from commit` trailer. Works for commits
/// of any branch, unlike [`applied_in_target`].
pub fn commits_in_target(git: &Git, hashes: &[String], target: &str) -> AppResult<Vec<String>> {
    let trailer = Regex::new(r"cherry picked from commit ([0-9a-f]{7,40})").expect("valid regex");
    let bodies = git.run(&["log", "--format=%B", "--grep=cherry picked from commit", target, "--"])?;
    let picked: Vec<String> = trailer.captures_iter(&bodies).map(|c| c[1].to_string()).collect();

    let mut found = Vec::new();
    for hash in hashes {
        let in_target = git.output(&["merge-base", "--is-ancestor", hash, target])?.success
            || picked.iter().any(|p| hash.starts_with(p.as_str()))
            || git
                .output(&["cherry", target, hash, &format!("{hash}^")])?
                .stdout
                .lines()
                .any(|l| l.starts_with("- "));
        if in_target {
            found.push(hash.clone());
        }
    }
    Ok(found)
}

fn matches(c: &Commit, q: &CommitQuery) -> bool {
    if let Some(author) = non_empty(&q.author) {
        let a = author.to_lowercase();
        if !c.author_name.to_lowercase().contains(&a) && !c.author_email.to_lowercase().contains(&a) {
            return false;
        }
    }
    if !q.authors.is_empty() && !q.authors.iter().any(|a| a.eq_ignore_ascii_case(&c.author_email)) {
        return false;
    }
    let day = c.date.get(..10).unwrap_or("");
    if non_empty(&q.since).is_some_and(|s| day < s) || non_empty(&q.until).is_some_and(|u| day > u) {
        return false;
    }
    if let Some(text) = non_empty(&q.text) {
        let t = text.to_lowercase();
        if !c.subject.to_lowercase().contains(&t) && !c.body.to_lowercase().contains(&t) {
            return false;
        }
    }
    non_empty(&q.ticket).is_none_or(|ticket| c.tickets.iter().any(|t| t.eq_ignore_ascii_case(ticket)))
}

pub fn list_commits(git: &Git, q: &CommitQuery) -> AppResult<CommitList> {
    if q.source.trim().is_empty() {
        return Err(AppError::Invalid("source branch is required".into()));
    }
    let re = ticket_regex(&q.ticket_pattern)?;
    let target = non_empty(&q.target);
    let range = match target {
        Some(t) => format!("{t}..{}", q.source),
        None => q.source.clone(),
    };
    let mut args = vec!["log".to_string(), "--topo-order".into(), log_format()];
    // Committer date is never earlier than author date, so this only narrows the scan.
    if let Some(since) = non_empty(&q.since) {
        args.push(format!("--since={since} 00:00:00"));
    }
    args.push(range);
    args.push("--".into());
    let args: Vec<&str> = args.iter().map(String::as_str).collect();

    let mut commits: Vec<Commit> = parse_log(&git.run(&args)?, &re)
        .into_iter()
        .filter(|c| matches(c, q))
        .collect();

    if let Some(t) = target {
        let applied = applied_in_target(git, &q.source, t)?;
        for c in &mut commits {
            c.already_in_target = applied.contains(&c.hash);
        }
    }

    let limit = q.limit.unwrap_or(DEFAULT_LIMIT);
    let truncated = commits.len() > limit;
    commits.truncate(limit);
    Ok(CommitList { commits, truncated })
}
