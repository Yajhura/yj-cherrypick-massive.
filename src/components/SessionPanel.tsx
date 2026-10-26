import { useEffect, useState } from "react";
import { ArrowRight, Check, CircleCheck, CircleDashed, CircleMinus, CircleX, Code, Copy, LoaderCircle, OctagonAlert, SkipForward, TriangleAlert, Upload, X } from "lucide-react";
import { api, ConflictStatus, PickItem, Session } from "../api";
import { progressOf } from "../basket";
import { formatDate } from "./CommitList";
import { Key, useI18n } from "../i18n";

interface Props {
  session: Session;
  busy: boolean;
  error: string | null;
  editorCommand: string;
  onOpenEditor: (files: string[]) => void;
  onContinue: () => void;
  onSkip: () => void;
  onAbort: () => void;
  onRetryPush: () => void;
  onDismiss: () => void;
  onRemove: (hash: string) => void;
  onCopy: (text: string) => void;
}

export type Display = "applied" | "empty" | "skipped" | "conflict" | "failed" | "pending" | "working";

const labels: Record<Display, { text: Key; Icon: typeof Check }> = {
  applied: { text: "status.applied", Icon: CircleCheck },
  empty: { text: "status.empty", Icon: CircleMinus },
  skipped: { text: "status.skipped", Icon: SkipForward },
  conflict: { text: "status.conflict", Icon: OctagonAlert },
  failed: { text: "status.failed", Icon: CircleX },
  working: { text: "status.working", Icon: LoaderCircle },
  pending: { text: "status.pending", Icon: CircleDashed },
};

/** How often the worktree is checked while the user resolves a conflict. */
const CONFLICT_POLL_MS = 2500;

export function displayOf(item: PickItem, index: number, session: Session, busy: boolean): Display {
  if (item.status !== "pending") return item.status;
  if (index === session.current) {
    if (session.state.kind === "conflict") return "conflict";
    // A git failure that is not a conflict gets its own state, not "Conflict".
    if (session.state.kind === "failed") return "failed";
    if (busy) return "working";
  }
  return "pending";
}

export function StatusChip({ kind }: { kind: Display }) {
  const { t } = useI18n();
  const { text, Icon } = labels[kind];
  return (
    <span className={`status ${kind}`}>
      <Icon size={13} className={kind === "working" ? "spin" : undefined} aria-hidden="true" />
      {t(text)}
    </span>
  );
}

