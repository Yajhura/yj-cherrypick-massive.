use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};

/// Raw result of a git invocation, used when a non-zero exit is an expected outcome
/// (for example a cherry-pick that stops on a conflict).
#[derive(Debug)]
pub struct GitOutput {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

/// Thin wrapper around the system `git` CLI, bound to one working directory.
#[derive(Debug, Clone)]
pub struct Git {
    dir: PathBuf,
}

impl Git {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Runs git and fails on a non-zero exit code.
    pub fn run(&self, args: &[&str]) -> AppResult<String> {
        let out = self.output(args)?;
        if out.success {
            Ok(out.stdout)
        } else {
            Err(AppError::Git {
                args: args.join(" "),
                stderr: out.stderr.trim().to_string(),
            })
        }
    }

    /// Runs git and returns the outcome without interpreting the exit code.
    pub fn output(&self, args: &[&str]) -> AppResult<GitOutput> {
        let mut cmd = Command::new("git");
        cmd.current_dir(&self.dir)
            .args(["-c", "core.quotepath=false", "-c", "color.ui=never"])
            // Worktrees live deep under AppData; lift Windows' 260-char path limit.
            .args(["-c", "core.longpaths=true"])
            .args(args)
            // Never block on an interactive prompt or editor.
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_EDITOR", "true")
            .env("LC_ALL", "C")
            .env("LANG", "C");
        hide_console(&mut cmd);
        let out = cmd.output().map_err(|e| AppError::GitMissing(e.to_string()))?;
        Ok(GitOutput {
            success: out.status.success(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }
}

#[cfg(windows)]
pub fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console(_cmd: &mut Command) {}
