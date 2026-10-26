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

/// git's well-known empty tree, the "parent" of a root commit.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/// File versions above this size are not loaded into the viewer.
const MAX_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    /// Previous path of a renamed or copied file.
    pub old_path: Option<String>,
    /// `added`, `modified`, `deleted`, `renamed`, `copied` or `typechange`.
    pub status: String,
    /// `None` for binary files.
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileVersions {
    /// Content before the commit; `None` when the file did not exist, is binary or too large.
    pub old: Option<String>,
    /// Content after the commit; `None` when the file was deleted, is binary or too large.
    pub new: Option<String>,
    pub binary: bool,
    pub too_large: bool,
}

/// The full hash of `rev` as a commit; anything else (including option-like input) is rejected.
fn commit_id(git: &Git, rev: &str) -> AppResult<String> {
    let out = git.output(&["rev-parse", "--verify", "--quiet", "--end-of-options", &format!("{rev}^{{commit}}")])?;
    if !out.success {
        return Err(crate::error::AppError::Invalid(format!("unknown commit: {rev}")));
    }
    Ok(out.stdout.trim().to_string())
}

/// What the commit is compared against: its first parent, or the empty tree for a root commit.
fn base_of(git: &Git, commit: &str) -> AppResult<String> {
    let out = git.output(&["rev-parse", "--verify", "--quiet", &format!("{commit}^1")])?;
    Ok(if out.success { out.stdout.trim().to_string() } else { EMPTY_TREE.to_string() })
}

fn status_name(code: &str) -> &'static str {
    match code.chars().next() {
        Some('A') => "added",
        Some('D') => "deleted",
        Some('R') => "renamed",
        Some('C') => "copied",
        Some('T') => "typechange",
        _ => "modified",
    }
}

/// Files changed by a commit against its first parent, with renames detected.
pub fn commit_files(git: &Git, hash: &str) -> AppResult<Vec<FileChange>> {
    let commit = commit_id(git, hash)?;
    let base = base_of(git, &commit)?;
    let names = git.run(&["diff", "-M", "--name-status", "-z", &base, &commit, "--"])?;
    let mut files = Vec::new();
    let mut fields = names.split('\0').filter(|s| !s.is_empty());
    while let Some(code) = fields.next() {
        let status = status_name(code);
        let (old_path, path) = if matches!(status, "renamed" | "copied") {
            (fields.next().map(String::from), fields.next().unwrap_or_default().to_string())
        } else {
            (None, fields.next().unwrap_or_default().to_string())
        };
        files.push(FileChange { path, old_path, status: status.to_string(), additions: None, deletions: None });
    }

    // numstat -z: "add\tdel\tpath\0", or "add\tdel\t\0old\0new\0" for a rename.
    let counts = git.run(&["diff", "-M", "--numstat", "-z", &base, &commit, "--"])?;
    let mut parts = counts.split('\0');
    while let Some(head) = parts.next() {
        let mut cols = head.splitn(3, '\t');
        let (Some(add), Some(del), Some(rest)) = (cols.next(), cols.next(), cols.next()) else { continue };
        let path = if rest.is_empty() {
            parts.next();
            parts.next().unwrap_or_default()
        } else {
            rest
        };
        if let Some(file) = files.iter_mut().find(|f| f.path == path) {
            file.additions = add.parse().ok();
            file.deletions = del.parse().ok();
        }
    }
    Ok(files)
}

/// Patch of one file of a commit. `old_path` lets git pair a rename.
pub fn file_diff(git: &Git, hash: &str, path: &str, old_path: Option<&str>, ignore_whitespace: bool) -> AppResult<CommitDiff> {
    let commit = commit_id(git, hash)?;
    let base = base_of(git, &commit)?;
    let mut args = vec!["diff", "-M", "--no-color", "--no-ext-diff"];
    if ignore_whitespace {
        args.push("-w");
    }
    args.extend([base.as_str(), commit.as_str(), "--", path]);
    if let Some(old) = old_path.filter(|o| *o != path) {
        args.push(old);
    }
    let mut patch = git.run(&args)?;
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

/// Patch of every file of a commit against its first parent, renames detected.
pub fn commit_patch(git: &Git, hash: &str, ignore_whitespace: bool) -> AppResult<CommitDiff> {
    let commit = commit_id(git, hash)?;
    let base = base_of(git, &commit)?;
    let mut args = vec!["diff", "-M", "--no-color", "--no-ext-diff"];
    if ignore_whitespace {
        args.push("-w");
    }
    args.extend([base.as_str(), commit.as_str(), "--"]);
    let mut patch = git.run(&args)?;
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

/// Reads `path` at `rev`: `Ok(None)` when it does not exist there.
fn blob(git: &Git, rev: &str, path: &str) -> AppResult<Option<(String, bool, bool)>> {
    let spec = format!("{rev}:{path}");
    let size = git.output(&["cat-file", "-s", &spec])?;
    if !size.success {
        return Ok(None);
    }
    if size.stdout.trim().parse::<u64>().unwrap_or(0) > MAX_FILE_BYTES {
        return Ok(Some((String::new(), false, true)));
    }
    let content = git.run(&["cat-file", "blob", &spec])?;
    // git's own heuristic: a NUL byte near the start means binary.
    let binary = content.chars().take(8000).any(|c| c == '\0');
    Ok(Some((if binary { String::new() } else { content }, binary, false)))
}

/// Both versions of a file, for expanding context and the full-file view.
pub fn file_versions(git: &Git, hash: &str, path: &str, old_path: Option<&str>) -> AppResult<FileVersions> {
    let commit = commit_id(git, hash)?;
    let base = base_of(git, &commit)?;
    let old = if base == EMPTY_TREE { None } else { blob(git, &base, old_path.unwrap_or(path))? };
    let new = blob(git, &commit, path)?;
    let flag = |pick: fn(&(String, bool, bool)) -> bool| old.as_ref().is_some_and(pick) || new.as_ref().is_some_and(pick);
    let binary = flag(|v| v.1);
    let too_large = flag(|v| v.2);
    let text = |v: Option<(String, bool, bool)>| v.filter(|_| !binary && !too_large).map(|v| v.0);
    Ok(FileVersions { old: text(old), new: text(new), binary, too_large })
}
