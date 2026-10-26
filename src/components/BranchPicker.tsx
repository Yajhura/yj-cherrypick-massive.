import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Cloud, GitBranch } from "lucide-react";
import { Branch } from "../api";
import { searchBranches } from "../branchSearch";
import { useI18n } from "../i18n";

interface Props {
  branches: Branch[];
  value: string | null;
  onChange: (name: string) => void;
  label: string;
  /** Branches that cannot be chosen here, e.g. the source when picking a target. */
  exclude?: string | null;
  disabled?: boolean;
}

/** Searchable branch selector: main, develop and releases first, closest names first. */
export function BranchPicker({ branches, value, onChange, label, exclude, disabled }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  // Remote branches first, as the old sidebar did: they are what fetch keeps up to date.
  // The partition is stable, so each group keeps the search ranking.
  const shown = useMemo(() => {
    const match = searchBranches(branches, query).filter((b) => b.name !== exclude);
    return [...match.filter((b) => b.isRemote), ...match.filter((b) => !b.isRemote)];
  }, [branches, query, exclude]);

  useEffect(() => setCursor(0), [query, open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery("");
    button.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[cursor]) choose(shown[cursor].name);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  };

  const listId = `branches-${label.replace(/\W+/g, "-")}`;
  return (
    <div className="menu-wrap branch-picker" ref={ref}>
      <button
        ref={button}
        type="button"
        className="input picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value ?? t("toolbar.noBranch")}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`mono${value ? "" : " muted"}`} title={value ?? undefined}>
          {value ?? t("toolbar.noBranch")}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu picker branch-menu" onKeyDown={onKeyDown}>
          <input
            className="input"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown[cursor] ? `${listId}-${cursor}` : undefined}
            placeholder={t("branches.search")}
            aria-label={t("branches.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker-list" role="listbox" id={listId} aria-label={label} ref={listRef}>
            {shown.length === 0 && <p className="empty">{t("branches.none")}</p>}
            {shown.map((b, i) => {
              const Icon = b.isRemote ? Cloud : GitBranch;
              return (
                <div
                  key={b.name}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={b.name === value}
                  className={`branch${i === cursor ? " cursor" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(b.name)}
                  title={b.name}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span>{b.name}</span>
                  {!b.isRemote && <small className="muted">{t("dialog.local")}</small>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
