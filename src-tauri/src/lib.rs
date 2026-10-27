pub mod cherry_pick;
pub mod commits;
pub mod editor;
pub mod explorer;
pub mod error;
pub mod export;
pub mod git;
pub mod history;
pub mod naming;
pub mod queue;
pub mod repo;
pub mod settings;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{Manager, State};

use cherry_pick::{ConflictStatus, Session, SessionStore, StartRequest};
use commits::{Author, Commit, CommitList, CommitQuery, Lookup};
use error::{AppError, AppResult};
use export::ExportFormat;
use git::Git;
use queue::{QueueRequest, QueueState, QueueStore};
use history::{CommitDiff, FileChange, FileStat, FileVersions};
use repo::Branch;
use settings::{Settings, SettingsStore};

struct AppPaths {
    settings: PathBuf,
    session: PathBuf,
    queue: PathBuf,
    worktrees: PathBuf,
    /// Serializes session commands so two clicks never run git concurrently.
    session_lock: Arc<Mutex<()>>,
}

/// Runs blocking git work off the main thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Invalid(e.to_string()))?
}

fn with_session<T: Send + 'static>(
    paths: &AppPaths,
    f: impl FnOnce(&SessionStore) -> AppResult<T> + Send + 'static,
) -> impl FnOnce() -> AppResult<T> + Send + 'static {
    let lock = paths.session_lock.clone();
    let store = SessionStore::new(paths.session.clone());
    move || {
        let _guard = lock.lock().map_err(|_| AppError::Invalid("session lock poisoned".into()))?;
        f(&store)
    }
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
async fn list_authors(repo: String, source: String) -> AppResult<Vec<Author>> {
    blocking(move || commits::list_authors(&Git::new(&repo), &source)).await
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
async fn commit_files(repo: String, hash: String) -> AppResult<Vec<FileChange>> {
    blocking(move || history::commit_files(&Git::new(&repo), &hash)).await
}

#[tauri::command]
async fn file_diff(
    repo: String,
    hash: String,
    path: String,
    old_path: Option<String>,
    ignore_whitespace: bool,
) -> AppResult<CommitDiff> {
    blocking(move || history::file_diff(&Git::new(&repo), &hash, &path, old_path.as_deref(), ignore_whitespace)).await
}

#[tauri::command]
async fn commit_patch(repo: String, hash: String, ignore_whitespace: bool) -> AppResult<CommitDiff> {
    blocking(move || history::commit_patch(&Git::new(&repo), &hash, ignore_whitespace)).await
}

#[tauri::command]
async fn file_versions(repo: String, hash: String, path: String, old_path: Option<String>) -> AppResult<FileVersions> {
    blocking(move || history::file_versions(&Git::new(&repo), &hash, &path, old_path.as_deref())).await
}

#[tauri::command]
fn render_branch_name(template: String, target: String, tickets: Vec<String>) -> String {
    let (date, time) = naming::now();
    naming::render_branch_name(&template, &target, &tickets, &date, &time)
}

#[tauri::command]
async fn lookup_commits(repo: String, text: String, ticket_pattern: String) -> AppResult<Lookup> {
    blocking(move || commits::lookup_commits(&Git::new(&repo), &text, &ticket_pattern)).await
}

#[tauri::command]
async fn commits_in_target(repo: String, hashes: Vec<String>, target: String) -> AppResult<Vec<String>> {
    blocking(move || commits::commits_in_target(&Git::new(&repo), &hashes, &target)).await
}

#[tauri::command]
async fn existing_branches(repo: String, branches: Vec<String>) -> AppResult<Vec<String>> {
    blocking(move || cherry_pick::existing_branches(&Git::new(&repo), &branches)).await
}

/// Reads the saved session without the session lock, so the UI can follow progress
/// while a long command runs. Saves are write-then-rename, so a read never sees half a file.
#[tauri::command]
async fn current_session(paths: State<'_, AppPaths>) -> AppResult<Option<Session>> {
    let store = SessionStore::new(paths.session.clone());
    blocking(move || store.load()).await
}

#[tauri::command]
async fn remove_pending_commits(paths: State<'_, AppPaths>, hashes: Vec<String>) -> AppResult<Session> {
    blocking(with_session(&paths, move |store| cherry_pick::remove_pending(store, &hashes))).await
}

#[tauri::command]
async fn conflict_status(paths: State<'_, AppPaths>) -> AppResult<ConflictStatus> {
    blocking(with_session(&paths, cherry_pick::conflict_status)).await
}

#[tauri::command]
async fn start_cherry_pick(paths: State<'_, AppPaths>, request: StartRequest) -> AppResult<Session> {
    let worktrees = paths.worktrees.clone();
    blocking(with_session(&paths, move |store| cherry_pick::start(store, &worktrees, request))).await
}

#[tauri::command]
async fn continue_cherry_pick(paths: State<'_, AppPaths>) -> AppResult<Session> {
    blocking(with_session(&paths, cherry_pick::continue_pick)).await
}

#[tauri::command]
async fn skip_commit(paths: State<'_, AppPaths>) -> AppResult<Session> {
    blocking(with_session(&paths, cherry_pick::skip)).await
}

#[tauri::command]
async fn retry_push(paths: State<'_, AppPaths>) -> AppResult<Session> {
    blocking(with_session(&paths, cherry_pick::retry_push)).await
}

#[tauri::command]
async fn abort_cherry_pick(paths: State<'_, AppPaths>) -> AppResult<Session> {
    blocking(with_session(&paths, cherry_pick::abort)).await
}

#[tauri::command]
async fn dismiss_session(paths: State<'_, AppPaths>) -> AppResult<()> {
    blocking(with_session(&paths, cherry_pick::dismiss)).await
}

#[tauri::command]
async fn start_queue(paths: State<'_, AppPaths>, request: QueueRequest) -> AppResult<QueueState> {
    let (queue, worktrees) = (QueueStore::new(paths.queue.clone()), paths.worktrees.clone());
    blocking(with_session(&paths, move |store| queue::start_queue(&queue, store, &worktrees, request))).await
}

#[tauri::command]
async fn advance_queue(paths: State<'_, AppPaths>) -> AppResult<QueueState> {
    let (queue, worktrees) = (QueueStore::new(paths.queue.clone()), paths.worktrees.clone());
    blocking(with_session(&paths, move |store| queue::advance_queue(&queue, store, &worktrees))).await
}

/// Lock-free like `current_session`, so the UI can follow a running queue.
#[tauri::command]
async fn current_queue(paths: State<'_, AppPaths>) -> AppResult<Option<QueueState>> {
    let (queue, session) = (QueueStore::new(paths.queue.clone()), SessionStore::new(paths.session.clone()));
    blocking(move || queue::current_queue(&queue, &session)).await
}

#[tauri::command]
async fn dismiss_queue(paths: State<'_, AppPaths>) -> AppResult<()> {
    let queue = QueueStore::new(paths.queue.clone());
    blocking(with_session(&paths, move |_| queue::dismiss_queue(&queue))).await
}

#[tauri::command]
fn open_in_editor(paths: State<'_, AppPaths>, path: String, files: Vec<String>) -> AppResult<()> {
    let editor = SettingsStore::new(paths.settings.clone()).load().editor_command;
    editor::open(&editor, &path, &files)
}

#[tauri::command]
async fn list_files(repo: String, rev: String) -> AppResult<Vec<String>> {
    blocking(move || explorer::list_files(&Git::new(&repo), &rev)).await
}

#[tauri::command]
async fn read_file(repo: String, rev: String, path: String) -> AppResult<explorer::FileContent> {
    blocking(move || explorer::read_file(&Git::new(&repo), &rev, &path)).await
}

#[tauri::command]
async fn blame_file(repo: String, rev: String, path: String) -> AppResult<explorer::Blame> {
    blocking(move || explorer::blame(&Git::new(&repo), &rev, &path)).await
}

#[tauri::command]
async fn file_log(repo: String, rev: String, path: String, ticket_pattern: String) -> AppResult<Vec<Commit>> {
    blocking(move || explorer::file_log(&Git::new(&repo), &rev, &path, &ticket_pattern)).await
}

#[tauri::command]
fn reveal_folder(path: String) -> AppResult<()> {
    editor::reveal_folder(&path)
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
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(AppPaths {
                settings: data.join("settings.json"),
                session: data.join("session.json"),
                queue: data.join("queue.json"),
                worktrees: data.join("worktrees"),
                session_lock: Arc::new(Mutex::new(())),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            open_repo,
            fetch_repo,
            list_commits,
            list_authors,
            commit_stat,
            commit_diff,
            commit_files,
            file_diff,
            commit_patch,
            file_versions,
            render_branch_name,
            lookup_commits,
            commits_in_target,
            existing_branches,
            reveal_folder,
            list_files,
            read_file,
            blame_file,
            file_log,
            current_session,
            remove_pending_commits,
            conflict_status,
            start_cherry_pick,
            continue_cherry_pick,
            skip_commit,
            retry_push,
            abort_cherry_pick,
            dismiss_session,
            start_queue,
            advance_queue,
            current_queue,
            dismiss_queue,
            open_in_editor,
            export_commits,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
