import { memo, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, GitCommitHorizontal, History, LoaderCircle, Search, X } from "lucide-react";
import { api, Blame, Branch, Commit, errorMessage, FileContent } from "../api";
import { languageFor, markRanges, Range, Segment } from "../diffModel";
import { blameCard, findMatches } from "../explorerModel";
import { highlightLines, toLines } from "../highlight";
import { BranchPicker } from "./BranchPicker";
import { ExplorerTree } from "./ExplorerTree";
import { formatDate } from "./CommitList";
import { useI18n } from "../i18n";

interface Props {
  repoRoot: string;
  branches: Branch[];
  rev: string | null;
  onRev: (rev: string) => void;
  files: string[];
  filesLoading: boolean;
  filesError: string | null;
  path: string | null;
  onPath: (path: string) => void;
  ticketPattern: string;
  /** The tab is visible: only then does Ctrl+F belong to it. */
  active: boolean;
  onOpenCommit: (hash: string) => void;
  notify: (text: string, error?: boolean) => void;
}

interface RowProps {
  line: Segment[];
  index: number;
  hits: { range: Range; index: number }[] | undefined;
  same: boolean;
  pinned: boolean;
  current: boolean;
  onEnter: (e: MouseEvent<HTMLDivElement>) => void;
  onPick: (e: MouseEvent<HTMLDivElement>) => void;
}

/** One line of the file; memoized so hovering repaints only the lines that change. */
const FileRow = memo(function FileRow({ line, index, hits, same, pinned, current, onEnter, onPick }: RowProps) {
  const marked = hits ? markRanges(line, hits.map((h) => h.range)) : null;
  return (
    <div data-line={index} role="row" className={`d-row${same ? " same" : ""}${pinned ? " pinned" : ""}${current ? " current" : ""}`} onMouseEnter={onEnter} onClick={onPick}>
      <span className="num">{index + 1}</span>
      <span className="cell">
        <span className="code">
          {(marked ?? line).map((s, k) =>
            "changed" in s && s.changed ? (
              <mark key={k} className={`find-hit ${s.cls}`}>
                {s.text}
              </mark>
            ) : (
              <span key={k} className={s.cls || undefined}>
                {s.text}
              </span>
            ),
          )}
          {line.length === 0 && " "}
        </span>
      </span>
    </div>
  );
});

