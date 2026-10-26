pub mod commits;
pub mod editor;
pub mod error;
pub mod export;
pub mod git;
pub mod history;
pub mod naming;
pub mod repo;
pub mod settings;

use std::path::PathBuf;

use serde::Serialize;
use tauri::{Manager, State};

use commits::{Commit, CommitList, CommitQuery};
use error::{AppError, AppResult};
use export::ExportFormat;
use git::Git;
use history::{CommitDiff, FileStat};
use repo::Branch;
use settings::{Settings, SettingsStore};

struct AppPaths {
    settings: PathBuf,
}

/// Runs blocking git work off the main thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Invalid(e.to_string()))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedRepo {
    root: String,
    branches: Vec<Branch>,
    /// Fetch failures (e.g. offline) do not prevent opening the repository.
    fetch_error: Option<String>,
}

#[tauri::command]
fn get_settings(paths: State<'_, AppPaths>) -> Settings {
    SettingsStore::new(paths.settings.clone()).load()
}

#[tauri::command]
fn save_settings(paths: State<'_, AppPaths>, settings: Settings) -> AppResult<()> {
    commits::ticket_regex(&settings.ticket_pattern)?;
    SettingsStore::new(paths.settings.clone()).save(&settings)
}

#[tauri::command]
async fn open_repo(paths: State<'_, AppPaths>, path: String) -> AppResult<OpenedRepo> {
    let settings_path = paths.settings.clone();
    blocking(move || {
        let root = repo::resolve_root(&path)?;
        let git = Git::new(&root);
        let fetch_error = repo::fetch(&git).err().map(|e| e.to_string());
        let branches = repo::list_branches(&git)?;
        let store = SettingsStore::new(settings_path);
        let mut settings = store.load();
        settings.add_recent(&root);
        store.save(&settings)?;
        Ok(OpenedRepo { root, branches, fetch_error })
    })
    .await
}

#[tauri::command]
async fn fetch_repo(repo: String) -> AppResult<Vec<Branch>> {
    blocking(move || {
        let git = Git::new(&repo);
        repo::fetch(&git)?;
        repo::list_branches(&git)
    })
    .await
}

#[tauri::command]
async fn list_commits(repo: String, query: CommitQuery) -> AppResult<CommitList> {
    blocking(move || commits::list_commits(&Git::new(&repo), &query)).await
}

#[tauri::command]
async fn commit_stat(repo: String, hash: String) -> AppResult<Vec<FileStat>> {
    blocking(move || history::commit_stat(&Git::new(&repo), &hash)).await
}

#[tauri::command]
async fn commit_diff(repo: String, hash: String) -> AppResult<CommitDiff> {
    blocking(move || history::commit_diff(&Git::new(&repo), &hash)).await
}

#[tauri::command]
fn render_branch_name(template: String, target: String, tickets: Vec<String>) -> String {
    naming::render_branch_name(&template, &target, &tickets, &naming::today())
}

#[tauri::command]
fn open_in_editor(paths: State<'_, AppPaths>, path: String) -> AppResult<()> {
    let editor = SettingsStore::new(paths.settings.clone()).load().editor_command;
    editor::open(&editor, &path)
}

#[tauri::command]
async fn export_commits(commits: Vec<Commit>, format: ExportFormat, path: String) -> AppResult<()> {
    blocking(move || export::export(&commits, format, std::path::Path::new(&path))).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(AppPaths {
                settings: data.join("settings.json"),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            open_repo,
            fetch_repo,
            list_commits,
            commit_stat,
            commit_diff,
            render_branch_name,
            open_in_editor,
            export_commits,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
