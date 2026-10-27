import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Cherry, CircleCheck, Code, Columns3, FolderTree, History, OctagonAlert, Plus, TriangleAlert } from "lucide-react";
import { api, Branch, Commit, errorMessage, ExportFormat, isSessionFinished, OpenedRepo, Queue, QueueState, Session, Settings } from "./api";
import { addToBasket, Basket, columnBranch, emptyBasket, isQueueActive, loadIntoBasket, orderByDate, polledSession, progressOf, targetsDone } from "./basket";
import { useBranchView, useCommitDetail } from "./hooks";
import { Toolbar } from "./components/Toolbar";
import { BranchPane } from "./components/BranchPane";
import { BranchColumn } from "./components/BranchColumn";
import { FilesTab } from "./components/FilesTab";
import { FileSearch } from "./components/FileSearch";
import { explorerStart } from "./explorerModel";
import { CommitDetail } from "./components/CommitDetail";
import { Display, displayOf, SessionPanel } from "./components/SessionPanel";
import { CherryPickSetup } from "./components/CherryPickSetup";
import { QueueStrip, QueueSummary } from "./components/QueueView";
import { CodeViewer } from "./components/CodeViewer";
import { SettingsDialog } from "./components/SettingsDialog";
import { StartScreen } from "./components/StartScreen";
import { notifyInBackground } from "./notify";
import { I18nProvider, useI18n } from "./i18n";

type Tab = "history" | "cherry-pick" | "code" | "branches" | "files";

/** The Branches tab shows 2 to 4 columns. */
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 4;
let nextColumnId = 1;

/** How often the saved session is read while the engine applies commits. */
const PROGRESS_POLL_MS = 600;

const defaultSettings: Settings = {
  recentRepos: [],
  ticketPattern: "[A-Z]+-\\d+",
  branchTemplate: "cherry-pick/{target}/{date}-{time}",
  editorCommand: "code",
  language: "auto",
  explorerBranch: "origin/develop",
};

const extensions: Record<ExportFormat, string> = { xlsx: "xlsx", csv: "csv", markdown: "md", txt: "txt" };

// Per-machine UI preferences; storage may be unavailable, which only loses the preference.
function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(`cpm.${key}`);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(`cpm.${key}`, value);
  } catch {
    // Ignore: the preference is a convenience.
  }
}

function defaultSource(branches: Branch[]): string | null {
  for (const name of ["origin/develop", "origin/main", "origin/master"]) {
    if (branches.some((b) => b.name === name)) return name;
  }
  return branches.find((b) => b.isRemote)?.name ?? branches[0]?.name ?? null;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  return (
    <I18nProvider setting={settings.language}>
      <Main settings={settings} setSettings={setSettings} />
    </I18nProvider>
  );
}

