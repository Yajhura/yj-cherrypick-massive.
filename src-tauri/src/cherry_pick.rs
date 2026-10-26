use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::git::Git;
use crate::naming::validate_branch_name;
use crate::repo;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PickStatus {
    Pending,
    Applied,
    /// The change already existed in the target, so nothing was committed.
    Empty,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PickItem {
    pub hash: String,
    pub subject: String,
    /// Author name and strict ISO author date; empty in sessions saved before they existed.
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub date: String,
    pub status: PickStatus,
    pub new_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum SessionState {
    Running,
    /// Waiting for the user to resolve conflicts in the worktree.
    Conflict { files: Vec<String> },
    /// git failed for a reason other than a conflict; the user can skip or abort.
    Failed { message: String },
    Completed {
        pushed: bool,
        push_error: Option<String>,
        nothing_applied: bool,
    },
    Aborted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub repo: String,
    pub target: String,
    pub branch: String,
    pub worktree: String,
    pub items: Vec<PickItem>,
    pub current: usize,
    pub state: SessionState,
    pub warnings: Vec<String>,
    /// Worktree HEAD right before the current pick started. Lets the app tell whether
    /// the user finished or aborted that pick outside the app (e.g. from the IDE).
    #[serde(default)]
    pub pick_base: Option<String>,
    /// Tip of a local branch that already existed before the run. Such a branch is never
    /// deleted: abort moves it back here, and nothing applied leaves it as it was.
    #[serde(default)]
    pub restore_to: Option<String>,
}

impl Session {
    /// A finished session needs no further action and may be replaced by a new one.
    pub fn is_finished(&self) -> bool {
        match &self.state {
            SessionState::Aborted => true,
            SessionState::Completed { push_error, .. } => push_error.is_none(),
            _ => false,
        }
    }

    fn worktree_git(&self) -> Git {
        Git::new(&self.worktree)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
    pub repo: String,
    pub target: String,
    pub branch: String,
    pub hashes: Vec<String>,
}

/// Persists the single cherry-pick session so it survives an app restart.
pub struct SessionStore {
    path: PathBuf,
}

impl SessionStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> AppResult<Option<Session>> {
        match fs::read_to_string(&self.path) {
            Ok(s) => Ok(Some(serde_json::from_str(&s)?)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save(&self, session: &Session) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        // Write then rename so a crash never leaves a half-written session.
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(session)?)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn clear(&self) -> AppResult<()> {
        match fs::remove_file(&self.path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    fn active(&self) -> AppResult<Session> {
        self.load()?
            .filter(|s| !s.is_finished())
            .ok_or_else(|| AppError::Invalid("there is no active cherry-pick session".into()))
    }
}

fn head(git: &Git) -> AppResult<String> {
    Ok(git.run(&["rev-parse", "HEAD"])?.trim().to_string())
}

fn pick_in_progress(git: &Git) -> AppResult<bool> {
    Ok(git.output(&["rev-parse", "--verify", "--quiet", "CHERRY_PICK_HEAD"])?.success)
}

fn is_clean(git: &Git) -> AppResult<bool> {
    Ok(git.run(&["status", "--porcelain", "--untracked-files=no"])?.trim().is_empty())
}

fn unmerged_files(git: &Git) -> AppResult<Vec<String>> {
    Ok(git
        .run(&["diff", "--name-only", "--diff-filter=U"])?
        .lines()
        .map(String::from)
        .collect())
}

/// Expands short hashes or refs to full commit hashes.
fn resolve_hashes(git: &Git, inputs: &[String]) -> AppResult<Vec<String>> {
    inputs
        .iter()
        .map(|h| {
            git.run(&["rev-parse", "--verify", "--quiet", &format!("{h}^{{commit}}")])
                .map(|full| full.trim().to_string())
                .map_err(|_| AppError::Invalid(format!("unknown commit: {h}")))
        })
        .collect()
}

/// Orders commits oldest first by author date, never placing a child before its
/// parent, also across merged lines of history.
fn chronological(git: &Git, hashes: &[String], target: &str) -> AppResult<Vec<String>> {
    let mut args = vec!["rev-list", "--author-date-order", "--reverse"];
    args.extend(hashes.iter().map(String::as_str));
    args.extend(["--not", target]);
    let order = git.run(&args)?;
    let mut sorted: Vec<String> = order
        .lines()
        .filter(|h| hashes.iter().any(|s| s == h))
        .map(String::from)
        .collect();
    // Commits already reachable from the target are not listed; keep them at the end.
    for h in hashes {
        if !sorted.contains(h) {
            sorted.push(h.clone());
        }
    }
    Ok(sorted)
}

fn resolve_items(git: &Git, hashes: &[String]) -> AppResult<Vec<PickItem>> {
    let mut items = Vec::with_capacity(hashes.len());
    for input in hashes {
        let line = git.run(&["log", "-1", "--format=%H%x1f%P%x1f%an%x1f%aI%x1f%s", input])?;
        let mut f = line.trim_end().splitn(5, '\x1f');
        let mut next = || f.next().unwrap_or("");
        let (hash, parents, author, date, subject) = (next(), next(), next(), next(), next());
        if parents.split_whitespace().count() > 1 {
            return Err(AppError::Invalid(format!("merge commits cannot be cherry-picked: {hash}")));
        }
        if items.iter().any(|i: &PickItem| i.hash == hash) {
            continue;
        }
        items.push(PickItem {
            hash: hash.to_string(),
            subject: subject.to_string(),
            author: author.to_string(),
            date: date.to_string(),
            status: PickStatus::Pending,
            new_hash: None,
        });
    }
    Ok(items)
}

fn worktree_dir(root: &Path, branch: &str) -> PathBuf {
    let name: String = branch
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    root.join(format!("{name}-{}", chrono::Local::now().format("%Y%m%d%H%M%S")))
}

/// Where the session's branch comes from: created from the target, an existing local
/// branch, or a remote branch with no local copy yet.
enum BranchBase {
    New,
    Local(String),
    Remote(String),
}

fn local_tip(git: &Git, branch: &str) -> AppResult<Option<String>> {
    let out = git.output(&["rev-parse", "--verify", "--quiet", &format!("refs/heads/{branch}")])?;
    Ok(out.success.then(|| out.stdout.trim().to_string()))
}

/// Remote-tracking branches named `<remote>/<branch>`, `origin` first.
fn remote_copies(git: &Git, branch: &str) -> AppResult<Vec<String>> {
    let mut found: Vec<String> = git
        .run(&["branch", "-r", "--list", "--format=%(refname:short)", &format!("*/{branch}")])?
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| l.split_once('/').is_some_and(|(_, rest)| rest == branch))
        .collect();
    found.sort_by_key(|r| !r.starts_with("origin/"));
    Ok(found)
}

fn branch_base(git: &Git, branch: &str) -> AppResult<BranchBase> {
    validate_branch_name(git, branch)?;
    if let Some(tip) = local_tip(git, branch)? {
        return Ok(BranchBase::Local(tip));
    }
    Ok(remote_copies(git, branch)?.into_iter().next().map_or(BranchBase::New, BranchBase::Remote))
}

/// The names in `branches` that already exist locally or on a remote, in input order.
/// The UI warns about them: the commits will go on top of the existing branch.
pub fn existing_branches(git: &Git, branches: &[String]) -> AppResult<Vec<String>> {
    let mut found = Vec::new();
    for b in branches {
        if local_tip(git, b)?.is_some() || !remote_copies(git, b)?.is_empty() {
            found.push(b.clone());
        }
    }
    Ok(found)
}

pub fn start(store: &SessionStore, worktrees_root: &Path, req: StartRequest) -> AppResult<Session> {
    if store.load()?.is_some_and(|s| !s.is_finished()) {
        return Err(AppError::Invalid("another cherry-pick session is in progress".into()));
    }
    if req.hashes.is_empty() {
        return Err(AppError::Invalid("select at least one commit".into()));
    }
    let git = Git::new(&req.repo);
    repo::fetch(&git)?;
    let base = branch_base(&git, &req.branch)?;

    let hashes = resolve_hashes(&git, &req.hashes)?;
    let ordered = chronological(&git, &hashes, &req.target)?;
    let items = resolve_items(&git, &ordered)?;
    let worktree = worktree_dir(worktrees_root, &req.branch);
    fs::create_dir_all(worktrees_root)?;
    let wt = worktree.to_string_lossy().into_owned();
    let added = match &base {
        BranchBase::New => git.run(&["worktree", "add", "-b", &req.branch, &wt, &req.target]),
        BranchBase::Remote(remote) => git.run(&["worktree", "add", "-b", &req.branch, &wt, remote]),
        BranchBase::Local(_) => git.run(&["worktree", "add", &wt, &req.branch]),
    };
    if let Err(e) = added {
        let _ = fs::remove_dir_all(&worktree);
        let _ = git.output(&["worktree", "prune"]);
        // git creates the branch before checking out, so a failed checkout would block a retry.
        if !matches!(base, BranchBase::Local(_)) {
            let _ = git.output(&["branch", "-D", &req.branch]);
        }
        return Err(e);
    }

    let mut session = Session {
        repo: req.repo,
        target: req.target,
        branch: req.branch,
        worktree: wt,
        items,
        current: 0,
        state: SessionState::Running,
        warnings: Vec::new(),
        pick_base: None,
        restore_to: match base {
            BranchBase::Local(tip) => Some(tip),
            _ => None,
        },
    };
    store.save(&session)?;
    advance(store, &mut session)?;
    Ok(session)
}

/// Applies pending commits until all are done or one needs the user.
fn advance(store: &SessionStore, session: &mut Session) -> AppResult<()> {
    let wt = session.worktree_git();
    while session.current < session.items.len() {
        let hash = session.items[session.current].hash.clone();
        let before = head(&wt)?;
        session.pick_base = Some(before.clone());
        store.save(session)?;
        let out = wt.output(&["cherry-pick", "-x", &hash])?;
        if out.success {
            let after = head(&wt)?;
            if after == before {
                complete_current(session, PickStatus::Empty, None);
            } else {
                complete_current(session, PickStatus::Applied, Some(after));
            }
        } else {
            let files = unmerged_files(&wt)?;
            if !files.is_empty() {
                session.state = SessionState::Conflict { files };
                return store.save(session);
            }
            if pick_in_progress(&wt)? && is_clean(&wt)? {
                wt.run(&["cherry-pick", "--skip"])?;
                complete_current(session, PickStatus::Empty, None);
            } else {
                session.state = SessionState::Failed {
                    message: format!("{}{}", out.stdout, out.stderr).trim().to_string(),
                };
                return store.save(session);
            }
        }
        store.save(session)?;
    }
    finish(store, session)
}

fn preferred_remote(git: &Git) -> AppResult<Option<String>> {
    let remotes: Vec<String> = git.run(&["remote"])?.lines().map(String::from).collect();
    Ok(remotes
        .iter()
        .find(|r| *r == "origin")
        .or_else(|| remotes.first())
        .cloned())
}

fn remove_worktree(session: &mut Session) {
    let git = Git::new(&session.repo);
    if let Err(e) = git.run(&["worktree", "remove", "--force", &session.worktree]) {
        session.warnings.push(format!("could not remove worktree {}: {e}", session.worktree));
        let _ = git.run(&["worktree", "prune"]);
    }
}

fn finish(store: &SessionStore, session: &mut Session) -> AppResult<()> {
    let applied = session.items.iter().any(|i| i.status == PickStatus::Applied);
    if !applied {
        remove_worktree(session);
        if session.restore_to.is_none() {
            let _ = Git::new(&session.repo).run(&["branch", "-D", &session.branch]);
        }
        session.state = SessionState::Completed { pushed: false, push_error: None, nothing_applied: true };
        return store.save(session);
    }
    push(store, session)
}

fn push(store: &SessionStore, session: &mut Session) -> AppResult<()> {
    // Push from the main repository: it shares refs with the worktree, and relative
    // remote URLs resolve against it, not against the worktree directory.
    let repo = Git::new(&session.repo);
    let push_error = match preferred_remote(&repo)? {
        None => Some("no remote configured".to_string()),
        Some(remote) => {
            let out = repo.output(&["push", "-u", &remote, &session.branch])?;
            (!out.success).then(|| out.stderr.trim().to_string())
        }
    };
    if push_error.is_none() {
        remove_worktree(session);
    }
    session.state = SessionState::Completed { pushed: push_error.is_none(), push_error, nothing_applied: false };
    store.save(session)
}

fn has_conflict_markers(path: &Path) -> bool {
    fs::read(path).is_ok_and(|bytes| {
        String::from_utf8_lossy(&bytes)
            .lines()
            .any(|l| l.starts_with("<<<<<<< ") || l.starts_with(">>>>>>> "))
    })
}

/// The commit the user created for the current pick outside the app, if any.
fn committed_outside(session: &Session, wt: &Git) -> AppResult<Option<String>> {
    let now = head(wt)?;
    Ok(session.pick_base.as_ref().filter(|base| **base != now).map(|_| now))
}

/// Marks the current item and moves on to the next one.
fn complete_current(session: &mut Session, status: PickStatus, new_hash: Option<String>) {
    let item = &mut session.items[session.current];
    item.status = status;
    item.new_hash = new_hash;
    session.current += 1;
    session.pick_base = None;
    session.state = SessionState::Running;
}

/// Continues after the user resolved the conflicted files, or resumes a session
/// that was interrupted while running.
pub fn continue_pick(store: &SessionStore) -> AppResult<Session> {
    let mut session = store.active()?;
    let wt = session.worktree_git();
    match session.state.clone() {
        SessionState::Running => {
            if pick_in_progress(&wt)? {
                // Interrupted mid-pick: start that commit again from its base.
                wt.run(&["cherry-pick", "--abort"])?;
            } else if let Some(hash) = committed_outside(&session, &wt)? {
                complete_current(&mut session, PickStatus::Applied, Some(hash));
            }
        }
        SessionState::Conflict { files } => resolve_conflict(&mut session, &wt, &files)?,
        _ => return Err(AppError::Invalid("the session is not waiting on a conflict".into())),
    }
    store.save(&session)?;
    advance(store, &mut session)?;
    Ok(session)
}

fn resolve_conflict(session: &mut Session, wt: &Git, files: &[String]) -> AppResult<()> {
    if !pick_in_progress(wt)? {
        // The user finished (or aborted) the pick in the IDE.
        let Some(hash) = committed_outside(session, wt)? else {
            return Err(AppError::Invalid(
                "no cherry-pick in progress: it was aborted outside the app, use Skip or Abort".into(),
            ));
        };
        complete_current(session, PickStatus::Applied, Some(hash));
        return Ok(());
    }
    let pending: Vec<&String> = files
        .iter()
        .filter(|f| has_conflict_markers(&wt.dir().join(f)))
        .collect();
    if !pending.is_empty() {
        let list: Vec<&str> = pending.iter().map(|s| s.as_str()).collect();
        return Err(AppError::Invalid(format!("unresolved conflict markers in: {}", list.join(", "))));
    }
    let mut add = vec!["add", "-A", "--"];
    add.extend(files.iter().map(String::as_str));
    wt.run(&add)?;
    let remaining = unmerged_files(wt)?;
    if !remaining.is_empty() {
        return Err(AppError::Invalid(format!("files still unmerged: {}", remaining.join(", "))));
    }

    let out = wt.output(&["cherry-pick", "--continue"])?;
    if out.success {
        complete_current(session, PickStatus::Applied, Some(head(wt)?));
    } else if pick_in_progress(wt)? && is_clean(wt)? {
        // The resolution matches the target exactly: nothing to commit.
        wt.run(&["cherry-pick", "--skip"])?;
        complete_current(session, PickStatus::Empty, None);
    } else {
        return Err(AppError::Git { args: "cherry-pick --continue".into(), stderr: out.stderr.trim().to_string() });
    }
    Ok(())
}

/// Skips the commit that stopped the session and continues with the rest.
pub fn skip(store: &SessionStore) -> AppResult<Session> {
    let mut session = store.active()?;
    if !matches!(session.state, SessionState::Conflict { .. } | SessionState::Failed { .. }) {
        return Err(AppError::Invalid("there is nothing to skip".into()));
    }
    let wt = session.worktree_git();
    if pick_in_progress(&wt)? {
        wt.run(&["cherry-pick", "--skip"])?;
        complete_current(&mut session, PickStatus::Skipped, None);
    } else if let Some(hash) = committed_outside(&session, &wt)? {
        // Already committed in the IDE: it will be pushed, so report it as applied.
        complete_current(&mut session, PickStatus::Applied, Some(hash));
    } else {
        complete_current(&mut session, PickStatus::Skipped, None);
    }
    store.save(&session)?;
    advance(store, &mut session)?;
    Ok(session)
}

/// Removes pending commits that come after the current one while the session waits
/// on the user. The commit that stopped the session is handled with Skip instead.
pub fn remove_pending(store: &SessionStore, hashes: &[String]) -> AppResult<Session> {
    let mut session = store.active()?;
    if !matches!(session.state, SessionState::Conflict { .. } | SessionState::Failed { .. }) {
        return Err(AppError::Invalid("commits can only be removed while the session is paused".into()));
    }
    let current = session.current;
    let mut index = 0;
    session.items.retain(|item| {
        let keep = index <= current || item.status != PickStatus::Pending || !hashes.contains(&item.hash);
        index += 1;
        keep
    });
    store.save(&session)?;
    Ok(session)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictStatus {
    /// Continue would succeed now as far as the files are concerned.
    pub resolved: bool,
    /// Conflicted files that still contain conflict markers.
    pub unresolved: Vec<String>,
}

/// Checks the worktree the same way Continue does, without changing anything, so the
/// app can tell the user when the conflict looks resolved.
pub fn conflict_status(store: &SessionStore) -> AppResult<ConflictStatus> {
    let session = store.active()?;
    let SessionState::Conflict { files } = &session.state else {
        return Err(AppError::Invalid("the session is not waiting on a conflict".into()));
    };
    let wt = session.worktree_git();
    if !pick_in_progress(&wt)? {
        // Committed in the IDE counts as resolved; aborted there does not.
        let resolved = committed_outside(&session, &wt)?.is_some();
        return Ok(ConflictStatus { resolved, unresolved: Vec::new() });
    }
    let unresolved: Vec<String> = files
        .iter()
        .filter(|f| has_conflict_markers(&wt.dir().join(f)))
        .cloned()
        .collect();
    Ok(ConflictStatus { resolved: unresolved.is_empty(), unresolved })
}

pub fn retry_push(store: &SessionStore) -> AppResult<Session> {
    let mut session = store.active()?;
    if !matches!(session.state, SessionState::Completed { .. }) {
        return Err(AppError::Invalid("the session has not finished applying commits".into()));
    }
    push(store, &mut session)?;
    Ok(session)
}

/// Stops the session, removes the worktree and deletes the new local branch, or moves
/// a branch that existed before the run back to where it was.
pub fn abort(store: &SessionStore) -> AppResult<Session> {
    let mut session = store.active()?;
    let wt = session.worktree_git();
    if wt.dir().exists() && pick_in_progress(&wt).unwrap_or(false) {
        let _ = wt.run(&["cherry-pick", "--abort"]);
    }
    remove_worktree(&mut session);
    let repo = Git::new(&session.repo);
    let undone = match &session.restore_to {
        Some(tip) => repo.run(&["branch", "-f", &session.branch, tip]),
        None => repo.run(&["branch", "-D", &session.branch]),
    };
    if let Err(e) = undone {
        session.warnings.push(format!("could not restore branch {}: {e}", session.branch));
    }
    session.state = SessionState::Aborted;
    store.clear()?;
    Ok(session)
}

/// Forgets a finished or unreadable session so the UI starts fresh.
pub fn dismiss(store: &SessionStore) -> AppResult<()> {
    match store.load() {
        Ok(Some(s)) if !s.is_finished() => Err(AppError::Invalid("the session is still active".into())),
        _ => store.clear(),
    }
}
