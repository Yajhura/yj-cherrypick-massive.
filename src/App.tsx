import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Cherry, CircleCheck, Code, History, OctagonAlert, TriangleAlert } from "lucide-react";
import { api, Author, Branch, Commit, errorMessage, ExportFormat, isSessionFinished, OpenedRepo, Session, Settings } from "./api";
import { addToBasket, Basket, emptyBasket, loadIntoBasket, polledSession, progressOf, rangeBetween } from "./basket";
import { emptyFilters, Filters, useCommitDetail, useCommits } from "./hooks";
import { Toolbar } from "./components/Toolbar";
import { FilterBar } from "./components/FilterBar";
import { CommitList, isSelectable } from "./components/CommitList";
import { CommitDetail } from "./components/CommitDetail";
import { Display, displayOf, SessionPanel } from "./components/SessionPanel";
import { CherryPickSetup } from "./components/CherryPickSetup";
import { CodeViewer } from "./components/CodeViewer";
import { SettingsDialog } from "./components/SettingsDialog";
import { StartScreen } from "./components/StartScreen";
import { notifyInBackground } from "./notify";
import { I18nProvider, useI18n } from "./i18n";

type Tab = "history" | "cherry-pick" | "code";

/** How often the saved session is read while the engine applies commits. */
const PROGRESS_POLL_MS = 600;

const defaultSettings: Settings = {
  recentRepos: [],
  ticketPattern: "[A-Z]+-\\d+",
  branchTemplate: "cherry-pick/{target}/{date}",
  editorCommand: "code",
  language: "auto",
};

