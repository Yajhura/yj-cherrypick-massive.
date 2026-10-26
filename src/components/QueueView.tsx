import { ArrowRight, CircleCheck, CircleDashed, CircleMinus, CircleX, Copy, LoaderCircle, OctagonAlert } from "lucide-react";
import { Outcome, Queue } from "../api";
import { Key, useI18n } from "../i18n";

const OUTCOMES: Record<Outcome, { text: Key; Icon: typeof CircleCheck; cls: string }> = {
  pending: { text: "queue.pending", Icon: CircleDashed, cls: "pending" },
  running: { text: "queue.running", Icon: LoaderCircle, cls: "working" },
  pushed: { text: "queue.pushed", Icon: CircleCheck, cls: "applied" },
  nothingApplied: { text: "queue.nothing", Icon: CircleMinus, cls: "empty" },
  aborted: { text: "queue.aborted", Icon: CircleX, cls: "skipped" },
  failed: { text: "queue.failed", Icon: OctagonAlert, cls: "failed" },
};

function OutcomeChip({ outcome, stopped }: { outcome: Outcome; stopped?: boolean }) {
  const { t } = useI18n();
  const { text, cls } = OUTCOMES[outcome];
  // The running target that waits on the user reads as a stop, not as work in progress.
  const waiting = outcome === "running" && stopped;
  const kind = waiting ? "conflict" : cls;
  const Icon = waiting ? OctagonAlert : OUTCOMES[outcome].Icon;
  return (
    <span className={`status ${kind}`}>
      <Icon size={13} className={kind === "working" ? "spin" : undefined} aria-hidden="true" />
      {outcome === "running" && stopped ? t("queue.waiting") : t(text)}
    </span>
  );
}

/** One chip per target above the running session, so the user sees where the queue is. */
export function QueueStrip({ queue, stopped }: { queue: Queue; stopped: boolean }) {
  const { t } = useI18n();
  if (queue.entries.length < 2) return null;
  return (
    <ol className="queue-strip" aria-label={t("queue.targets")}>
      {queue.entries.map((e, i) => (
        <li key={e.target} className={e.outcome === "running" ? "current" : undefined}>
          <span className="mono muted">{i + 1}</span>
          <span className="mono target" title={`${e.target} → ${e.branch}`}>
            {e.target}
          </span>
          <OutcomeChip outcome={e.outcome} stopped={stopped} />
        </li>
      ))}
    </ol>
  );
}

interface SummaryProps {
  queue: Queue;
  onDone: () => void;
  onCopy: (text: string) => void;
}

/** What happened in each target once the queue has finished. */
export function QueueSummary({ queue, onDone, onCopy }: SummaryProps) {
  const { t, te } = useI18n();
  const pushed = queue.entries.filter((e) => e.outcome === "pushed");
  return (
    <section className="queue-summary" aria-label={t("queue.summary")}>
      <div className="session-head">
        <div className="session-title">
          <h1>{t("queue.summaryTitle", { count: queue.entries.length })}</h1>
          <p className="muted">{pushed.length > 0 ? t("queue.summaryBody", { count: pushed.length }) : t("queue.summaryNone")}</p>
        </div>
        <div className="actions">
          {pushed.length > 0 && (
            <button className="btn" onClick={() => onCopy(pushed.map((e) => e.branch).join("\n"))}>
              <Copy size={16} /> {t("queue.copyBranches")}
            </button>
          )}
          <button className="btn primary" onClick={onDone}>
            {t("common.done")}
          </button>
        </div>
      </div>
      <div className="cp-table" role="table" aria-label={t("queue.summary")}>
        <div className="q-row cp-th" role="row">
          <span role="columnheader">{t("dialog.onto")}</span>
          <span role="columnheader">{t("queue.branch")}</span>
          <span role="columnheader">{t("list.status")}</span>
          <span role="columnheader">{t("queue.commits")}</span>
        </div>
        {queue.entries.map((e) => (
          <div key={e.target} className="q-row" role="row">
            <span className="mono">{e.target}</span>
            <span className="mono ellipsis" title={e.branch}>
              <ArrowRight size={12} aria-hidden="true" /> {e.branch}
            </span>
            <span>
              <OutcomeChip outcome={e.outcome} />
            </span>
            <span className="muted">
              {e.error ? te(e.error) : t("queue.counts", { applied: e.applied, empty: e.empty, skipped: e.skipped })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
