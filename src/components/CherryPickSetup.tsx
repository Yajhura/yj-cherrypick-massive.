import { useEffect, useMemo, useState } from "react";
import { Cherry, Hash, LoaderCircle, Trash2, X } from "lucide-react";
import { api, Branch, Commit, errorMessage } from "../api";
import { Basket, orderByDate } from "../basket";
import { BranchPicker } from "./BranchPicker";
import { formatDate } from "./CommitList";
import { useI18n } from "../i18n";

interface Props {
  repoRoot: string;
  branches: Branch[];
  basket: Basket;
  defaultTarget: string;
  template: string;
  ticketPattern: string;
  busy: boolean;
  error: string | null;
  onAdd: (commits: Commit[]) => number;
  onRemove: (hashes: string[]) => void;
  onStart: (target: string, branch: string) => void;
}

function pickDefaultTarget(branches: Branch[], preferred: string, source: string | null): string {
  if (preferred && preferred !== source) return preferred;
  for (const name of ["origin/release", "origin/main", "origin/master"]) {
    if (name !== source && branches.some((b) => b.name === name)) return name;
  }
  return branches.find((b) => b.isRemote && b.name !== source)?.name ?? "";
}

/** The Cherry-pick tab before a session starts: commits to apply, target and new branch. */
export function CherryPickSetup({ repoRoot, branches, basket, defaultTarget, template, ticketPattern, busy, error, onAdd, onRemove, onStart }: Props) {
  const { t, te } = useI18n();
  const [target, setTarget] = useState(() => pickDefaultTarget(branches, defaultTarget, basket.source));
  const [branch, setBranch] = useState("");
  const [edited, setEdited] = useState(false);
  const [inTarget, setInTarget] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [looking, setLooking] = useState(false);
  const [report, setReport] = useState<{ text: string; error?: boolean } | null>(null);

  const ordered = useMemo(() => orderByDate(basket.commits), [basket.commits]);
  const tickets = useMemo(() => [...new Set(ordered.flatMap((c) => c.tickets))], [ordered]);
  const hashesKey = ordered.map((c) => c.hash).join(",");

  useEffect(() => {
    if (!target) setTarget(pickDefaultTarget(branches, defaultTarget, basket.source));
  }, [branches, defaultTarget, basket.source, target]);

  // The suggested name follows the target and tickets until the user edits it.
  useEffect(() => {
    if (edited || !target) return;
    let stale = false;
    api
      .renderBranchName(template, target, tickets)
      .then((name) => !stale && setBranch(name))
      .catch(() => !stale && setBranch(""));
    return () => {
      stale = true;
    };
  }, [edited, target, template, tickets]);

  // Mark what the target already has, for commits of any branch.
  useEffect(() => {
    if (!target || hashesKey === "") return setInTarget(new Set());
    let stale = false;
    setChecking(true);
    api
      .commitsInTarget(repoRoot, hashesKey.split(","), target)
      .then((found) => !stale && setInTarget(new Set(found)))
      .catch(() => !stale && setInTarget(new Set()))
      .finally(() => !stale && setChecking(false));
    return () => {
      stale = true;
    };
  }, [repoRoot, target, hashesKey]);

  const already = ordered.filter((c) => inTarget.has(c.hash));
  const localTarget = target !== "" && !branches.find((b) => b.name === target)?.isRemote;

  const addPasted = async () => {
    setLooking(true);
    setReport(null);
    try {
      const found = await api.lookupCommits(repoRoot, pasted, ticketPattern);
      const repeated = onAdd(found.commits);
      const parts = [t("basket.added", { count: found.commits.length - repeated })];
      if (repeated > 0) parts.push(t("basket.repeated", { count: repeated }));
      if (found.merges.length > 0) parts.push(t("basket.merges", { list: found.merges.join(", ") }));
      if (found.unknown.length > 0) parts.push(t("basket.unknown", { list: found.unknown.join(", ") }));
      setReport({ text: parts.join(" · "), error: found.unknown.length > 0 || found.merges.length > 0 });
      if (found.unknown.length === 0) {
        setPasted("");
        setPasteOpen(false);
      }
    } catch (e) {
      setReport({ text: te(errorMessage(e)), error: true });
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="cp-setup">
      <div className="cp-head">
        <div className="field target-field">
          <span>{t("dialog.onto")}</span>
          <BranchPicker branches={branches} value={target || null} onChange={setTarget} label={t("dialog.onto")} exclude={basket.source} disabled={busy} />
        </div>
        <label className="field name-field">
          <span>{t("dialog.newBranch")}</span>
          <input
            className="input mono"
            value={branch}
            disabled={busy}
            onChange={(e) => {
              setEdited(true);
              setBranch(e.target.value);
            }}
          />
        </label>
        <button className="btn primary start-btn" onClick={() => onStart(target, branch.trim())} disabled={busy || !target || !branch.trim() || ordered.length === 0}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Cherry size={16} />}
          {busy ? t("dialog.starting") : t("dialog.start")}
        </button>
        <p className="hint cp-hint">{localTarget ? t("dialog.localHint") : t("dialog.newBranchHint")}</p>
      </div>

      {error && (
        <div className="notice error" role="alert">
          <span className="grow">{error}</span>
        </div>
      )}

      <div className="cp-bar">
        <span>
          <b>{ordered.length === 1 ? t("filters.count1") : t("filters.countN", { count: ordered.length })}</b>
          {basket.source && <span className="muted"> · {t("basket.from", { source: basket.source })}</span>}
          {checking && <span className="muted"> · {t("basket.checking")}</span>}
        </span>
        <div className="spacer" />
        {already.length > 0 && (
          <button className="btn" onClick={() => onRemove(already.map((c) => c.hash))} disabled={busy}>
            <Trash2 size={16} /> {t("basket.removeInTarget", { count: already.length })}
          </button>
        )}
        <button className="btn" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen} disabled={busy}>
          <Hash size={16} /> {t("basket.addHash")}
        </button>
        <button className="btn ghost" onClick={() => onRemove(ordered.map((c) => c.hash))} disabled={busy || ordered.length === 0}>
          {t("basket.clear")}
        </button>
      </div>

      {pasteOpen && (
        <div className="cp-paste">
          <label className="field">
            <span>{t("basket.hashLabel")}</span>
            <textarea
              className="input mono"
              rows={3}
              autoFocus
              placeholder={t("basket.hashPlaceholder")}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey && pasted.trim()) addPasted();
                if (e.key === "Escape") setPasteOpen(false);
              }}
            />
          </label>
          <div className="actions">
            <button className="btn primary" onClick={addPasted} disabled={looking || !pasted.trim()}>
              {looking && <LoaderCircle size={16} className="spin" />} {t("basket.hashAdd")}
            </button>
            <button className="btn" onClick={() => setPasteOpen(false)}>
              {t("common.cancel")}
            </button>
            <span className="hint">{t("basket.hashHelp")}</span>
          </div>
        </div>
      )}
      {report && (
        <div className={`notice ${report.error ? "warn" : "ok"}`} role="status">
          <span className="grow">{report.text}</span>
          <button className="btn ghost icon-btn" onClick={() => setReport(null)} aria-label={t("common.close")}>
            <X size={14} />
          </button>
        </div>
      )}

      {ordered.length === 0 ? (
        <div className="placeholder">
          <Cherry size={28} />
          <h2>{t("basket.emptyTitle")}</h2>
          <p>{t("basket.emptyBody")}</p>
        </div>
      ) : (
        <div className="cp-table" role="table" aria-label={t("basket.title")}>
          <div className="cp-row cp-th" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">{t("list.hash")}</span>
            <span role="columnheader">{t("list.subject")}</span>
            <span role="columnheader">{t("list.author")}</span>
            <span role="columnheader">{t("list.date")}</span>
            <span role="columnheader">{t("list.status")}</span>
            <span role="columnheader" className="sr-only">
              {t("basket.removeCol")}
            </span>
          </div>
          {ordered.map((c, i) => (
            <div key={c.hash} className="cp-row" role="row">
              <span className="mono muted">{i + 1}</span>
              <span className="mono">{c.shortHash}</span>
              <span className="subject" title={c.subject}>
                {c.subject}
              </span>
              <span className="muted ellipsis" title={`${c.authorName} <${c.authorEmail}>`}>
                {c.authorName}
              </span>
              <span className="mono muted">{formatDate(c.date)}</span>
              <span>{inTarget.has(c.hash) ? <span className="badge applied">{t("basket.inTarget")}</span> : <span className="status pending">{t("status.pending")}</span>}</span>
              <button className="btn ghost icon-btn" onClick={() => onRemove([c.hash])} disabled={busy} aria-label={t("basket.remove", { hash: c.shortHash })} title={t("basket.remove", { hash: c.shortHash })}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
