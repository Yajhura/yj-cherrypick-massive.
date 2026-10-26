import { Check, CircleCheck, CircleDashed, CircleMinus, Code, Copy, LoaderCircle, OctagonAlert, SkipForward, TriangleAlert, Upload, X } from "lucide-react";
import { PickItem, Session } from "../api";

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

type Display = "applied" | "empty" | "skipped" | "conflict" | "pending" | "working";

const labels: Record<Display, { text: string; Icon: typeof Check }> = {
  applied: { text: "Applied", Icon: CircleCheck },
  empty: { text: "Already there", Icon: CircleMinus },
  skipped: { text: "Skipped", Icon: SkipForward },
  conflict: { text: "Conflict", Icon: OctagonAlert },
  working: { text: "Applying", Icon: LoaderCircle },
  pending: { text: "Pending", Icon: CircleDashed },
};

function displayOf(item: PickItem, index: number, session: Session, busy: boolean): Display {
  if (item.status !== "pending") return item.status;
  if (index === session.current) {
    if (session.state.kind === "conflict" || session.state.kind === "failed") return "conflict";
    if (busy) return "working";
  }
  return "pending";
}

export function StatusChip({ kind }: { kind: Display }) {
  const { text, Icon } = labels[kind];
  return (
    <span className={`status ${kind}`}>
      <Icon size={13} className={kind === "working" ? "spin" : undefined} aria-hidden="true" />
      {text}
    </span>
  );
}

export function SessionPanel({ session, busy, error, ...actions }: Props) {
  const { state, items } = session;
  const count = (s: PickItem["status"]) => items.filter((i) => i.status === s).length;
  const current = items[session.current];

  return (
    <section className="session" aria-label="Cherry-pick session">
      <div className="session-head">
        <h1>Cherry-pick into {session.target}</h1>
        <div className="route mono">→ {session.branch}</div>
        <div className="progress" aria-live="polite">
          <span>{items.length} commits</span>
          <span>{count("applied")} applied</span>
          <span>{count("empty")} already there</span>
          <span>{count("skipped")} skipped</span>
          <span>{count("pending")} pending</span>
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
              <LoaderCircle size={16} className={busy ? "spin" : undefined} /> {busy ? "Applying commits…" : "Interrupted"}
            </h2>
            {!busy && <p>This session stopped before finishing, for example because the app was closed. Resume it or abort and clean up.</p>}
            {!busy && (
              <div className="actions">
                <button className="btn primary" onClick={actions.onContinue}>
                  Resume
                </button>
                <button className="btn danger" onClick={actions.onAbort}>
                  <X size={16} /> Abort
                </button>
              </div>
            )}
          </>
        )}

        {state.kind === "conflict" && (
          <>
            <h2>
              <OctagonAlert size={16} color="var(--danger)" /> Conflict in {current?.hash.slice(0, 8)}
            </h2>
            <p>Resolve these files in the worktree, then continue. You can also stage and commit from your editor; Continue picks that up.</p>
            <ul aria-label="Conflicted files">
              {state.files.map((f) => (
                <li key={f} className="mono">
                  {f}
                </li>
              ))}
            </ul>
            <div className="actions">
              <button className="btn" onClick={actions.onOpenEditor} disabled={busy}>
                <Code size={16} /> Open in editor
              </button>
              <button className="btn primary" onClick={actions.onContinue} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} Continue
              </button>
              <button className="btn" onClick={actions.onSkip} disabled={busy}>
                <SkipForward size={16} /> Skip commit
              </button>
              <button className="btn danger" onClick={actions.onAbort} disabled={busy}>
                <X size={16} /> Abort
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
              <TriangleAlert size={16} color="var(--danger)" /> git stopped on {current?.hash.slice(0, 8)}
            </h2>
            <pre>{state.message}</pre>
            <div className="actions">
              <button className="btn" onClick={actions.onOpenEditor} disabled={busy}>
                <Code size={16} /> Open in editor
              </button>
              <button className="btn" onClick={actions.onSkip} disabled={busy}>
                <SkipForward size={16} /> Skip commit
              </button>
              <button className="btn danger" onClick={actions.onAbort} disabled={busy}>
                <X size={16} /> Abort
              </button>
            </div>
          </>
        )}

        {state.kind === "completed" && state.nothingApplied && (
          <>
            <h2>
              <CircleMinus size={16} /> Nothing to push
            </h2>
            <p>Every selected change was already in {session.target} or was skipped, so no branch was created.</p>
            <div className="actions">
              <button className="btn primary" onClick={actions.onDismiss}>
                Done
              </button>
            </div>
          </>
        )}

        {state.kind === "completed" && !state.nothingApplied && state.pushed && (
          <>
            <h2>
              <CircleCheck size={16} color="var(--ok)" /> Pushed {session.branch}
            </h2>
            <p>Open a pull request from this branch into {session.target} in your git host.</p>
            <div className="actions">
              <button className="btn" onClick={() => actions.onCopy(session.branch)}>
                <Copy size={16} /> Copy branch name
              </button>
              <button className="btn primary" onClick={actions.onDismiss}>
                Done
              </button>
            </div>
          </>
        )}

        {state.kind === "completed" && !state.nothingApplied && !state.pushed && (
          <>
            <h2>
              <TriangleAlert size={16} color="var(--danger)" /> Push failed
            </h2>
            <pre>{state.pushError}</pre>
            <p>The commits are safe in the worktree. Fix the problem (credentials, network) and retry.</p>
            <div className="actions">
              <button className="btn primary" onClick={actions.onRetryPush} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />} Retry push
              </button>
              <button className="btn danger" onClick={actions.onAbort} disabled={busy}>
                <X size={16} /> Abort
              </button>
            </div>
          </>
        )}

        {session.warnings.length > 0 && (
          <ul aria-label="Warnings">
            {session.warnings.map((w) => (
              <li key={w} className="muted">
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
