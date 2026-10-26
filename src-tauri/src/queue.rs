//! Applies the same commits to several target branches, one target after another.
//! Each target runs as an ordinary cherry-pick session; the queue only decides which
//! target runs next and records how each one ended.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::cherry_pick::{self, PickStatus, Session, SessionState, SessionStore, StartRequest};
use crate::error::{AppError, AppResult};
use crate::git::Git;
use crate::naming::validate_branch_name;
use crate::repo;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Pending,
    /// Its session is live: running, paused on a conflict or waiting on a push retry.
    Running,
    Pushed,
    /// Every commit was already in the target or skipped: no branch was created.
    NothingApplied,
    Aborted,
    /// The session could not start (for example a fetch or worktree error).
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueueEntry {
    pub target: String,
    pub branch: String,
    pub outcome: Outcome,
    /// Commits applied, already there and skipped, once the target finished.
    pub applied: usize,
    pub empty: usize,
    pub skipped: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Queue {
    pub repo: String,
    pub hashes: Vec<String>,
    pub entries: Vec<QueueEntry>,
}

impl Queue {
    /// A queue with targets left to run (or one running) blocks a new queue.
    pub fn is_active(&self) -> bool {
        self.entries.iter().any(|e| matches!(e.outcome, Outcome::Pending | Outcome::Running))
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueTarget {
    pub target: String,
    pub branch: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueRequest {
    pub repo: String,
    pub hashes: Vec<String>,
    pub targets: Vec<QueueTarget>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueueState {
    pub queue: Queue,
    /// The session of the target that waits on the user, if any.
    pub session: Option<Session>,
}

/// Persists the queue next to the session, so a restart resumes it.
pub struct QueueStore {
    path: PathBuf,
}

impl QueueStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> AppResult<Option<Queue>> {
        match fs::read_to_string(&self.path) {
            Ok(s) => Ok(Some(serde_json::from_str(&s)?)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn save(&self, queue: &Queue) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        // Write then rename so a crash never leaves a half-written queue.
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(queue)?)?;
        fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn clear(&self) -> AppResult<()> {
        match fs::remove_file(&self.path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }
}

/// Checks every target and branch name up front, so a queue never stops half-way on a typo.
fn validate(git: &Git, req: &QueueRequest) -> AppResult<()> {
    if req.targets.is_empty() {
        return Err(AppError::Invalid("choose at least one target branch".into()));
    }
    if req.hashes.is_empty() {
        return Err(AppError::Invalid("select at least one commit".into()));
    }
    for (i, t) in req.targets.iter().enumerate() {
        let later = &req.targets[i + 1..];
        if later.iter().any(|o| o.target == t.target) {
            return Err(AppError::Invalid(format!("target '{}' is listed twice", t.target)));
        }
        if later.iter().any(|o| o.branch == t.branch) {
            return Err(AppError::Invalid(format!("branch '{}' is used for two targets", t.branch)));
        }
    }
    for t in &req.targets {
        let commit = format!("{}^{{commit}}", t.target);
        if !git.output(&["rev-parse", "--verify", "--quiet", "--end-of-options", &commit])?.success {
            return Err(AppError::Invalid(format!("unknown target branch: {}", t.target)));
        }
        validate_branch_name(git, &t.branch)?;
    }
    Ok(())
}

fn record(entry: &mut QueueEntry, session: &Session) {
    let count = |s: PickStatus| session.items.iter().filter(|i| i.status == s).count();
    entry.applied = count(PickStatus::Applied);
    entry.empty = count(PickStatus::Empty);
    entry.skipped = count(PickStatus::Skipped);
    entry.outcome = match &session.state {
        SessionState::Completed { nothing_applied: true, .. } => Outcome::NothingApplied,
        SessionState::Completed { .. } => Outcome::Pushed,
        _ => Outcome::Aborted,
    };
}

/// Starts pending targets one after another until one needs the user or none is left.
fn run_next(qs: &QueueStore, ss: &SessionStore, worktrees: &Path, queue: &mut Queue) -> AppResult<Option<Session>> {
    while let Some(i) = queue.entries.iter().position(|e| e.outcome == Outcome::Pending) {
        queue.entries[i].outcome = Outcome::Running;
        qs.save(queue)?;
        let req = StartRequest {
            repo: queue.repo.clone(),
            target: queue.entries[i].target.clone(),
            branch: queue.entries[i].branch.clone(),
            hashes: queue.hashes.clone(),
        };
        match cherry_pick::start(ss, worktrees, req) {
            Ok(session) if session.is_finished() => {
                record(&mut queue.entries[i], &session);
                ss.clear()?;
            }
            Ok(session) => {
                qs.save(queue)?;
                return Ok(Some(session));
            }
            Err(e) => {
                // A failed start leaves no session; the other targets still run.
                queue.entries[i].outcome = Outcome::Failed;
                queue.entries[i].error = Some(e.to_string());
            }
        }
        qs.save(queue)?;
    }
    Ok(None)
}

pub fn start_queue(qs: &QueueStore, ss: &SessionStore, worktrees: &Path, req: QueueRequest) -> AppResult<QueueState> {
    if qs.load()?.is_some_and(|q| q.is_active()) {
        return Err(AppError::Invalid("another cherry-pick queue is in progress".into()));
    }
    if ss.load()?.is_some_and(|s| !s.is_finished()) {
        return Err(AppError::Invalid("another cherry-pick session is in progress".into()));
    }
    let git = Git::new(&req.repo);
    repo::fetch(&git)?;
    validate(&git, &req)?;
    let mut queue = Queue {
        repo: req.repo,
        hashes: req.hashes,
        entries: req
            .targets
            .into_iter()
            .map(|t| QueueEntry {
                target: t.target,
                branch: t.branch,
                outcome: Outcome::Pending,
                applied: 0,
                empty: 0,
                skipped: 0,
                error: None,
            })
            .collect(),
    };
    qs.save(&queue)?;
    let session = run_next(qs, ss, worktrees, &mut queue)?;
    Ok(QueueState { queue, session })
}

/// Called after the user acted on the running target: records how it ended (finished
/// or aborted) and starts the next targets. A target still waiting on the user stays.
pub fn advance_queue(qs: &QueueStore, ss: &SessionStore, worktrees: &Path) -> AppResult<QueueState> {
    let mut queue = qs
        .load()?
        .ok_or_else(|| AppError::Invalid("there is no cherry-pick queue".into()))?;
    if let Some(i) = queue.entries.iter().position(|e| e.outcome == Outcome::Running) {
        match ss.load()? {
            Some(session) if !session.is_finished() => return Ok(QueueState { queue, session: Some(session) }),
            Some(session) => {
                record(&mut queue.entries[i], &session);
                ss.clear()?;
            }
            // Abort deletes the session file.
            None => queue.entries[i].outcome = Outcome::Aborted,
        }
        qs.save(&queue)?;
    }
    let session = run_next(qs, ss, worktrees, &mut queue)?;
    Ok(QueueState { queue, session })
}

pub fn current_queue(qs: &QueueStore, ss: &SessionStore) -> AppResult<Option<QueueState>> {
    let Some(queue) = qs.load()? else { return Ok(None) };
    let session = ss.load()?.filter(|s| !s.is_finished());
    Ok(Some(QueueState { queue, session }))
}

/// Forgets a finished queue (its summary has been seen).
pub fn dismiss_queue(qs: &QueueStore) -> AppResult<()> {
    if qs.load()?.is_some_and(|q| q.is_active()) {
        return Err(AppError::Invalid("the queue still has targets to run".into()));
    }
    qs.clear()
}