const extensions: Record<ExportFormat, string> = { xlsx: "xlsx", csv: "csv", markdown: "md" };

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
  const [source, setSource] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Map<string, Commit>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);
  const [tab, setTab] = useState<Tab>("history");
  const [basket, setBasket] = useState<Basket>(emptyBasket);
  const [startError, setStartError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
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
      setSource(defaultSource(opened.branches));
      setFilters(emptyFilters);
      setSelected(new Map());
      setActiveIndex(0);
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
    api
      .currentSession()
      .then((s) => {
        if (s && !isSessionFinished(s)) {
          setSession(s);
          setTab("cherry-pick");
          openRepo(s.repo);
        }
      })
      .catch((e) => setSessionLoadError(fail(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRepo]);

  // Authors of the current branch feed the author filter; a failure only empties it.
  const [authors, setAuthors] = useState<Author[]>([]);
  useEffect(() => {
    if (!repo || !source) return setAuthors([]);
    let cancelled = false;
    api
      .listAuthors(repo.root, source)
      .then((list) => !cancelled && setAuthors(list))
      .catch(() => !cancelled && setAuthors([]));
    return () => {
      cancelled = true;
    };
  }, [repo, source, reloadKey]);

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
  };

  const toggle = (c: Commit) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.hash)) next.delete(c.hash);
      else next.set(c.hash, c);
      return next;
    });

  const selectRange = (from: number, to: number) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of rangeBetween(visible, from, to)) next.set(c.hash, c);
      return next;
    });

  const selectAll = () => setSelected(new Map(visible.filter(isSelectable).map((c) => [c.hash, c])));

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
        .currentSession()
        .then((s) => {
          const live = polledSession(s);
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
  const doneKey = session?.state.kind === "completed" ? session.branch : undefined;
  useEffect(() => {
    if (doneKey) notifyInBackground(t("notify.doneTitle"), doneKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  const loadIntoCherryPick = async () => {
    if (!source || selected.size === 0) return;
    const result = loadIntoBasket(basket, source, [...selected.values()]);
    let next: Basket;
    if (result.kind === "confirm") {
      const confirmed = await ask(t("basket.replaceBody", { current: result.current ?? "", source }), {
        title: t("basket.replaceTitle"),
        kind: "warning",
        okLabel: t("basket.replace"),
        cancelLabel: t("common.cancel"),
      });
      if (!confirmed) return;
      next = result.replacement;
    } else {
      next = result.basket;
    }
    setBasket(next);
    setSelected(new Map());
    setStartError(null);
    setTab("cherry-pick");
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

  const exportVisible = async (format: ExportFormat) => {
    const base = (source ?? "history").replace(/[\\/:*?"<>|]+/g, "-");
    const path = await saveDialog({
      title: t("app.exportTitle"),
      defaultPath: `${base}-history.${extensions[format]}`,
      filters: [{ name: format.toUpperCase(), extensions: [extensions[format]] }],
    });
    if (!path) return;
    try {
      await api.exportCommits(visible, format, path);
      notify(t("app.exported", { count: visible.length, path }));
    } catch (e) {
      notify(t("app.exportFailed", { error: fail(e) }), true);
    }
  };

  const startCherryPick = async (target: string, branch: string) => {
    if (!repo) return;
    setSessionBusy(true);
    setStartError(null);
    setSessionError(null);
    try {
      const s = await api.startCherryPick({ repo: repo.root, target, branch, hashes: basket.commits.map((c) => c.hash) });
      setSession(s);
      setBasket(emptyBasket);
    } catch (e) {
      // A failure before the first pick leaves no session; a later one is shown with it.
      const saved = polledSession(await api.currentSession().catch(() => null));
      if (saved) {
        setSession(saved);
        setBasket(emptyBasket);
        setSessionError(fail(e));
      } else {
        setStartError(fail(e));
      }
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
      setSessionError(fail(e));
    } finally {
      setSessionBusy(false);
    }
  };

  const abort = async () => {
    if (!session) return;
    const confirmed = await ask(t("app.abortBody", { branch: session.branch }), {
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
      if (e.key === "/" && !typing && tab === "history") {
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
  const tabBadge = progress ? `${progress.done}/${progress.total}` : basket.commits.length > 0 ? String(basket.commits.length) : null;

  return (
    <div className="app">
      <Toolbar
        repoRoot={repo.root}
        branch={source}
        fetching={fetching}
        visibleCount={tab === "history" ? visible.length : 0}
        onOpenRepo={browse}
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
      </div>

      <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" hidden={tab !== "history"} className={`workspace${showChanges ? "" : " no-detail"}`}>
        <main className="center">
          <FilterBar
            ref={searchRef}
            filters={filters}
            branches={repo.branches}
            authors={authors}
            source={source}
            shown={visible.length}
            selected={selected.size}
            loading={loading}
            onSource={selectBranch}
            onLoad={loadIntoCherryPick}
            onChange={(patch) => {
              setFilters((f) => ({ ...f, ...patch, hideApplied: (patch.target ?? f.target) ? (patch.hideApplied ?? f.hideApplied) : false }));
              setActiveIndex(0);
            }}
          />
          {fetchError && (
            <div className="notice warn" role="status">
              <TriangleAlert size={16} />
              <span className="grow">{t("app.fetchFailed", { error: fetchError })}</span>
              <button className="btn ghost" onClick={fetchNow}>
                {t("common.retry")}
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
              <span className="grow">{t("app.truncated")}</span>
            </div>
          )}
          {!loading && !listError && visible.length === 0 ? (
            <div className="placeholder">
              <h2>{t("app.noMatchTitle")}</h2>
              <p>{filters.target ? t("app.noMatchTarget", { source: source ?? "", target: filters.target }) : t("app.noMatchBody")}</p>
              <button className="btn" onClick={() => setFilters(emptyFilters)}>
                {t("app.clearFilters")}
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
              onSelectRange={selectRange}
              onOpen={() => setTab("code")}
              onSelectAll={selectAll}
              onClearSelection={() => setSelected(new Map())}
            />
          )}
        </main>
        <aside className="detail" aria-label={t("detail.label")} hidden={!showChanges}>
          <CommitDetail commit={active} stat={detail?.stat ?? null} diff={detail?.diff ?? null} loading={detailLoading} error={detailError} onViewCode={() => setTab("code")} />
        </aside>
      </div>

      <div id="panel-cherry-pick" role="tabpanel" aria-labelledby="tab-cherry-pick" hidden={tab !== "cherry-pick"} className="cp-panel">
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
            onStart={startCherryPick}
          />
        )}
      </div>
      <div id="panel-code" role="tabpanel" aria-labelledby="tab-code" hidden={tab !== "code"} className="code-panel">
        <CodeViewer
          repoRoot={repo.root}
          commit={active}
          active={tab === "code"}
          hasPrev={safeIndex > 0}
          hasNext={safeIndex < visible.length - 1}
          onPrev={() => setActiveIndex(Math.max(0, safeIndex - 1))}
          onNext={() => setActiveIndex(Math.min(visible.length - 1, safeIndex + 1))}
          notify={notify}
        />
      </div>
      <SettingsDialog open={dialog === "settings"} settings={settings} error={dialogError} onCancel={() => setDialog(null)} onSave={saveSettings} />
      {toastEl}
    </div>
  );
}
