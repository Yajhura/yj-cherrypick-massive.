import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { api, Branch, Commit, errorMessage, ExportFormat, isSessionFinished, OpenedRepo, Session, Settings } from "./api";
import { emptyFilters, Filters, useCommitDetail, useCommits } from "./hooks";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { FilterBar } from "./components/FilterBar";
import { CommitList, isSelectable } from "./components/CommitList";
import { CommitDetail } from "./components/CommitDetail";
import { Display, displayOf, SessionPanel } from "./components/SessionPanel";
import { CherryPickDialog } from "./components/CherryPickDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { StartScreen } from "./components/StartScreen";

const defaultSettings: Settings = {
  recentRepos: [],
  ticketPattern: "[A-Z]+-\\d+",
  branchTemplate: "cherry-pick/{target}/{date}",
  editorCommand: "code",
};

const extensions: Record<ExportFormat, string> = { xlsx: "xlsx", csv: "csv", markdown: "md" };

function defaultSource(branches: Branch[]): string | null {
  for (const name of ["origin/develop", "origin/main", "origin/master"]) {
    if (branches.some((b) => b.name === name)) return name;
  }
  return branches.find((b) => b.isRemote)?.name ?? branches[0]?.name ?? null;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [repo, setRepo] = useState<OpenedRepo | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Map<string, Commit>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [rightPane, setRightPane] = useState<"detail" | "session">("detail");
  const [dialog, setDialog] = useState<"cherry-pick" | "settings" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openRepo = useCallback(async (path: string) => {
    setOpenBusy(true);
    setOpenError(null);
    try {
      const opened = await api.openRepo(path);
      setRepo(opened);
      setFetchError(opened.fetchError);
      setSource(defaultSource(opened.branches));
      setFilters(emptyFilters);
      setSelected(new Map());
      setActiveIndex(0);
      setSettings(await api.getSettings());
    } catch (e) {
      setOpenError(errorMessage(e));
    } finally {
      setOpenBusy(false);
    }
  }, []);

  // Restore settings and any session left from a previous run.
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => undefined);
    api
      .currentSession()
      .then((s) => {
        if (s && !isSessionFinished(s)) {
          setSession(s);
          setRightPane("session");
          openRepo(s.repo);
        }
      })
      .catch((e) => setSessionLoadError(errorMessage(e)));
  }, [openRepo]);

  const { list, loading, error: listError } = useCommits(repo?.root ?? null, source, filters, settings.ticketPattern, reloadKey);

  const visible = useMemo(() => {
    const commits = list?.commits ?? [];
    return commits.filter((c) => !(filters.hideApplied && c.alreadyInTarget) && !(filters.hideMerges && c.isMerge));
  }, [list, filters.hideApplied, filters.hideMerges]);

  const safeIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));
  const active = visible[safeIndex] ?? null;
  const { detail, loading: detailLoading, error: detailError } = useCommitDetail(repo?.root ?? null, active, visible[safeIndex + 1] ?? null);

  const selectBranch = (name: string) => {
    setSource(name);
    setSelected(new Map());
    setActiveIndex(0);
    setRightPane(session ? rightPane : "detail");
  };

  const toggle = (c: Commit) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.hash)) next.delete(c.hash);
      else next.set(c.hash, c);
      return next;
    });

  const selectAll = () => setSelected(new Map(visible.filter(isSelectable).map((c) => [c.hash, c])));

  const sessionActive = session !== null && !isSessionFinished(session);

  const sessionStatus = useMemo(() => {
    const map = new Map<string, Display>();
    if (session && sessionActive) session.items.forEach((item, i) => map.set(item.hash, displayOf(item, i, session, sessionBusy)));
    return map;
  }, [session, sessionActive, sessionBusy]);

  // When a pick stops, bring the commit that needs attention into view in the history.
  const stoppedHash = session && (session.state.kind === "conflict" || session.state.kind === "failed") ? session.items[session.current]?.hash : undefined;
  useEffect(() => {
    if (!stoppedHash) return;
    const index = visible.findIndex((c) => c.hash === stoppedHash);
    if (index >= 0) setActiveIndex(index);
  }, [stoppedHash, visible]);
  const cherryPickDisabledReason = sessionActive
    ? "Finish or abort the current cherry-pick first"
    : selected.size === 0
      ? "Select the commits to cherry-pick first"
      : null;

  const fetchNow = async () => {
    if (!repo || fetching) return;
    setFetching(true);
    try {
      const branches = await api.fetchRepo(repo.root);
      setRepo({ ...repo, branches });
      setFetchError(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setFetchError(errorMessage(e));
    } finally {
      setFetching(false);
    }
  };

  const browse = async () => {
    const path = await openDialog({ directory: true, title: "Open a git repository" });
    if (typeof path === "string") openRepo(path);
  };

  const exportVisible = async (format: ExportFormat) => {
    const base = (source ?? "history").replace(/[\\/:*?"<>|]+/g, "-");
    const path = await saveDialog({
      title: "Export commits",
      defaultPath: `${base}-history.${extensions[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [extensions[format]] }],
    });
    if (!path) return;
    try {
      await api.exportCommits(visible, format, path);
      notify(`Exported ${visible.length} commits to ${path}`);
    } catch (e) {
      notify(`Export failed: ${errorMessage(e)}`, true);
    }
  };

  const startCherryPick = async (target: string, branch: string) => {
    if (!repo) return;
    setSessionBusy(true);
    setDialogError(null);
    try {
      const s = await api.startCherryPick({ repo: repo.root, target, branch, hashes: [...selected.keys()] });
      setSession(s);
      setSelected(new Map());
      setRightPane("session");
      setDialog(null);
    } catch (e) {
      setDialogError(errorMessage(e));
    } finally {
      setSessionBusy(false);
    }
  };

  const runSession = async (action: () => Promise<Session>) => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      setSession(await action());
    } catch (e) {
      setSessionError(errorMessage(e));
    } finally {
      setSessionBusy(false);
    }
  };

  const abort = async () => {
    if (!session) return;
    const confirmed = await ask(`The worktree and the local branch ${session.branch} will be deleted. Commits already applied there are discarded.`, {
      title: "Abort cherry-pick?",
      kind: "warning",
      okLabel: "Abort",
      cancelLabel: "Keep working",
    });
    if (!confirmed) return;
    setSessionBusy(true);
    try {
      const s = await api.abortCherryPick();
      setSession(null);
      setRightPane("detail");
      notify(s.warnings.length ? `Aborted with warnings: ${s.warnings.join("; ")}` : "Cherry-pick aborted and cleaned up");
    } catch (e) {
      setSessionError(errorMessage(e));
    } finally {
      setSessionBusy(false);
    }
  };

  const dismiss = async () => {
    try {
      await api.dismissSession();
      setSession(null);
      setSessionLoadError(null);
      setRightPane("detail");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSessionError(errorMessage(e));
    }
  };

  const saveSettings = async (next: Settings) => {
    try {
      await api.saveSettings(next);
      setSettings(next);
      setDialog(null);
      setDialogError(null);
    } catch (e) {
      setDialogError(errorMessage(e));
    }
  };

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      if (dialog) return;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F5") {
        e.preventDefault();
        fetchNow();
      } else if (e.key === "o" && e.ctrlKey) {
        e.preventDefault();
        browse();
      } else if (e.key === "Enter" && e.ctrlKey && cherryPickDisabledReason === null) {
        e.preventDefault();
        setDialogError(null);
        setDialog("cherry-pick");
      } else if (e.key === "Escape" && typing && e.target === searchRef.current) {
        listRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toastEl = toast && (
    <div className="toast" role="status">
      {toast.error ? <TriangleAlert size={16} /> : <CircleCheck size={16} />} {toast.text}
    </div>
  );

  if (!repo) {
    return (
      <>
        {sessionLoadError && (
          <div className="notice error" role="alert">
            <TriangleAlert size={16} />
            <span className="grow">The saved cherry-pick session could not be read: {sessionLoadError}</span>
            <button className="btn" onClick={dismiss}>
              Discard saved session
            </button>
          </div>
        )}
        <StartScreen recents={settings.recentRepos} busy={openBusy} error={openError} onBrowse={browse} onOpen={openRepo} />
        {toastEl}
      </>
    );
  }

  const selectedCommits = [...selected.values()];

  return (
    <div className="app">
      <Toolbar
        repoRoot={repo.root}
        branch={source}
        fetching={fetching}
        selectedCount={selected.size}
        sessionActive={sessionActive}
        visibleCount={visible.length}
        cherryPickDisabledReason={cherryPickDisabledReason}
        onOpenRepo={browse}
        onFetch={fetchNow}
        onCherryPick={() => {
          setDialogError(null);
          setDialog("cherry-pick");
        }}
        onExport={exportVisible}
        onSettings={() => {
          setDialogError(null);
          setDialog("settings");
        }}
      />
      <div className="workspace">
        <Sidebar branches={repo.branches} current={source} onSelect={selectBranch} />
        <main className="center">
          <FilterBar
            ref={searchRef}
            filters={filters}
            branches={repo.branches}
            source={source}
            shown={visible.length}
            selected={selected.size}
            loading={loading}
            onChange={(patch) => {
              setFilters((f) => ({ ...f, ...patch, hideApplied: (patch.target ?? f.target) ? (patch.hideApplied ?? f.hideApplied) : false }));
              setActiveIndex(0);
            }}
          />
          {fetchError && (
            <div className="notice warn" role="status">
              <TriangleAlert size={16} />
              <span className="grow">Fetch failed, showing the last known state: {fetchError}</span>
              <button className="btn ghost" onClick={fetchNow}>
                Retry
              </button>
            </div>
          )}
          {listError && (
            <div className="notice error" role="alert">
              <TriangleAlert size={16} />
              <span className="grow">{listError}</span>
            </div>
          )}
          {list?.truncated && (
            <div className="notice warn" role="status">
              <TriangleAlert size={16} />
              <span className="grow">Only the newest 5,000 matching commits are shown. Narrow the filters to see older ones.</span>
            </div>
          )}
          {!loading && !listError && visible.length === 0 ? (
            <div className="placeholder">
              <h2>No commits match</h2>
              <p>{filters.target ? `Everything in ${source} matching these filters is already in ${filters.target}.` : "Clear or change the filters to see more history."}</p>
              <button className="btn" onClick={() => setFilters(emptyFilters)}>
                Clear filters
              </button>
            </div>
          ) : (
            <CommitList
              ref={listRef}
              commits={visible}
              sessionStatus={sessionStatus}
              selected={new Set(selected.keys())}
              activeIndex={safeIndex}
              onActivate={setActiveIndex}
              onToggle={toggle}
              onSelectAll={selectAll}
              onClearSelection={() => setSelected(new Map())}
            />
          )}
        </main>
        <aside className="detail" aria-label="Details">
          {session && (
            <div className="filters" role="tablist" aria-label="Right pane" style={{ display: "flex", gap: 4, padding: "6px 12px" }}>
              <button role="tab" aria-selected={rightPane === "session"} className={`btn ${rightPane === "session" ? "" : "ghost"}`} onClick={() => setRightPane("session")}>
                Cherry-pick session
              </button>
              <button role="tab" aria-selected={rightPane === "detail"} className={`btn ${rightPane === "detail" ? "" : "ghost"}`} onClick={() => setRightPane("detail")}>
                Commit detail
              </button>
            </div>
          )}
          {session && rightPane === "session" ? (
            <SessionPanel
              session={session}
              busy={sessionBusy}
              error={sessionError}
              onOpenEditor={() => api.openInEditor(session.worktree).catch((e) => setSessionError(errorMessage(e)))}
              onContinue={() => runSession(api.continueCherryPick)}
              onSkip={() => runSession(api.skipCommit)}
              onRetryPush={() => runSession(api.retryPush)}
              onAbort={abort}
              onDismiss={dismiss}
              onCopy={(text) => navigator.clipboard.writeText(text).then(() => notify("Branch name copied"))}
            />
          ) : (
            <CommitDetail commit={active} stat={detail?.stat ?? null} diff={detail?.diff ?? null} loading={detailLoading} error={detailError} />
          )}
        </aside>
      </div>
      <CherryPickDialog
        open={dialog === "cherry-pick"}
        commits={selectedCommits}
        branches={repo.branches}
        source={source ?? ""}
        defaultTarget={filters.target}
        template={settings.branchTemplate}
        busy={sessionBusy}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onStart={startCherryPick}
      />
      <SettingsDialog open={dialog === "settings"} settings={settings} error={dialogError} onCancel={() => setDialog(null)} onSave={saveSettings} />
      {toastEl}
    </div>
  );
}
