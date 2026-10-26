use crate::error::{AppError, AppResult};
use crate::git::Git;

/// Renders a branch name template. Supported placeholders:
/// `{target}` (without the remote prefix), `{date}` (YYYYMMDD) and `{ticket}` (first ticket).
pub fn render_branch_name(template: &str, target: &str, tickets: &[String], date: &str) -> String {
    let target = target.split_once('/').map_or(target, |(remote, rest)| {
        // `origin/release/1.x` -> `release/1.x`; a local `release/1.x` keeps its name.
        if remote == "origin" || remote == "upstream" { rest } else { target }
    });
    let ticket = tickets.first().map(String::as_str).unwrap_or("");
    let rendered = template
        .replace("{target}", target)
        .replace("{date}", date)
        .replace("{ticket}", ticket);
    // Collapse empty segments left by a missing ticket, e.g. `a//b` or a trailing `-`.
    let segments: Vec<String> = rendered
        .split('/')
        .map(|s| s.trim_matches(['-', '_', '.', ' ']).replace(' ', "-"))
        .filter(|s| !s.is_empty())
        .collect();
    segments.join("/")
}

pub fn today() -> String {
    chrono::Local::now().format("%Y%m%d").to_string()
}

pub fn validate_branch_name(git: &Git, name: &str) -> AppResult<()> {
    if !name.trim().is_empty() && git.output(&["check-ref-format", "--branch", name])?.success {
        return Ok(());
    }
    Err(AppError::Invalid(format!("invalid branch name: '{name}'")))
}
