import { useEffect, useMemo, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { Cherry, FileDown, Hash, LoaderCircle, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { api, Branch, Commit, errorMessage } from "../api";
import { Basket, inEveryTarget, orderByDate, suggestTarget } from "../basket";
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
  /** Saves the commits to apply as a txt for "Add by hash". */
  onExportTxt: () => void;
  onStart: (targets: { target: string; branch: string }[]) => void;
}

interface TargetRow {
  id: number;
  target: string;
  branch: string;
  /** Once the user types a name, the template no longer overwrites it. */
  edited: boolean;
}

let nextRowId = 1;

function newRow(target: string): TargetRow {
  return { id: nextRowId++, target, branch: "", edited: false };
}

/** Target names without the remote, for compact labels: origin/release/2 -> release/2. */
const shortName = (target: string) => target.replace(/^[^/]+\//, "");

/** The Cherry-pick tab before a session starts: commits to apply, target and new branch. */
export function CherryPickSetup({ repoRoot, branches, basket, defaultTarget, template, ticketPattern, busy, error, onAdd, onRemove, onExportTxt, onStart }: Props) {
  const { t, te } = useI18n();
  const [rows, setRows] = useState<TargetRow[]>(() => [
    newRow(defaultTarget && defaultTarget !== basket.source ? defaultTarget : suggestTarget(branches, [], basket.source)),
  ]);
  const [found, setFound] = useState<Map<string, Set<string>>>(new Map());
  const [checking, setChecking] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [looking, setLooking] = useState(false);
  const [report, setReport] = useState<{ text: string; error?: boolean } | null>(null);
  // Branch names that already exist: the run adds the commits on top of them.
  const [existing, setExisting] = useState<Set<string>>(new Set());

  const ordered = useMemo(() => orderByDate(basket.commits), [basket.commits]);
  const tickets = useMemo(() => [...new Set(ordered.flatMap((c) => c.tickets))], [ordered]);
  const hashesKey = ordered.map((c) => c.hash).join(",");

  const targets = rows.map((r) => r.target).filter(Boolean);
  const targetsKey = targets.join("\n");
  const autoKey = rows.map((r) => (r.edited ? "" : r.target)).join("\n");

  const update = (id: number, patch: Partial<TargetRow>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Suggested names follow each target and the tickets until the user edits them.
  useEffect(() => {
    let stale = false;
    for (const row of rows) {
      if (row.edited || !row.target) continue;
      api
        .renderBranchName(template, row.target, tickets)
        .then((name) => !stale && setRows((all) => all.map((r) => (r.id === row.id && !r.edited ? { ...r, branch: name } : r))))
        .catch(() => undefined);
    }
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey, template, tickets]);

  // Mark what each target already has, for commits of any branch.
  useEffect(() => {
    if (targetsKey === "" || hashesKey === "") return setFound(new Map());
    let stale = false;
    setChecking(true);
    Promise.all(
      targetsKey.split("\n").map((target) =>
        api
          .commitsInTarget(repoRoot, hashesKey.split(","), target)
          .then((hashes) => [target, new Set(hashes)] as const)
          .catch(() => [target, new Set<string>()] as const),
      ),
    )
      .then((pairs) => !stale && setFound(new Map(pairs)))
      .finally(() => !stale && setChecking(false));
    return () => {
      stale = true;
    };
  }, [repoRoot, targetsKey, hashesKey]);

  // Names are checked once the user stops typing.
  const namesKey = rows.map((r) => r.branch.trim()).join("\n");
  useEffect(() => {
    const names = namesKey.split("\n").filter(Boolean);
    if (names.length === 0) return setExisting(new Set());
    let stale = false;
    const timer = window.setTimeout(() => {
      api
        .existingBranches(repoRoot, names)
        .then((found) => !stale && setExisting(new Set(found)))
        .catch(() => !stale && setExisting(new Set()));
    }, 300);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [repoRoot, namesKey]);

  const start = async () => {
    const targets = rows.map((r) => ({ target: r.target, branch: r.branch.trim() }));
    const reused = targets.filter((r) => existing.has(r.branch)).map((r) => r.branch);
    if (reused.length > 0) {
      const confirmed = await ask(t("dialog.existingBody", { list: reused.join("\n") }), {
        title: t("dialog.existingTitle", { count: reused.length }),
        kind: "warning",
        okLabel: t("dialog.existingOk"),
        cancelLabel: t("common.cancel"),
      });
      if (!confirmed) return;
    }
    onStart(targets);
  };

  const already = inEveryTarget(found, ordered.map((c) => c.hash), targets);
  const localTarget = rows.some((r) => r.target !== "" && !branches.find((b) => b.name === r.target)?.isRemote);
  const ready = rows.length > 0 && rows.every((r) => r.target && r.branch.trim()) && ordered.length > 0;
  const presentIn = (hash: string) => targets.filter((t) => found.get(t)?.has(hash));

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
        <div className="cp-targets" role="group" aria-label={t("queue.targets")}>
          <div className="cp-target cp-target-head" aria-hidden="true">
            <span>{t("dialog.onto")}</span>
            <span>{t("dialog.newBranch")}</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div key={row.id} className="cp-target target-field">
              <BranchPicker
                branches={branches}
                value={row.target || null}
                onChange={(target) => update(row.id, { target })}
                label={`${t("dialog.onto")} ${i + 1}`}
                exclude={basket.source}
                disabled={busy}
              />
              <div className="name-wrap">
                <input
                  className={`input mono name-field${existing.has(row.branch.trim()) ? " exists" : ""}`}
                  aria-label={`${t("dialog.newBranch")} ${i + 1}`}
                  aria-describedby={existing.has(row.branch.trim()) ? `exists-${row.id}` : undefined}
                  value={row.branch}
                  disabled={busy}
                  onChange={(e) => update(row.id, { branch: e.target.value, edited: true })}
                />
                {existing.has(row.branch.trim()) && (
                  <span id={`exists-${row.id}`} className="exists-note" title={t("dialog.existsTitle")}>
                    <TriangleAlert size={13} aria-hidden="true" /> {t("dialog.exists")}
                  </span>
                )}
              </div>
              <button
                className="btn ghost icon-btn"
                onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))}
                disabled={busy || rows.length === 1}
                aria-label={t("queue.removeTarget", { target: row.target || String(i + 1) })}
                title={t("queue.removeTarget", { target: row.target || String(i + 1) })}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="cp-target-actions">
            <button className="btn ghost add-target" onClick={() => setRows((all) => [...all, newRow(suggestTarget(branches, all.map((r) => r.target), basket.source))])} disabled={busy}>
              <Plus size={16} /> {t("queue.addTarget")}
            </button>
            <p className="hint">{localTarget ? t("dialog.localHint") : rows.length > 1 ? t("queue.hint") : t("dialog.newBranchHint")}</p>
          </div>
        </div>
        <button
          className="btn primary start-btn"
          onClick={start}
          disabled={busy || !ready}
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <Cherry size={16} />}
          {busy ? t("dialog.starting") : rows.length > 1 ? t("queue.start", { count: rows.length }) : t("dialog.start")}
        </button>
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
          <button className="btn" onClick={() => onRemove(already)} disabled={busy}>
            <Trash2 size={16} /> {targets.length > 1 ? t("queue.removeInAll", { count: already.length }) : t("basket.removeInTarget", { count: already.length })}
          </button>
        )}
        <button className="btn" onClick={onExportTxt} disabled={ordered.length === 0} title={t("basket.exportTxtTitle")}>
          <FileDown size={16} /> {t("filters.exportTxt")}
        </button>
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
              <span className="cp-state">
                {(() => {
                  const present = presentIn(c.hash);
                  if (present.length === 0) return <span className="status pending">{t("status.pending")}</span>;
                  const label = present.length === targets.length && targets.length === 1 ? t("basket.inTarget") : t("queue.inTargets", { list: present.map(shortName).join(", ") });
                  return (
                    <span className="badge applied" title={present.join(", ")}>
                      {label}
                    </span>
                  );
                })()}
              </span>
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
