import { forwardRef, KeyboardEvent, useEffect, useRef } from "react";
import { Commit } from "../api";
import { Display, StatusChip } from "./SessionPanel";

interface Props {
  commits: Commit[];
  /** Status of commits that belong to the active cherry-pick session. */
  sessionStatus: Map<string, Display>;
  selected: Set<string>;
  activeIndex: number;
  onActivate: (index: number) => void;
  onToggle: (commit: Commit) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

/** Commits that can never be cherry-picked are shown but not selectable. */
export function isSelectable(c: Commit) {
  return !c.isMerge;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local time as `YYYY-MM-DD HH:mm`: sortable, compact and unambiguous across locales. */
export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const CommitList = forwardRef<HTMLDivElement, Props>(function CommitList(
  { commits, sessionStatus, selected, activeIndex, onActivate, onToggle, onSelectAll, onClearSelection },
  ref,
) {
  const activeRow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = commits.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      onActivate(Math.max(0, Math.min(last, i)));
    };
    switch (e.key) {
      case "ArrowDown":
      case "j":
        return move(activeIndex + 1);
      case "ArrowUp":
      case "k":
        return move(activeIndex - 1);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "PageDown":
        return move(activeIndex + 15);
      case "PageUp":
        return move(activeIndex - 15);
      case " ":
      case "x": {
        e.preventDefault();
        const c = commits[activeIndex];
        if (c && isSelectable(c)) onToggle(c);
        return;
      }
      case "a":
        if (e.ctrlKey) {
          e.preventDefault();
          onSelectAll();
        }
        return;
      case "Escape":
        onClearSelection();
        return;
    }
  };

  const activeId = commits[activeIndex] ? `commit-${commits[activeIndex].hash}` : undefined;

  return (
    <div
      ref={ref}
      className={`list${sessionStatus.size > 0 ? " in-session" : ""}`}
      role="listbox"
      aria-label="Commits"
      aria-multiselectable="true"
      aria-activedescendant={activeId}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="list-head" aria-hidden="true">
        <span />
        <span>Subject</span>
        <span>{sessionStatus.size > 0 ? "Author · status" : "Author"}</span>
        <span>Hash</span>
        <span>Date</span>
      </div>
      {commits.map((c, i) => {
        const selectable = isSelectable(c);
        const isSelected = selected.has(c.hash);
        const status = sessionStatus.get(c.hash);
        return (
          <div
            key={c.hash}
            id={`commit-${c.hash}`}
            ref={i === activeIndex ? activeRow : undefined}
            role="option"
            aria-selected={isSelected}
            aria-disabled={!selectable}
            className={`row${i === activeIndex ? " active" : ""}${selectable ? "" : " disabled"}`}
            onClick={() => onActivate(i)}
          >
            <input
              type="checkbox"
              tabIndex={-1}
              aria-label={`Select ${c.shortHash}`}
              checked={isSelected}
              disabled={!selectable}
              title={selectable ? undefined : "Merge commits cannot be cherry-picked"}
              onClick={(e) => e.stopPropagation()}
              onChange={() => {
                onActivate(i);
                onToggle(c);
              }}
            />
            <span className="subject">
              {/* Tickets already in the subject are not repeated; body-only ones surface here. */}
              {c.tickets.filter((t) => !c.subject.includes(t)).slice(0, 2).map((t) => (
                <span key={t} className="badge ticket">
                  {t}
                </span>
              ))}
              <span className="text" title={c.subject}>
                {c.subject}
              </span>
              {c.isMerge && <span className="badge merge">merge</span>}
              {c.alreadyInTarget && !status && <span className="badge applied">in target</span>}
            </span>
            {/* During a session the author column carries the pick status, so the subject keeps its width. */}
            <span className="author" title={`${c.authorName} <${c.authorEmail}>`}>
              {status ? <StatusChip kind={status} /> : c.authorName}
            </span>
            <span className="mono muted">{c.shortHash}</span>
            <span className="date mono" title={formatDate(c.date)}>
              {formatDate(c.date).slice(0, 10)}
              <span className="time">{formatDate(c.date).slice(10)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
});