function Main({ settings, setSettings }: { settings: Settings; setSettings: (s: Settings) => void }) {
  const { t, te } = useI18n();
  // Backend messages are translated; git's own output inside them stays as git printed it.
  const fail = (e: unknown) => te(errorMessage(e));
  const [repo, setRepo] = useState<OpenedRepo | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [columns, setColumns] = useState<{ id: number; initial: string | null }[]>([]);
  // Files tab: the branch it reads, its file list and the open file. F1 searches that list.
  const [explorerRev, setExplorerRev] = useState<string | null>(null);
  const [explorerPath, setExplorerPath] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // The Code tab follows the History list, or the list of the column it was opened from.
  const [codeList, setCodeList] = useState<{ commits: Commit[]; index: number } | null>(null);
  const [tab, setTab] = useState<Tab>("history");
  const [basket, setBasket] = useState<Basket>(emptyBasket);
  const [startError, setStartError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // The targets of the current run; every start goes through a queue, even with one target.
  const [queue, setQueue] = useState<Queue | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showChanges, setShowChangesState] = useState(() => readPref("showChanges") !== "false");
  const setShowChanges = (value: boolean) => {
    setShowChangesState(value);
    writePref("showChanges", String(value));
  };
  const [dialog, setDialog] = useState<"settings" | null>(null);
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
      history.reset(defaultSource(opened.branches));
      const first = columnBranch(opened.branches, []);
      setColumns([
        { id: nextColumnId++, initial: first },
        { id: nextColumnId++, initial: columnBranch(opened.branches, first ? [first] : []) },
      ]);
      setCodeList(null);
      const saved = await api.getSettings().catch(() => null);
      setExplorerRev(explorerStart(opened.branches, saved?.explorerBranch ?? "origin/develop"));
      setExplorerPath(null);
      setBasket(emptyBasket);
      setSettings(await api.getSettings());
    } catch (e) {
      setOpenError(fail(e));
    } finally {
      setOpenBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore settings and any session left from a previous run.
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => undefined);
    const restore = async () => {
      const q = await api.currentQueue();
      if (q) {
        setQueue(q.queue);
        setSession(q.session);
        setTab("cherry-pick");
        openRepo(q.queue.repo);
        return;
      }
      const s = await api.currentSession();
      if (s && !isSessionFinished(s)) {
        setSession(s);
        setTab("cherry-pick");
        openRepo(s.repo);
      }
    };
    restore().catch((e) => setSessionLoadError(fail(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRepo]);

  const history = useBranchView(repo?.root ?? null, settings.ticketPattern, reloadKey);
  const { source, filters, selected, visible, safeIndex, active } = history;
  const { detail, loading: detailLoading, error: detailError } = useCommitDetail(repo?.root ?? null, active, visible[safeIndex + 1] ?? null);

  useEffect(() => {
    if (!repo || !explorerRev) return setFiles([]);
    let stale = false;
    setFilesLoading(true);
    setFilesError(null);
    api
      .listFiles(repo.root, explorerRev)
      .then((list) => !stale && setFiles(list))
      .catch((e) => {
        if (stale) return;
        setFiles([]);
        setFilesError(fail(e));
      })
      .finally(() => !stale && setFilesLoading(false));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo?.root, explorerRev, reloadKey]);

  /** Opens a commit given by hash (from blame or file history) in the Code tab. */
  const openCommitByHash = async (hash: string) => {
    if (!repo) return;
    try {
      const found = await api.lookupCommits(repo.root, hash, settings.ticketPattern);
      if (found.commits.length === 0) return notify(t("files.mergeCommit", { hash: hash.slice(0, 8) }), true);
      setCodeList({ commits: found.commits, index: 0 });
      setTab("code");
    } catch (e) {
      notify(fail(e), true);
    }
  };

  const sessionActive = session !== null && !isSessionFinished(session);

  const sessionStatus = useMemo(() => {
    const map = new Map<string, Display>();
    if (session && sessionActive) session.items.forEach((item, i) => map.set(item.hash, displayOf(item, i, session, sessionBusy)));
    return map;
  }, [session, sessionActive, sessionBusy]);

  // While the engine applies commits, follow its saved progress.
  useEffect(() => {
    if (!sessionBusy) return;
    // Answers that arrive after the command finished are dropped: its result is newer.
    let stopped = false;
    const id = window.setInterval(() => {
      api
        .currentQueue()
        .then(async (q) => {
          if (stopped) return;
          if (q) {
            setQueue(q.queue);
            setSession(polledSession(q.session));
            return;
          }
          const live = polledSession(await api.currentSession());
          if (!stopped && live) setSession(live);
        })
        .catch(() => undefined);
    }, PROGRESS_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [sessionBusy]);

  // A stop or the end of the run needs the user: tell them, also when the app is behind.
  const stopped = session?.state.kind === "conflict" || session?.state.kind === "failed";
  const stopKey = session && stopped ? `${session.branch}:${session.current}` : undefined;
  useEffect(() => {
    if (!stopKey || !session) return;
    const hash = session.items[session.current]?.hash.slice(0, 8) ?? "";
    const title = session.state.kind === "conflict" ? t("notify.conflictTitle") : t("notify.failedTitle");
    const files = session.state.kind === "conflict" ? session.state.files.length : 0;
    notifyInBackground(title, t("notify.stopBody", { hash, count: files }));
    if (tab !== "cherry-pick") notify(`${title}: ${hash}`, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopKey]);
  const queueDone = queue !== null && !isQueueActive(queue);
  const doneKey = queueDone ? queue.entries.map((e) => `${e.branch}:${e.outcome}`).join(",") : session?.state.kind === "completed" ? session.branch : undefined;
  useEffect(() => {
    if (!doneKey) return;
    const pushed = queue ? queue.entries.filter((e) => e.outcome === "pushed").length : 1;
    notifyInBackground(t("notify.doneTitle"), queue ? t("queue.notifyBody", { pushed, total: queue.entries.length }) : doneKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  /** Puts commits in the Cherry-pick basket; resolves false when the user kept the current one. */
  const loadCommits = async (from: string, commits: Commit[]) => {
    const result = loadIntoBasket(basket, from, commits);
    let next: Basket;
    if (result.kind === "confirm") {
      const confirmed = await ask(t("basket.replaceBody", { current: result.current ?? "", source: from }), {
        title: t("basket.replaceTitle"),
        kind: "warning",
        okLabel: t("basket.replace"),
        cancelLabel: t("common.cancel"),
      });
      if (!confirmed) return false;
      next = result.replacement;
    } else {
      next = result.basket;
    }
    setBasket(next);
    setStartError(null);
    setTab("cherry-pick");
    return true;
  };

  const loadIntoCherryPick = async () => {
    if (source && selected.size > 0 && (await loadCommits(source, [...selected.values()]))) history.clearSelection();
  };

  const openCodeFromHistory = () => {
    setCodeList(null);
    setTab("code");
  };

  const fetchNow = async () => {
    if (!repo || fetching) return;
    setFetching(true);
    try {
      const branches = await api.fetchRepo(repo.root);
      setRepo({ ...repo, branches });
      setFetchError(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setFetchError(fail(e));
    } finally {
      setFetching(false);
    }
  };

  const browse = async () => {
    const path = await openDialog({ directory: true, title: t("app.openTitle") });
    if (typeof path === "string") openRepo(path);
  };

  const exportCommits = async (commits: Commit[], format: ExportFormat, name: string) => {
    const path = await saveDialog({
      title: t("app.exportTitle"),
      defaultPath: `${name.replace(/[\\/:*?"<>|]+/g, "-")}.${extensions[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [extensions[format]] }],
    });
    if (!path) return;
    try {
      await api.exportCommits(commits, format, path);
      notify(t("app.exported", { count: commits.length, path }));
    } catch (e) {
      notify(t("app.exportFailed", { error: fail(e) }), true);
    }
  };

  const exportVisible = (format: ExportFormat) => exportCommits(visible, format, `${source ?? "history"}-history`);
  /** Selected commits as a txt for "Add by hash", oldest first as the cherry-pick applies them. */
  const exportHashes = (commits: Commit[], from: string | null) => exportCommits(orderByDate(commits), "txt", `${from ?? "commits"}-commits`);

  const applyQueue = (state: QueueState) => {
    setQueue(state.queue);
    setSession(state.session);
  };

  const startCherryPick = async (targets: { target: string; branch: string }[]) => {
    if (!repo) return;
    setSessionBusy(true);
    setStartError(null);
    setSessionError(null);
    try {
      applyQueue(await api.startQueue({ repo: repo.root, hashes: basket.commits.map((c) => c.hash), targets }));
      setBasket(emptyBasket);
    } catch (e) {
      // A failure before the queue was saved leaves nothing; a later one is shown with the queue.
      const saved = await api.currentQueue().catch(() => null);
      if (saved && isQueueActive(saved.queue)) {
        applyQueue(saved);
        setBasket(emptyBasket);
        setSessionError(fail(e));
      } else {
        setStartError(fail(e));
      }
    } finally {
      setSessionBusy(false);
    }
  };

  /** After the running target ends (pushed, nothing to push or aborted), the queue moves on. */
  const advance = async () => applyQueue(await api.advanceQueue());

  const runSession = async (action: () => Promise<Session>) => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      const s = await action();
      if (queue && isSessionFinished(s)) await advance();
      else setSession(s);
    } catch (e) {
      setSessionError(fail(e));
    } finally {
      setSessionBusy(false);
    }
  };

  /** A queue left between targets (the app was closed) continues with its next target. */
  const resumeQueue = async () => {
    setSessionBusy(true);
    setSessionError(null);
    try {
      await advance();
    } catch (e) {
      setSessionError(fail(e));
    } finally {
      setSessionBusy(false);
    }
  };

  const dismissQueue = async () => {
    try {
      await api.dismissQueue();
      setQueue(null);
      setSession(null);
      setSessionError(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSessionError(fail(e));
    }
  };

  const abort = async () => {
    if (!session) return;
    const rest = queue ? queue.entries.filter((e) => e.outcome === "pending").length : 0;
    const body = t("app.abortBody", { branch: session.branch }) + (rest > 0 ? ` ${t("queue.abortNote", { count: rest })}` : "");
    const confirmed = await ask(body, {
      title: t("app.abortTitle"),
      kind: "warning",
      okLabel: t("common.abort"),
      cancelLabel: t("app.abortKeep"),
    });
    if (!confirmed) return;
    setSessionBusy(true);
    try {
      const s = await api.abortCherryPick();
      setSession(null);
      if (queue) await advance();
      notify(s.warnings.length ? t("app.abortedWarnings", { warnings: s.warnings.map(te).join("; ") }) : t("app.aborted"));
    } catch (e) {
      setSessionError(fail(e));
    } finally {
      setSessionBusy(false);
    }
  };

  const dismiss = async () => {
    try {
      await api.dismissSession();
      setSession(null);
      setSessionLoadError(null);
      setSessionError(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSessionError(fail(e));
    }
  };

  const saveSettings = async (next: Settings) => {
    try {
      await api.saveSettings(next);
      setSettings(next);
      setDialog(null);
      setDialogError(null);
    } catch (e) {
      setDialogError(fail(e));
    }
  };

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      if (dialog) return;
      if (e.key === "F1") {
        e.preventDefault();
        if (repo) setSearchOpen(true);
      } else if (e.key === "/" && !typing && tab === "history") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F5") {
        e.preventDefault();
        fetchNow();
      } else if (e.key === "d" && e.ctrlKey && tab === "history") {
        e.preventDefault();
        setShowChanges(!showChanges);
      } else if (e.key === "o" && e.ctrlKey) {
        e.preventDefault();
        browse();
      } else if (e.key === "Enter" && e.ctrlKey && tab === "history" && selected.size > 0) {
        e.preventDefault();
        loadIntoCherryPick();
      } else if (e.key === "1" && e.altKey) {
        e.preventDefault();
        setTab("history");
      } else if (e.key === "2" && e.altKey) {
        e.preventDefault();
        setTab("cherry-pick");
      } else if (e.key === "3" && e.altKey) {
        e.preventDefault();
        setTab("code");
      } else if (e.key === "4" && e.altKey) {
        e.preventDefault();
        setTab("branches");
      } else if (e.key === "5" && e.altKey) {
        e.preventDefault();
        setTab("files");
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
            <span className="grow">{t("app.sessionUnreadable", { error: sessionLoadError })}</span>
            <button className="btn" onClick={dismiss}>
              {t("app.discardSession")}
            </button>
          </div>
        )}
        <StartScreen recents={settings.recentRepos} busy={openBusy} error={openError} onBrowse={browse} onOpen={openRepo} />
        {toastEl}
      </>
    );
  }

  // The Cherry-pick tab badge: progress while a session lives, else the commits waiting.
  const progress = session && sessionActive ? progressOf(session) : null;
  const targetsBadge = queue && queue.entries.length > 1 && isQueueActive(queue) ? `${targetsDone(queue).done + 1}/${queue.entries.length} · ` : "";
  const tabBadge = progress ? `${targetsBadge}${progress.done}/${progress.total}` : basket.commits.length > 0 ? String(basket.commits.length) : null;

  return (
    <div className="app">
      <Toolbar
        repoRoot={repo.root}
        branch={source}
        fetching={fetching}
        visibleCount={tab === "history" ? visible.length : 0}
        onOpenRepo={browse}
        onRevealRepo={() => api.revealFolder(repo.root).catch((e) => notify(fail(e), true))}
        onFetch={fetchNow}
        onExport={exportVisible}
        showChanges={tab === "history" ? showChanges : null}
        onToggleChanges={() => setShowChanges(!showChanges)}
        onSettings={() => {
          setDialogError(null);
          setDialog("settings");
        }}
      />
      <div className="tabs" role="tablist" aria-label={t("tabs.label")}>
        <button role="tab" id="tab-history" aria-controls="panel-history" aria-selected={tab === "history"} className="tab" onClick={() => setTab("history")} title="Alt+1">
          <History size={15} aria-hidden="true" /> {t("tabs.history")}
        </button>
        <button
          role="tab"
          id="tab-cherry-pick"
          aria-controls="panel-cherry-pick"
          aria-selected={tab === "cherry-pick"}
          className={`tab${stopped ? " alert" : ""}`}
          onClick={() => setTab("cherry-pick")}
          title="Alt+2"
        >
          {stopped ? <OctagonAlert size={15} aria-hidden="true" /> : <Cherry size={15} aria-hidden="true" />} {t("tabs.cherryPick")}
          {tabBadge && <span className="tab-badge mono">{tabBadge}</span>}
          {stopped && <span className="sr-only">{t("tabs.needsYou")}</span>}
        </button>
        <button role="tab" id="tab-code" aria-controls="panel-code" aria-selected={tab === "code"} className="tab" onClick={() => setTab("code")} title="Alt+3">
          <Code size={15} aria-hidden="true" /> {t("tabs.code")}
        </button>
        <button role="tab" id="tab-branches" aria-controls="panel-branches" aria-selected={tab === "branches"} className="tab" onClick={() => setTab("branches")} title="Alt+4">
          <Columns3 size={15} aria-hidden="true" /> {t("tabs.branches")}
        </button>
        <button role="tab" id="tab-files" aria-controls="panel-files" aria-selected={tab === "files"} className="tab" onClick={() => setTab("files")} title="Alt+5 · F1">
          <FolderTree size={15} aria-hidden="true" /> {t("tabs.files")}
        </button>
      </div>

      <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" hidden={tab !== "history"} className={`workspace${showChanges ? "" : " no-detail"}`}>
        <main className="center">
          <BranchPane
            ref={listRef}
            view={history}
            branches={repo.branches}
            sessionStatus={sessionStatus}
            searchRef={searchRef}
            onLoad={loadIntoCherryPick}
            onExportTxt={() => exportHashes([...selected.values()], source)}
            onOpen={openCodeFromHistory}
            notices={
              fetchError && (
                <div className="notice warn" role="status">
                  <TriangleAlert size={16} />
                  <span className="grow">{t("app.fetchFailed", { error: fetchError })}</span>
                  <button className="btn ghost" onClick={fetchNow}>
                    {t("common.retry")}
                  </button>
                </div>
              )
            }
          />
        </main>
        <aside className="detail" aria-label={t("detail.label")} hidden={!showChanges}>
          <CommitDetail commit={active} stat={detail?.stat ?? null} diff={detail?.diff ?? null} loading={detailLoading} error={detailError} onViewCode={openCodeFromHistory} />
        </aside>
      </div>

      <div id="panel-cherry-pick" role="tabpanel" aria-labelledby="tab-cherry-pick" hidden={tab !== "cherry-pick"} className="cp-panel">
        {queue && (session || isQueueActive(queue)) && <QueueStrip queue={queue} stopped={!!session && !sessionBusy} />}
        {session ? (
          <SessionPanel
            session={session}
            busy={sessionBusy}
            error={sessionError}
            editorCommand={settings.editorCommand}
            onOpenEditor={(files) => api.openInEditor(session.worktree, files).catch((e) => setSessionError(fail(e)))}
            onContinue={() => runSession(api.continueCherryPick)}
            onSkip={() => runSession(api.skipCommit)}
            onRetryPush={() => runSession(api.retryPush)}
            onRemove={(hash) => runSession(() => api.removePendingCommits([hash]))}
            onAbort={abort}
            onDismiss={dismiss}
            onCopy={(text) => navigator.clipboard.writeText(text).then(() => notify(t("app.copied")))}
          />
        ) : queue && isQueueActive(queue) ? (
          <div className="placeholder">
            <h2>{sessionBusy ? t("queue.applying") : t("queue.paused")}</h2>
            {sessionError && <p className="error-text">{sessionError}</p>}
            {!sessionBusy && (
              <button className="btn primary" onClick={resumeQueue}>
                {t("queue.resume")}
              </button>
            )}
          </div>
        ) : queue ? (
          <QueueSummary queue={queue} onDone={dismissQueue} onCopy={(text) => navigator.clipboard.writeText(text).then(() => notify(t("queue.copied")))} />
        ) : (
          <CherryPickSetup
            repoRoot={repo.root}
            branches={repo.branches}
            basket={basket}
            defaultTarget={filters.target}
            template={settings.branchTemplate}
            ticketPattern={settings.ticketPattern}
            busy={sessionBusy}
            error={startError}
            onAdd={(commits) => {
              const { basket: next, repeated } = addToBasket(basket, commits);
              setBasket(next);
              return repeated;
            }}
            onRemove={(hashes) => setBasket((b) => ({ ...b, commits: b.commits.filter((c) => !hashes.includes(c.hash)) }))}
            onExportTxt={() => exportHashes(basket.commits, basket.source)}
            onStart={startCherryPick}
          />
        )}
      </div>
      <div id="panel-code" role="tabpanel" aria-labelledby="tab-code" hidden={tab !== "code"} className="code-panel">
        {codeList ? (
          <CodeViewer
            repoRoot={repo.root}
            commit={codeList.commits[codeList.index] ?? null}
            active={tab === "code"}
            hasPrev={codeList.index > 0}
            hasNext={codeList.index < codeList.commits.length - 1}
            onPrev={() => setCodeList({ ...codeList, index: Math.max(0, codeList.index - 1) })}
            onNext={() => setCodeList({ ...codeList, index: Math.min(codeList.commits.length - 1, codeList.index + 1) })}
            notify={notify}
          />
        ) : (
          <CodeViewer
            repoRoot={repo.root}
            commit={active}
            active={tab === "code"}
            hasPrev={safeIndex > 0}
            hasNext={safeIndex < visible.length - 1}
            onPrev={() => history.setActiveIndex(Math.max(0, safeIndex - 1))}
            onNext={() => history.setActiveIndex(Math.min(visible.length - 1, safeIndex + 1))}
            notify={notify}
          />
        )}
      </div>
      <div id="panel-branches" role="tabpanel" aria-labelledby="tab-branches" hidden={tab !== "branches"} className="branches-panel">
        <div className="branches-bar">
          <span className="muted">{t("branches.intro")}</span>
          <div className="spacer" />
          <button
            className="btn"
            disabled={columns.length >= MAX_COLUMNS}
            title={columns.length >= MAX_COLUMNS ? t("branches.maximum", { count: MAX_COLUMNS }) : undefined}
            onClick={() => setColumns((all) => [...all, { id: nextColumnId++, initial: columnBranch(repo.branches, all.map((c) => c.initial ?? "")) }])}
          >
            <Plus size={16} /> {t("branches.add")}
          </button>
        </div>
        <div className="branch-cols" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((col, i) => (
            <BranchColumn
              key={col.id}
              repoRoot={repo.root}
              branches={repo.branches}
              initial={col.initial}
              number={i + 1}
              ticketPattern={settings.ticketPattern}
              reloadKey={reloadKey}
              sessionStatus={sessionStatus}
              canRemove={columns.length > MIN_COLUMNS}
              onRemove={() => setColumns((all) => all.filter((c) => c.id !== col.id))}
              onLoad={loadCommits}
              onExportTxt={(from, commits) => exportHashes(commits, from)}
              onOpen={(commits, index) => {
                setCodeList({ commits, index });
                setTab("code");
              }}
            />
          ))}
        </div>
      </div>
      <div id="panel-files" role="tabpanel" aria-labelledby="tab-files" hidden={tab !== "files"} className="code-panel">
        <FilesTab
          repoRoot={repo.root}
          branches={repo.branches}
          rev={explorerRev}
          onRev={(rev) => {
            setExplorerRev(rev);
            setExplorerPath(null);
          }}
          files={files}
          filesLoading={filesLoading}
          filesError={filesError}
          path={explorerPath}
          onPath={setExplorerPath}
          ticketPattern={settings.ticketPattern}
          active={tab === "files"}
          onOpenCommit={openCommitByHash}
          notify={notify}
        />
      </div>
      <FileSearch
        open={searchOpen}
        files={files}
        branch={explorerRev}
        onClose={() => setSearchOpen(false)}
        onPick={(path) => {
          setSearchOpen(false);
          setExplorerPath(path);
          setTab("files");
        }}
      />
      <SettingsDialog open={dialog === "settings"} settings={settings} error={dialogError} onCancel={() => setDialog(null)} onSave={saveSettings} />
      {toastEl}
    </div>
  );
}
