import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Code, Columns2, Copy, FileText, LoaderCircle, Rows3, TriangleAlert } from "lucide-react";
import { api, Commit, errorMessage, FileChange, FileVersions } from "../api";
import { buildRows, changeStops, FilePatch, Hunk, languageFor, parseHunks, Reveal, splitPatch } from "../diffModel";
import { highlightLines } from "../highlight";
import { DiffMode, DiffView, FullFile } from "./DiffView";
import { FileTree, statusLabel } from "./FileTree";
import { formatDate } from "./CommitList";
import { useI18n } from "../i18n";

interface Props {
  repoRoot: string;
  commit: Commit | null;
  active: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  notify: (text: string, error?: boolean) => void;
}

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
    // The preference is a convenience.
  }
}

const NO_REVEAL = new Map<string, Reveal>();
const NO_HUNKS: Hunk[] = [];

interface Loaded {
  hash: string;
  files: FileChange[];
  patches: Map<string, FilePatch>;
  truncated: boolean;
}

/** The Code tab: the files of one commit, its diff per file and navigation between changes. */
export function CodeViewer({ repoRoot, commit, active, hasPrev, hasNext, onPrev, onNext, notify }: Props) {
  const { t, te } = useI18n();
  const [mode, setModeState] = useState<DiffMode>(() => (readPref("diffMode") === "unified" ? "unified" : "split"));
  const setMode = (m: DiffMode) => {
    setModeState(m);
    writePref("diffMode", m);
  };
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<Map<string, FileVersions>>(new Map());
  // Patches fetched one by one when the whole-commit patch was cut off.
  const [extra, setExtra] = useState<Map<string, Hunk[]>>(new Map());
  const [reveal, setReveal] = useState<Map<string, Map<string, Reveal>>>(new Map());
  const [stopIndex, setStopIndex] = useState(-1);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const [fullFile, setFullFile] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const hash = commit?.hash ?? null;

  // Files and the whole patch of the commit.
  useEffect(() => {
    if (!hash || !active) return;
    if (loaded?.hash === hash && !error) return;
    let stale = false;
    setLoading(true);
    setError(null);
    Promise.all([api.commitFiles(repoRoot, hash), api.commitPatch(repoRoot, hash, ignoreWs)])
      .then(([files, patch]) => {
        if (stale) return;
        setLoaded({ hash, files, patches: splitPatch(patch.patch), truncated: patch.truncated });
        setVersions(new Map());
        setExtra(new Map());
        setReveal(new Map());
        setStopIndex(-1);
        setFullFile(false);
        setSelected((prev) => (prev && files.some((f) => f.path === prev) ? prev : (files[0]?.path ?? null)));
      })
      .catch((e) => !stale && setError(te(errorMessage(e))))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoRoot, hash, active]);

  // Whitespace changes the patch only; files and selection stay.
  const firstWs = useRef(true);
  useEffect(() => {
    if (firstWs.current) {
      firstWs.current = false;
      return;
    }
    if (!hash || !loaded) return;
    let stale = false;
    api
      .commitPatch(repoRoot, hash, ignoreWs)
      .then((patch) => {
        if (stale) return;
        setLoaded((l) => (l && l.hash === hash ? { ...l, patches: splitPatch(patch.patch), truncated: patch.truncated } : l));
        setExtra(new Map());
        setReveal(new Map());
        setStopIndex(-1);
      })
      .catch((e) => !stale && notify(te(errorMessage(e)), true));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ignoreWs]);

  const file = loaded?.files.find((f) => f.path === selected) ?? null;
  const filePatch = file ? loaded?.patches.get(file.path) : undefined;
  // A file missing from a complete patch has no hunks: with -w, git drops whitespace-only files.
  const hunks: Hunk[] | undefined = filePatch?.hunks ?? (file ? (extra.get(file.path) ?? (loaded && !loaded.truncated ? NO_HUNKS : undefined)) : undefined);

  // A file missing from a cut-off patch is fetched on its own.
  useEffect(() => {
    if (!hash || !file || !loaded?.truncated || loaded.patches.has(file.path) || extra.has(file.path)) return;
    let stale = false;
    api
      .fileDiff(repoRoot, hash, file.path, file.oldPath, ignoreWs)
      .then((d) => !stale && setExtra((m) => new Map(m).set(file.path, parseHunks(d.patch))))
      .catch((e) => !stale && notify(te(errorMessage(e)), true));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, file?.path, loaded, extra]);

  // Both versions of the selected file, for highlighting and expanding context.
  useEffect(() => {
    if (!hash || !file || versions.has(file.path)) return;
    let stale = false;
    api
      .fileVersions(repoRoot, hash, file.path, file.oldPath)
      .then((v) => !stale && setVersions((m) => new Map(m).set(file.path, v)))
      .catch(() => !stale && setVersions((m) => new Map(m).set(file.path, { old: null, new: null, binary: false, tooLarge: true })));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, file?.path, versions]);

  const v = file ? versions.get(file.path) : undefined;
  const language = file ? languageFor(file.path) : null;
  const newSegs = useMemo(() => (v?.new != null ? highlightLines(v.new, language) : null), [v, language]);
  const oldSegs = useMemo(() => (v?.old != null ? highlightLines(v.old, language) : null), [v, language]);
  const newLines = useMemo(() => (newSegs ? newSegs.map((l) => l.map((s) => s.text).join("")) : null), [newSegs]);

  const fileReveal = (file && reveal.get(file.path)) || NO_REVEAL;
  const rows = useMemo(() => (hunks ? buildRows(hunks, newLines, fileReveal) : []), [hunks, newLines, fileReveal]);

  const stops = useMemo(() => {
    if (!loaded) return [];
    return changeStops(loaded.files.map((f) => ({ path: f.path, hunks: loaded.patches.get(f.path)?.hunks ?? extra.get(f.path) ?? [] })));
  }, [loaded, extra]);

  const onReveal = useCallback(
    (key: string, side: "top" | "bottom", count: number) => {
      if (!file) return;
      setReveal((all) => {
        const next = new Map(all);
        const forFile = new Map(next.get(file.path) ?? []);
        const r = forFile.get(key) ?? { top: 0, bottom: 0 };
        forFile.set(key, { ...r, [side]: r[side] + count });
        next.set(file.path, forFile);
        return next;
      });
    },
    [file],
  );

  const goStop = (index: number) => {
    const stop = stops[index];
    if (!stop) return;
    setStopIndex(index);
    setFullFile(false);
    if (stop.path !== selected) setSelected(stop.path);
    setPendingScroll(stop.rowId);
  };
  const nextStop = () => goStop(stopIndex < 0 ? (stops.findIndex((s) => s.path === selected) >= 0 ? stops.findIndex((s) => s.path === selected) : 0) : Math.min(stopIndex + 1, stops.length - 1));
  const prevStop = () => goStop(Math.max(stopIndex - 1, 0));

  // Scroll to a change once its file has rendered.
  useEffect(() => {
    if (!pendingScroll) return;
    const el = bodyRef.current?.querySelector(`[data-row="${pendingScroll}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      setPendingScroll(null);
    }
  }, [pendingScroll, rows, mode]);

  // Keyboard: F7 / Shift+F7 and Alt+arrows for changes, J/K and Left/Right for commits.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "F7" || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))) {
        e.preventDefault();
        if (e.key === "ArrowUp" || (e.key === "F7" && e.shiftKey)) prevStop();
        else nextStop();
      } else if (!typing && !e.altKey && !e.ctrlKey && (e.key === "j" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (hasNext) onNext();
      } else if (!typing && !e.altKey && !e.ctrlKey && (e.key === "k" || e.key === "ArrowLeft")) {
        e.preventDefault();
        if (hasPrev) onPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!commit) {
    return (
      <div className="placeholder">
        <Code size={28} />
        <h2>{t("viewer.noneTitle")}</h2>
        <p>{t("viewer.noneBody")}</p>
      </div>
    );
  }

  const addedLines = new Set<number>((hunks ?? []).flatMap((h) => h.lines.filter((l) => l.kind === "add").map((l) => l.newNo ?? 0)));
  const fullSegs = file?.status === "deleted" ? oldSegs : newSegs;
  const stopLabel = stops.length === 0 ? t("viewer.noChanges") : stopIndex < 0 ? t("viewer.changesN", { count: stops.length }) : t("viewer.changeOf", { n: stopIndex + 1, total: stops.length });

  return (
    <section className="viewer" aria-label={t("tabs.code")}>
      <header className="viewer-head">
        <div className="commit-nav">
          <button className="btn ghost icon-btn" onClick={onPrev} disabled={!hasPrev} title={`${t("viewer.prevCommit")} (K)`} aria-label={t("viewer.prevCommit")}>
            <ChevronUp size={16} />
          </button>
          <button className="btn ghost icon-btn" onClick={onNext} disabled={!hasNext} title={`${t("viewer.nextCommit")} (J)`} aria-label={t("viewer.nextCommit")}>
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="viewer-title">
          <h1 title={commit.subject}>{commit.subject}</h1>
          <div className="meta">
            <span>{commit.authorName}</span>
            <span className="mono">{formatDate(commit.date)}</span>
            <span className="mono">{commit.shortHash}</span>
            {loaded && <span>{loaded.files.length === 1 ? t("detail.files1") : t("detail.filesN", { count: loaded.files.length })}</span>}
          </div>
        </div>
        <div className="viewer-tools">
          <div className="segmented" role="group" aria-label={t("viewer.layout")}>
            <button className={`btn${mode === "split" ? " on" : ""}`} aria-pressed={mode === "split"} onClick={() => setMode("split")} title={t("viewer.split")}>
              <Columns2 size={15} /> {t("viewer.split")}
            </button>
            <button className={`btn${mode === "unified" ? " on" : ""}`} aria-pressed={mode === "unified"} onClick={() => setMode("unified")} title={t("viewer.unified")}>
              <Rows3 size={15} /> {t("viewer.unified")}
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={ignoreWs} onChange={(e) => setIgnoreWs(e.target.checked)} />
            {t("viewer.ignoreWs")}
          </label>
          <div className="change-nav" role="group" aria-label={t("viewer.changes")}>
            <button className="btn icon-btn" onClick={prevStop} disabled={stops.length === 0 || stopIndex <= 0} title={`${t("viewer.prevChange")} (Shift+F7, Alt+↑)`} aria-label={t("viewer.prevChange")}>
              <ArrowUp size={16} />
            </button>
            <span className="mono" aria-live="polite">
              {stopLabel}
            </span>
            <button className="btn icon-btn" onClick={nextStop} disabled={stops.length === 0 || stopIndex >= stops.length - 1} title={`${t("viewer.nextChange")} (F7, Alt+↓)`} aria-label={t("viewer.nextChange")}>
              <ArrowDown size={16} />
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="notice error" role="alert">
          <TriangleAlert size={16} />
          <span className="grow">{t("detail.loadError", { error })}</span>
        </div>
      )}

      <div className="viewer-body">
        {loaded ? <FileTree files={loaded.files} selected={selected} onSelect={(p) => (setSelected(p), setFullFile(false), setStopIndex(-1))} /> : <div className="file-tree" />}
        <div className="viewer-main">
          {file && (
            <div className="file-head">
              <span className={`file-status ${file.status}`}>{t(statusLabel(file.status))}</span>
              <span className="path mono" title={file.path}>
                {file.oldPath && file.oldPath !== file.path && <span className="muted">{file.oldPath} → </span>}
                {file.path}
              </span>
              <span className="counts mono">
                {file.additions !== null && <span className="add">+{file.additions}</span>}
                {file.deletions !== null && <span className="del">−{file.deletions}</span>}
              </span>
              <div className="spacer" />
              <button className="btn ghost" onClick={() => navigator.clipboard.writeText(file.path).then(() => notify(t("viewer.pathCopied")))}>
                <Copy size={15} /> {t("viewer.copyPath")}
              </button>
              <button className={`btn ghost${fullFile ? " on" : ""}`} aria-pressed={fullFile} onClick={() => setFullFile((f) => !f)} disabled={!fullSegs}>
                <FileText size={15} /> {t("viewer.fullFile")}
              </button>
              <button className="btn ghost" onClick={() => api.openInEditor(repoRoot, file.status === "deleted" ? [] : [file.path]).catch((e) => notify(te(errorMessage(e)), true))}>
                <Code size={15} /> {t("viewer.openEditor")}
              </button>
            </div>
          )}
          <div className="viewer-scroll" ref={bodyRef}>
            {loading && !loaded && (
              <div className="placeholder">
                <LoaderCircle size={20} className="spin" />
              </div>
            )}
            {file && v?.binary && <p className="viewer-note">{t("viewer.binary")}</p>}
            {file && v?.tooLarge && <p className="viewer-note">{t("viewer.tooLarge")}</p>}
            {file && hunks && hunks.length === 0 && !v?.binary && <p className="viewer-note">{ignoreWs ? t("viewer.onlyWhitespace") : t("viewer.noContentChange")}</p>}
            {file && fullFile && fullSegs ? (
              <FullFile segs={fullSegs} added={file.status === "deleted" ? new Set() : addedLines} />
            ) : (
              file && hunks && hunks.length > 0 && <DiffView rows={rows} mode={mode} oldSegs={oldSegs} newSegs={newSegs} currentRow={stops[stopIndex]?.path === file.path ? stops[stopIndex].rowId : null} onReveal={onReveal} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
