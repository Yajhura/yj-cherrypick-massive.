import { forwardRef, KeyboardEvent, useEffect, useRef } from "react";
import { Commit } from "../api";

interface Props {
  commits: Commit[];
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

const dateFormat = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFormat.format(d);
}

export const CommitList = forwardRef<HTMLDivElement, Props>(function CommitList(
  { commits, selected, activeIndex, onActivate, onToggle, onSelectAll, onClearSelection },
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
      className="list"
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
        <span>Author</span>
        <span>Hash</span>
        <span>Date</span>
      </div>
      {commits.map((c, i) => {
        const selectable = isSelectable(c);
        const isSelected = selected.has(c.hash);
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
              {c.tickets.slice(0, 2).map((t) => (
                <span key={t} className="badge ticket">
                  {t}
                </span>
              ))}
              <span className="text" title={c.subject}>
                {c.subject}
              </span>
              {c.isMerge && <span className="badge merge">merge</span>}
              {c.alreadyInTarget && <span className="badge applied">in target</span>}
            </span>
            <span className="author" title={c.authorEmail}>
              {c.authorName}
            </span>
            <span className="mono muted">{c.shortHash}</span>
            <span className="date mono">{formatDate(c.date)}</span>
          </div>
        );
      })}
    </div>
  );
});
