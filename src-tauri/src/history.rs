use serde::Serialize;

use crate::error::AppResult;
use crate::git::Git;

/// Diffs above this size are cut to keep the UI responsive.
const MAX_DIFF_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub path: String,
    /// `None` for binary files.
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    pub patch: String,
    pub truncated: bool,
}

/// Changed files of a commit. Merge commits are compared against their first parent.
pub fn commit_stat(git: &Git, hash: &str) -> AppResult<Vec<FileStat>> {
    let out = git.run(&["show", "--numstat", "--diff-merges=first-parent", "--format=", hash])?;
    Ok(out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let (add, del, path) = (parts.next()?, parts.next()?, parts.next()?);
            Some(FileStat {
                path: path.to_string(),
                additions: add.parse().ok(),
                deletions: del.parse().ok(),
            })
        })
        .collect())
}

pub fn commit_diff(git: &Git, hash: &str) -> AppResult<CommitDiff> {
    let mut patch = git.run(&["show", "--patch", "--diff-merges=first-parent", "--format=", hash])?;
    let truncated = patch.len() > MAX_DIFF_BYTES;
    if truncated {
        let mut cut = MAX_DIFF_BYTES;
        while !patch.is_char_boundary(cut) {
            cut -= 1;
        }
        patch.truncate(cut);
    }
    Ok(CommitDiff { patch, truncated })
}
