use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

const MAX_RECENTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub recent_repos: Vec<String>,
    pub ticket_pattern: String,
    pub branch_template: String,
    /// Command used to open a worktree in the editor, e.g. `code`.
    pub editor_command: String,
    /// UI language: `auto` (follow the OS), `en` or `es`.
    pub language: String,
    /// Branch the Files tab opens on.
    pub explorer_branch: String,
}

const DEFAULT_TEMPLATE: &str = "cherry-pick/{target}/{date}-{time}";
const OLD_DEFAULT_TEMPLATE: &str = "cherry-pick/{target}/{date}";

impl Default for Settings {
    fn default() -> Self {
        Self {
            recent_repos: Vec::new(),
            ticket_pattern: r"[A-Z]+-\d+".to_string(),
            branch_template: DEFAULT_TEMPLATE.to_string(),
            editor_command: "code".to_string(),
            language: "auto".to_string(),
            explorer_branch: "origin/develop".to_string(),
        }
    }
}

impl Settings {
    /// Moves `repo` to the front of the recent list, without duplicates.
    pub fn add_recent(&mut self, repo: &str) {
        self.recent_repos.retain(|r| !r.eq_ignore_ascii_case(repo));
        self.recent_repos.insert(0, repo.to_string());
        self.recent_repos.truncate(MAX_RECENTS);
    }
}

pub struct SettingsStore {
    path: PathBuf,
}

impl SettingsStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Missing or unreadable settings fall back to defaults.
    pub fn load(&self) -> Settings {
        let mut settings: Settings = fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        // Saving settings stores the template too, so the old default would never get `{time}`.
        if settings.branch_template == OLD_DEFAULT_TEMPLATE {
            settings.branch_template = DEFAULT_TEMPLATE.to_string();
        }
        settings
    }

    pub fn save(&self, settings: &Settings) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&self.path, serde_json::to_string_pretty(settings)?)?;
        Ok(())
    }
}
