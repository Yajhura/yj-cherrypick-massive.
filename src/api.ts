import { invoke } from "@tauri-apps/api/core";

export interface Branch {
  name: string;
  isRemote: boolean;
}

export interface OpenedRepo {
  root: string;
  branches: Branch[];
  fetchError: string | null;
}

export interface Settings {
  recentRepos: string[];
  ticketPattern: string;
  branchTemplate: string;
  editorCommand: string;
  /** `auto` follows the OS language; otherwise `en` or `es`. */
  language: string;
}

export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  subject: string;
  body: string;
  tickets: string[];
  isMerge: boolean;
  alreadyInTarget: boolean;
}

export interface Author {
  name: string;
  email: string;
  commits: number;
}

export interface CommitQuery {
  source: string;
  target?: string;
  author?: string;
  /** Author emails; empty means any author. */
  authors?: string[];
  since?: string;
  until?: string;
  text?: string;
  ticket?: string;
  ticketPattern: string;
  limit?: number;
}

export interface CommitList {
  commits: Commit[];
  truncated: boolean;
}

export interface FileStat {
  path: string;
  additions: number | null;
  deletions: number | null;
}

export interface FileChange {
  path: string;
  /** Previous path of a renamed or copied file. */
  oldPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "typechange";
  /** null for binary files. */
  additions: number | null;
  deletions: number | null;
}

export interface FileVersions {
  old: string | null;
  new: string | null;
  binary: boolean;
  tooLarge: boolean;
}

export interface CommitDiff {
  patch: string;
  truncated: boolean;
}

export type PickStatus = "pending" | "applied" | "empty" | "skipped";

export interface PickItem {
  hash: string;
  subject: string;
  /** Empty in sessions saved before these fields existed. */
  author: string;
  date: string;
  status: PickStatus;
  newHash: string | null;
}

export type SessionState =
  | { kind: "running" }
  | { kind: "conflict"; files: string[] }
  | { kind: "failed"; message: string }
  | { kind: "completed"; pushed: boolean; pushError: string | null; nothingApplied: boolean }
  | { kind: "aborted" };

export interface Session {
  repo: string;
  target: string;
  branch: string;
  worktree: string;
  items: PickItem[];
  current: number;
  state: SessionState;
  warnings: string[];
}

export interface Lookup {
  commits: Commit[];
  unknown: string[];
  merges: string[];
}

export interface ConflictStatus {
  resolved: boolean;
  unresolved: string[];
}

export type Outcome = "pending" | "running" | "pushed" | "nothingApplied" | "aborted" | "failed";

export interface QueueEntry {
  target: string;
  branch: string;
  outcome: Outcome;
  applied: number;
  empty: number;
  skipped: number;
  error: string | null;
}

export interface Queue {
  repo: string;
  hashes: string[];
  entries: QueueEntry[];
}

export interface QueueState {
  queue: Queue;
  /** The session of the target waiting on the user, if any. */
  session: Session | null;
}

export type ExportFormat = "csv" | "markdown" | "xlsx";

/** Errors from Rust arrive as plain strings; normalize anything else. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function isSessionFinished(s: Session): boolean {
  return s.state.kind === "aborted" || (s.state.kind === "completed" && s.state.pushError === null);
}

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  openRepo: (path: string) => invoke<OpenedRepo>("open_repo", { path }),
  fetchRepo: (repo: string) => invoke<Branch[]>("fetch_repo", { repo }),
  listCommits: (repo: string, query: CommitQuery) => invoke<CommitList>("list_commits", { repo, query }),
  listAuthors: (repo: string, source: string) => invoke<Author[]>("list_authors", { repo, source }),
  commitStat: (repo: string, hash: string) => invoke<FileStat[]>("commit_stat", { repo, hash }),
  commitDiff: (repo: string, hash: string) => invoke<CommitDiff>("commit_diff", { repo, hash }),
  commitFiles: (repo: string, hash: string) => invoke<FileChange[]>("commit_files", { repo, hash }),
  commitPatch: (repo: string, hash: string, ignoreWhitespace: boolean) =>
    invoke<CommitDiff>("commit_patch", { repo, hash, ignoreWhitespace }),
  fileDiff: (repo: string, hash: string, path: string, oldPath: string | null, ignoreWhitespace: boolean) =>
    invoke<CommitDiff>("file_diff", { repo, hash, path, oldPath, ignoreWhitespace }),
  fileVersions: (repo: string, hash: string, path: string, oldPath: string | null) =>
    invoke<FileVersions>("file_versions", { repo, hash, path, oldPath }),
  renderBranchName: (template: string, target: string, tickets: string[]) =>
    invoke<string>("render_branch_name", { template, target, tickets }),
  lookupCommits: (repo: string, text: string, ticketPattern: string) =>
    invoke<Lookup>("lookup_commits", { repo, text, ticketPattern }),
  commitsInTarget: (repo: string, hashes: string[], target: string) =>
    invoke<string[]>("commits_in_target", { repo, hashes, target }),
  existingBranches: (repo: string, branches: string[]) => invoke<string[]>("existing_branches", { repo, branches }),
  currentSession: () => invoke<Session | null>("current_session"),
  startQueue: (request: { repo: string; hashes: string[]; targets: { target: string; branch: string }[] }) =>
    invoke<QueueState>("start_queue", { request }),
  advanceQueue: () => invoke<QueueState>("advance_queue"),
  currentQueue: () => invoke<QueueState | null>("current_queue"),
  dismissQueue: () => invoke<void>("dismiss_queue"),
  removePendingCommits: (hashes: string[]) => invoke<Session>("remove_pending_commits", { hashes }),
  conflictStatus: () => invoke<ConflictStatus>("conflict_status"),
  startCherryPick: (request: { repo: string; target: string; branch: string; hashes: string[] }) =>
    invoke<Session>("start_cherry_pick", { request }),
  continueCherryPick: () => invoke<Session>("continue_cherry_pick"),
  skipCommit: () => invoke<Session>("skip_commit"),
  retryPush: () => invoke<Session>("retry_push"),
  abortCherryPick: () => invoke<Session>("abort_cherry_pick"),
  dismissSession: () => invoke<void>("dismiss_session"),
  openInEditor: (path: string, files: string[] = []) => invoke<void>("open_in_editor", { path, files }),
  exportCommits: (commits: Commit[], format: ExportFormat, path: string) =>
    invoke<void>("export_commits", { commits, format, path }),
};
