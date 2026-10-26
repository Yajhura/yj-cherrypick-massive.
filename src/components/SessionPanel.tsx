import { ArrowRight, Check, CircleCheck, CircleDashed, CircleMinus, CircleX, Code, Copy, LoaderCircle, OctagonAlert, SkipForward, TriangleAlert, Upload, X } from "lucide-react";
import { PickItem, Session } from "../api";
import { Key, useI18n } from "../i18n";

interface Props {
  session: Session;
  busy: boolean;
  error: string | null;
  onOpenEditor: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onAbort: () => void;
  onRetryPush: () => void;
  onDismiss: () => void;
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

export function SessionPanel({ session, busy, error, ...actions }: Props) {
  const { t, te } = useI18n();
  const { state, items } = session;
  const count = (s: PickItem["status"]) => items.filter((i) => i.status === s).length;
  const current = items[session.current];
  const short = current?.hash.slice(0, 8) ?? "";

  return (
    <section className="session" aria-label={t("session.label")}>
      <div className="session-head">
        <h1>{t("session.into", { target: session.target })}</h1>
        <div className="route mono">
          <ArrowRight size={12} aria-hidden="true" /> {session.branch}
        </div>
        <div className="progress" aria-live="polite">
          {state.kind !== "completed" && <span>{t("session.commitOf", { n: Math.min(session.current + 1, items.length), total: items.length })}</span>}
          <span>{t("session.commits", { count: items.length })}</span>
          <span>{t("session.applied", { count: count("applied") })}</span>
          <span>{t("session.empty", { count: count("empty") })}</span>
          <span>{t("session.skipped", { count: count("skipped") })}</span>
          <span>{t("session.pending", { count: count("pending") })}</span>
        </div>
      </div>

      <div className="items" role="list">
        {items.map((item, i) => (
          <div key={item.hash} role="listitem" className={`item${i === session.current && state.kind !== "completed" ? " current" : ""}`}>
            <span className="mono muted">{(item.newHash ?? item.hash).slice(0, 8)}</span>
            <span className="subject" title={item.subject}>
              {item.subject}
            </span>
            <StatusChip kind={displayOf(item, i, session, busy)} />
          </div>
        ))}
      </div>

      <div className="panel">
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
            <h2>
              <OctagonAlert size={16} color="var(--danger)" /> {t("session.conflictIn", { hash: short })}
            </h2>
            <p>{t("session.conflictBody")}</p>
            <ul aria-label={t("session.conflictedFiles")}>
              {state.files.map((f) => (
                <li key={f} className="mono">
                  {f}
                </li>
              ))}
            </ul>
            <div className="actions">
              <button className="btn" onClick={actions.onOpenEditor} disabled={busy}>
                <Code size={16} /> {t("session.openEditor")}
              </button>
              <button className="btn primary" onClick={actions.onContinue} disabled={busy}>
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
            <h2>
              <TriangleAlert size={16} color="var(--danger)" /> {t("session.failedOn", { hash: short })}
            </h2>
            <pre>{state.message}</pre>
            <div className="actions">
              <button className="btn" onClick={actions.onOpenEditor} disabled={busy}>
                <Code size={16} /> {t("session.openEditor")}
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
    </section>
  );
}
