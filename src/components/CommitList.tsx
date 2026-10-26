import { forwardRef, KeyboardEvent, useEffect, useRef } from "react";
import { Commit } from "../api";
import { Display, StatusChip } from "./SessionPanel";
import { useI18n } from "../i18n";

interface Props {
  commits: Commit[];
  /** Status of commits that belong to the active cherry-pick session. */
  sessionStatus: Map<string, Display>;
  selected: Set<string>;
  activeIndex: number;
  onActivate: (index: number) => void;
  onToggle: (commit: Commit) => void;
  /** Selects every selectable commit between two rows, both included (Shift+click). */
  onSelectRange: (from: number, to: number) => void;
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
  { commits, sessionStatus, selected, activeIndex, onActivate, onToggle, onSelectRange, onSelectAll, onClearSelection },
  ref,
) {
  const { t } = useI18n();
  const activeRow = useRef<HTMLDivElement>(null);
  // Row of the last plain toggle: Shift+click selects from here.
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    anchor.current = null;
  }, [commits]);

  const toggleAt = (i: number, shift: boolean) => {
    const c = commits[i];
    onActivate(i);
    if (shift && anchor.current !== null) {
      onSelectRange(anchor.current, i);
    } else if (c && isSelectable(c)) {
      anchor.current = i;
      onToggle(c);
    }
  };

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
      case "x":
        e.preventDefault();
        toggleAt(activeIndex, e.shiftKey);
        return;
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
      aria-label={t("list.label")}
      aria-multiselectable="true"
      aria-activedescendant={activeId}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="list-head" aria-hidden="true">
        <span />
        <span>{t("list.subject")}</span>
        <span>{sessionStatus.size > 0 ? t("list.authorStatus") : t("list.author")}</span>
        <span>{t("list.hash")}</span>
        <span>{t("list.date")}</span>
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
            onClick={(e) => (e.shiftKey ? toggleAt(i, true) : onActivate(i))}
          >
            <input
              type="checkbox"
              tabIndex={-1}
              aria-label={t("list.select", { hash: c.shortHash })}
              checked={isSelected}
              disabled={!selectable}
              title={selectable ? undefined : t("list.mergeDisabled")}
              onClick={(e) => {
                e.stopPropagation();
                toggleAt(i, e.shiftKey);
              }}
              onChange={() => undefined}
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
              {c.isMerge && <span className="badge merge">{t("list.badgeMerge")}</span>}
              {c.alreadyInTarget && !status && <span className="badge applied">{t("list.badgeInTarget")}</span>}
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
