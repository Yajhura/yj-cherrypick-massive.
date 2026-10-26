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

pub fn list_branches(git: &Git) -> AppResult<Vec<Branch>> {
    let out = git.run(&[
        "for-each-ref",
        "--format=%(refname)%09%(refname:short)",
        "refs/heads",
        "refs/remotes",
    ])?;
    Ok(out
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .filter(|(full, _)| !full.ends_with("/HEAD"))
        .map(|(full, short)| Branch {
            name: short.to_string(),
            is_remote: full.starts_with("refs/remotes/"),
        })
        .collect())
}
