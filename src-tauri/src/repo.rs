use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::git::Git;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_remote: bool,
}

/// Resolves any folder inside a repository to its top-level directory.
pub fn resolve_root(path: &str) -> AppResult<String> {
    let git = Git::new(path);
    let root = git
        .run(&["rev-parse", "--show-toplevel"])
        .map_err(|_| AppError::Invalid(format!("not a git repository: {path}")))?;
    Ok(root.trim().to_string())
}

pub fn has_remote(git: &Git) -> AppResult<bool> {
    Ok(!git.run(&["remote"])?.trim().is_empty())
}

/// Fetches every remote. A repository without remotes is left untouched.
pub fn fetch(git: &Git) -> AppResult<()> {
    if has_remote(git)? {
        git.run(&["fetch", "--all", "--prune"])?;
    }
    Ok(())
}

/// Splits text into digit and non-digit runs so `2.10` sorts after `2.3`.
fn natural_key(s: &str) -> Vec<(u64, String)> {
    let mut parts = Vec::new();
    let mut chars = s.chars().peekable();
    while let Some(&c) = chars.peek() {
        let digit = c.is_ascii_digit();
        let mut run = String::new();
        while let Some(&c) = chars.peek().filter(|c| c.is_ascii_digit() == digit) {
            run.push(c);
            chars.next();
        }
        parts.push(if digit { (run.parse().unwrap_or(u64::MAX), String::new()) } else { (0, run.to_lowercase()) });
    }
    parts
}

/// main/master first, then develop, then releases (newest version first), then the rest.
fn branch_order(a: &Branch, b: &Branch) -> std::cmp::Ordering {
    // Remote names carry the remote as first segment: `origin/release/2.4`.
    let local = |br: &Branch| -> String {
        let name = if br.is_remote { br.name.split_once('/').map_or(br.name.as_str(), |(_, rest)| rest) } else { br.name.as_str() };
        name.to_lowercase()
    };
    let rank = |name: &str| match name {
        "main" | "master" => 0,
        "develop" | "development" | "dev" => 1,
        n if n == "release" || n.starts_with("release/") || n.starts_with("release-") => 2,
        _ => 3,
    };
    let (la, lb) = (local(a), local(b));
    let (ra, rb) = (rank(&la), rank(&lb));
    ra.cmp(&rb).then_with(|| match ra {
        2 => natural_key(&lb).cmp(&natural_key(&la)),
        _ => natural_key(&la).cmp(&natural_key(&lb)),
    })
}

pub fn list_branches(git: &Git) -> AppResult<Vec<Branch>> {
    let out = git.run(&[
        "for-each-ref",
        "--format=%(refname)%09%(refname:short)",
        "refs/heads",
        "refs/remotes",
    ])?;
    let mut branches: Vec<Branch> = out
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .filter(|(full, _)| !full.ends_with("/HEAD"))
        .map(|(full, short)| Branch {
            name: short.to_string(),
            is_remote: full.starts_with("refs/remotes/"),
        })
        .collect();
    branches.sort_by(branch_order);
    Ok(branches)
}