/** The Files tab: a branch's tree, the chosen file and who changed each line. */
export function FilesTab({ repoRoot, branches, rev, onRev, files, filesLoading, filesError, path, onPath, ticketPattern, active, onOpenCommit, notify }: Props) {
  const { t, te } = useI18n();
  const [file, setFile] = useState<FileContent | null>(null);
  const [blame, setBlame] = useState<Blame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ line: number; top: number } | null>(null);
  const [pinned, setPinned] = useState<{ line: number; top: number } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Commit[] | null>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFile(null);
    setBlame(null);
    setHover(null);
    setPinned(null);
    setHistory(null);
    if (!rev || !path) return;
    let stale = false;
    setLoading(true);
    setError(null);
    api
      .readFile(repoRoot, rev, path)
      .then((f) => !stale && setFile(f))
      .catch((e) => !stale && setError(te(errorMessage(e))))
      .finally(() => !stale && setLoading(false));
    // Blame is a bonus: the file still shows when it fails.
    api
      .blameFile(repoRoot, rev, path)
      .then((b) => !stale && setBlame(b))
      .catch(() => undefined);
    scrollRef.current?.scrollTo({ top: 0 });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoRoot, rev, path]);

  useEffect(() => {
    if (!historyOpen || !rev || !path || history) return;
    let stale = false;
    api
      .fileLog(repoRoot, rev, path, ticketPattern)
      .then((log) => !stale && setHistory(log))
      .catch((e) => !stale && notify(te(errorMessage(e)), true));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, repoRoot, rev, path, history]);

  const content = file?.content ?? null;
  const segs = useMemo(() => (content !== null && path ? highlightLines(content, languageFor(path)) : []), [content, path]);
  const lines = useMemo(() => (content !== null ? toLines(content) : []), [content]);
  const matches = useMemo(() => findMatches(lines, findOpen ? query : ""), [lines, query, findOpen]);
  const current = matches.length > 0 ? Math.min(hit, matches.length - 1) : -1;
  const byLine = useMemo(() => {
    const map = new Map<number, { range: Range; index: number }[]>();
    matches.forEach((m, index) => map.set(m.line, [...(map.get(m.line) ?? []), { range: [m.start, m.end], index }]));
    return map;
  }, [matches]);

  const shown = pinned ?? hover;
  const card = blame && shown ? blameCard(blame, shown.line) : null;
  const same = useMemo(() => new Set(card?.lines ?? []), [card?.hash]);

  // The current match scrolls into view.
  useEffect(() => {
    if (current < 0) return;
    scrollRef.current?.querySelector(`[data-line="${matches[current].line}"]`)?.scrollIntoView({ block: "center" });
  }, [current, matches]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" && e.ctrlKey && content !== null) {
        e.preventDefault();
        setFindOpen(true);
        window.setTimeout(() => findRef.current?.select(), 0);
      } else if (e.key === "Escape" && pinned && !(e.target instanceof HTMLInputElement)) {
        setPinned(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, content, pinned]);

  // Stable handlers keep the memoized rows from repainting on every hover.
  const onEnter = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const line = Number(e.currentTarget.dataset.line);
    const top = e.currentTarget.offsetTop;
    setHover((h) => (h?.line === line ? h : { line, top }));
  }, []);
  const onPick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const line = Number(e.currentTarget.dataset.line);
    const top = e.currentTarget.offsetTop;
    setPinned((p) => (p?.line === line ? null : { line, top }));
  }, []);

  const step = (delta: number) => matches.length > 0 && setHit((current + delta + matches.length) % matches.length);
  const copy = (text: string, done: string) => navigator.clipboard.writeText(text).then(() => notify(done));

  return (
    <section className="viewer files-view" aria-label={t("tabs.files")}>
      <header className="viewer-head">
        <div className="field files-branch">
          <span className="sr-only">{t("files.branch")}</span>
          <BranchPicker branches={branches} value={rev} onChange={onRev} label={t("files.branch")} />
        </div>
        <div className="viewer-title">
          <span className="meta">{filesLoading ? t("filters.loading") : files.length === 1 ? t("files.count1") : t("files.count", { count: files.length })} · F1</span>
        </div>
      </header>
      {filesError && (
        <div className="notice error" role="alert">
          <span className="grow">{filesError}</span>
        </div>
      )}
      <div className={`viewer-body${historyOpen && path ? " with-history" : ""}`}>
        <ExplorerTree files={files} selected={path} onSelect={onPath} />
        <div className="viewer-main">
          {path && (
            <div className="file-head">
              <span className="path mono" title={path}>
                {path}
              </span>
              <span className="spacer" />
              <button className="btn ghost" onClick={() => copy(path, t("files.pathCopied"))} title={t("files.copyPath")}>
                <Copy size={14} /> {t("files.copyPath")}
              </button>
              <button className={`btn ghost${findOpen ? " on" : ""}`} onClick={() => setFindOpen((o) => !o)} disabled={content === null} title={`${t("files.find")} (Ctrl+F)`}>
                <Search size={14} /> {t("files.find")}
              </button>
              <button className={`btn ghost${historyOpen ? " on" : ""}`} onClick={() => setHistoryOpen((o) => !o)} aria-pressed={historyOpen}>
                <History size={14} /> {t("files.history")}
              </button>
            </div>
          )}
          {findOpen && content !== null && (
            <div className="find-bar" role="search">
              <input
                ref={findRef}
                className="input"
                autoFocus
                aria-label={t("files.find")}
                placeholder={t("files.findPlaceholder")}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHit(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") step(e.shiftKey ? -1 : 1);
                  if (e.key === "Escape") setFindOpen(false);
                }}
              />
              <span className="muted" aria-live="polite">
                {query ? (matches.length > 0 ? t("files.findCount", { current: current + 1, total: matches.length }) : t("files.noMatches")) : ""}
              </span>
              <button className="btn ghost icon-btn" onClick={() => step(-1)} disabled={matches.length === 0} aria-label={t("files.prev")} title={`${t("files.prev")} (Shift+Enter)`}>
                <ChevronUp size={14} />
              </button>
              <button className="btn ghost icon-btn" onClick={() => step(1)} disabled={matches.length === 0} aria-label={t("files.next")} title={`${t("files.next")} (Enter)`}>
                <ChevronDown size={14} />
              </button>
              <button className="btn ghost icon-btn" onClick={() => setFindOpen(false)} aria-label={t("common.close")}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className="viewer-scroll blame-scroll" ref={scrollRef}>
            {!path && <p className="viewer-note">{t("files.pick")}</p>}
            {loading && (
              <p className="viewer-note">
                <LoaderCircle size={14} className="spin" /> {t("filters.loading")}
              </p>
            )}
            {error && <p className="viewer-note error-text">{error}</p>}
            {file?.binary && <p className="viewer-note">{t("viewer.binary")}</p>}
            {file?.tooLarge && <p className="viewer-note">{t("viewer.tooLarge")}</p>}
            {content !== null && (
              <div className="diff-table full blame-table" role="table" aria-label={path ?? ""} onMouseLeave={() => setHover(null)}>
                {segs.map((line, i) => {
                  const hits = byLine.get(i);
                  return (
                    <FileRow
                      key={i}
                      line={line}
                      index={i}
                      hits={hits}
                      same={same.has(i)}
                      pinned={pinned?.line === i}
                      current={!!hits && hits.some((h) => h.index === current)}
                      onEnter={onEnter}
                      onPick={onPick}
                    />
                  );
                })}
                {card && shown && (
                  <div className={`blame-card${pinned ? " pinned" : ""}`} style={{ top: shown.top + 22 }} role={pinned ? "dialog" : "tooltip"} aria-label={t("files.blameTitle")}>
                    <div className="blame-head">
                      <GitCommitHorizontal size={14} aria-hidden="true" />
                      <span className="mono">{card.shortHash}</span>
                      <span className="muted">
                        {card.author} · {formatDate(card.date)}
                      </span>
                    </div>
                    <p className="blame-subject">{card.subject}</p>
                    {pinned ? (
                      <div className="actions">
                        <button className="btn primary" onClick={() => onOpenCommit(card.hash)}>
                          {t("files.viewCommit")}
                        </button>
                        <button className="btn" onClick={() => copy(card.hash, t("files.hashCopied"))}>
                          <Copy size={14} /> {t("files.copyHash")}
                        </button>
                        <button className="btn ghost icon-btn" onClick={() => setPinned(null)} aria-label={t("common.close")} title={`${t("common.close")} (Esc)`}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <p className="hint">{t("files.pinHint", { count: card.lines.length })}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {historyOpen && path && (
          <aside className="file-history" aria-label={t("files.history")}>
            <h2>{t("files.historyTitle")}</h2>
            {history === null ? (
              <p className="viewer-note">
                <LoaderCircle size={14} className="spin" /> {t("filters.loading")}
              </p>
            ) : history.length === 0 ? (
              <p className="viewer-note">{t("files.historyEmpty")}</p>
            ) : (
              <ol>
                {history.map((c) => (
                  <li key={c.hash}>
                    <button className={`history-item${card?.hash === c.hash ? " same" : ""}`} onClick={() => onOpenCommit(c.hash)} title={t("files.viewCommit")}>
                      <span className="subject">{c.subject}</span>
                      <span className="muted mono">
                        {c.shortHash} · {c.authorName} · {formatDate(c.date).slice(0, 10)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