/** Reads the worktree every few seconds while a conflict waits on the user. */
function useConflictCheck(waiting: boolean, current: number): ConflictStatus | null {
  const [check, setCheck] = useState<ConflictStatus | null>(null);
  useEffect(() => {
    setCheck(null);
    if (!waiting) return;
    let stopped = false;
    const tick = () =>
      api
        .conflictStatus()
        .then((s) => !stopped && setCheck(s))
        .catch(() => !stopped && setCheck(null));
    tick();
    const id = window.setInterval(tick, CONFLICT_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [waiting, current]);
  return check;
}

export function SessionPanel({ session, busy, error, editorCommand, ...actions }: Props) {
  const { t, te } = useI18n();
  const { state, items } = session;
  const progress = progressOf(session);
  const current = items[session.current];
  const short = current?.hash.slice(0, 8) ?? "";
  const paused = (state.kind === "conflict" || state.kind === "failed") && !busy;
  const check = useConflictCheck(state.kind === "conflict" && !busy, session.current);
  const isVsCode = /^code(\.cmd|\.exe)?$/i.test(editorCommand.trim().split(/[\\/]/).pop() ?? "");
  const editorLabel = isVsCode ? t("session.openVsCode") : t("session.openEditor");
  const conflictFiles = state.kind === "conflict" ? state.files : [];
  const unresolved = new Set(check?.unresolved ?? conflictFiles);

  return (
    <section className={`session${state.kind === "conflict" ? " has-conflict" : ""}`} aria-label={t("session.label")}>
      <div className="session-head">
        <div className="session-title">
          <h1>{t("session.into", { target: session.target })}</h1>
          <div className="route mono">
            <ArrowRight size={12} aria-hidden="true" /> {session.branch}
          </div>
        </div>
        <div className="progressbar-wrap">
          <div
            className={`progressbar${state.kind === "conflict" || state.kind === "failed" ? " stopped" : ""}`}
            role="progressbar"
            aria-label={t("session.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-valuetext={t("session.progress", { done: progress.done, total: progress.total })}
          >
            <div style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="progress" aria-live="polite">
            <b>{t("session.progress", { done: progress.done, total: progress.total })}</b>
            <span>{t("session.applied", { count: progress.applied })}</span>
            <span>{t("session.empty", { count: progress.empty })}</span>
            <span>{t("session.skipped", { count: progress.skipped })}</span>
            <span>{t("session.pending", { count: progress.pending })}</span>
          </div>
        </div>
      </div>

      <div className={`panel${state.kind === "conflict" || state.kind === "failed" ? " alert" : ""}`}>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {state.kind === "running" && (
          <>
            <h2>
              <LoaderCircle size={16} className={busy ? "spin" : undefined} /> {busy ? t("session.applying") : t("session.interrupted")}
            </h2>
            {!busy && <p>{t("session.interruptedBody")}</p>}
            {!busy && (
              <div className="actions">
                <button className="btn primary" onClick={actions.onContinue}>
                  {t("session.resume")}
                </button>
                <button className="btn danger" onClick={actions.onAbort}>
                  <X size={16} /> {t("common.abort")}
                </button>
              </div>
            )}
          </>
        )}

        {state.kind === "conflict" && (
          <>
            <h2 role="alert">
              <OctagonAlert size={16} color="var(--danger)" /> {t("session.conflictIn", { hash: short })}
              <span className="muted subject-inline" title={current?.subject}>
                {current?.subject}
              </span>
            </h2>
            <p>{t("session.conflictBody")}</p>
            <ul aria-label={t("session.conflictedFiles")}>
              {state.files.map((f) => (
                <li key={f} className="mono file-state">
                  {unresolved.has(f) ? <OctagonAlert size={13} color="var(--danger)" aria-label={t("session.fileUnresolved")} /> : <CircleCheck size={13} color="var(--ok)" aria-label={t("session.fileResolved")} />}
                  {f}
                </li>
              ))}
            </ul>
            <p className={`resolve-state${check?.resolved ? " ok" : ""}`} aria-live="polite">
              {check === null ? t("session.checking") : check.resolved ? t("session.resolved") : t("session.stillMarkers", { count: check.unresolved.length })}
            </p>
            <div className="actions">
              <button className="btn" onClick={() => actions.onOpenEditor(state.files)} disabled={busy}>
                <Code size={16} /> {editorLabel}
              </button>
              <button className="btn primary" onClick={actions.onContinue} disabled={busy || check?.resolved === false} title={check?.resolved === false ? t("session.continueBlocked") : undefined}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} {t("session.continue")}
              </button>
              <button className="btn" onClick={actions.onSkip} disabled={busy}>
                <SkipForward size={16} /> {t("session.skip")}
              </button>
              <button className="btn danger" onClick={actions.onAbort} disabled={busy}>
                <X size={16} /> {t("common.abort")}
              </button>
            </div>
            <p className="hint mono" title={session.worktree}>
              {session.worktree}
            </p>
          </>
        )}

        {state.kind === "failed" && (
          <>
            <h2 role="alert">
              <TriangleAlert size={16} color="var(--danger)" /> {t("session.failedOn", { hash: short })}
            </h2>
            <pre>{state.message}</pre>
            <div className="actions">
              <button className="btn" onClick={() => actions.onOpenEditor([])} disabled={busy}>
                <Code size={16} /> {editorLabel}
              </button>
              <button className="btn" onClick={actions.onSkip} disabled={busy}>
                <SkipForward size={16} /> {t("session.skip")}
              </button>
              <button className="btn danger" onClick={actions.onAbort} disabled={busy}>
                <X size={16} /> {t("common.abort")}
              </button>
            </div>
          </>
        )}

        {state.kind === "completed" && state.nothingApplied && (
          <>
            <h2>
              <CircleMinus size={16} /> {t("session.nothingTitle")}
            </h2>
            <p>{t("session.nothingBody", { target: session.target })}</p>
            <div className="actions">
              <button className="btn primary" onClick={actions.onDismiss}>
                {t("common.done")}
              </button>
            </div>
          </>
        )}

        {state.kind === "completed" && !state.nothingApplied && state.pushed && (
          <>
            <h2>
              <CircleCheck size={16} color="var(--ok)" /> {t("session.pushed", { branch: session.branch })}
            </h2>
            <p>{t("session.pushedBody", { target: session.target })}</p>
            <div className="actions">
              <button className="btn" onClick={() => actions.onCopy(session.branch)}>
                <Copy size={16} /> {t("session.copyBranch")}
              </button>
              <button className="btn primary" onClick={actions.onDismiss}>
                {t("common.done")}
              </button>
            </div>
          </>
        )}

        {state.kind === "completed" && !state.nothingApplied && !state.pushed && (
          <>
            <h2>
              <TriangleAlert size={16} color="var(--danger)" /> {t("session.pushFailed")}
            </h2>
            <pre>{state.pushError && te(state.pushError)}</pre>
            <p>{t("session.pushFailedBody")}</p>
            <div className="actions">
              <button className="btn primary" onClick={actions.onRetryPush} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />} {t("session.retryPush")}
              </button>
              <button className="btn danger" onClick={actions.onAbort} disabled={busy}>
                <X size={16} /> {t("common.abort")}
              </button>
            </div>
          </>
        )}

        {session.warnings.length > 0 && (
          <ul aria-label={t("session.warnings")}>
            {session.warnings.map((w) => (
              <li key={w} className="muted">
                {te(w)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cp-table items" role="table" aria-label={t("basket.title")}>
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
        {items.map((item, i) => {
          const removable = paused && i > session.current && item.status === "pending";
          const short = item.hash.slice(0, 8);
          return (
            <div key={item.hash} role="row" className={`cp-row${i === session.current && state.kind !== "completed" ? " current" : ""}`}>
              <span className="mono muted">{i + 1}</span>
              <span className="mono" title={item.newHash ? t("session.newHash", { hash: item.newHash.slice(0, 8) }) : undefined}>
                {short}
              </span>
              <span className="subject" title={item.subject}>
                {item.subject}
              </span>
              <span className="muted ellipsis">{item.author}</span>
              <span className="mono muted">{item.date ? formatDate(item.date) : ""}</span>
              <span>
                <StatusChip kind={displayOf(item, i, session, busy)} />
              </span>
              {removable ? (
                <button className="btn ghost icon-btn" onClick={() => actions.onRemove(item.hash)} aria-label={t("basket.remove", { hash: short })} title={t("basket.remove", { hash: short })}>
                  <X size={14} />
                </button>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
