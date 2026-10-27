//! The git user (name and email) that signs the commits a cherry-pick creates.

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::git::Git;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    /// This repository's own config.
    Local,
    Global,
    System,
    /// Not set anywhere: git refuses to commit.
    None,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub name: String,
    pub email: String,
    /// Where the name comes from; the email usually lives next to it.
    pub scope: Scope,
}

fn read(git: &Git, key: &str) -> AppResult<(String, Scope)> {
    let out = git.output(&["config", "--show-scope", "--get", key])?;
    if !out.success {
        return Ok((String::new(), Scope::None));
    }
    let (scope, value) = out.stdout.trim_end().split_once('\t').unwrap_or(("", ""));
    let scope = match scope {
        "local" | "worktree" => Scope::Local,
        "global" => Scope::Global,
        _ => Scope::System,
    };
    Ok((value.to_string(), scope))
}

/// The identity git uses in this repository right now.
pub fn git_identity(git: &Git) -> AppResult<Identity> {
    let (name, scope) = read(git, "user.name")?;
    let (email, _) = read(git, "user.email")?;
    Ok(Identity { name, email, scope })
}

/// Saves name and email in this repository only (`git config --local`).
pub fn set_git_identity(git: &Git, name: &str, email: &str) -> AppResult<()> {
    let (name, email) = (name.trim(), email.trim());
    if name.is_empty() {
        return Err(AppError::Invalid("enter a name for git".into()));
    }
    if !email.contains('@') || email.chars().any(char::is_whitespace) {
        return Err(AppError::Invalid("enter a valid email for git".into()));
    }
    git.run(&["config", "--local", "user.name", name])?;
    git.run(&["config", "--local", "user.email", email])?;
    Ok(())
}
