import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Author } from "../api";

interface Props {
  authors: Author[];
  selected: string[];
  onChange: (emails: string[]) => void;
}

/** Multi-select of the authors found in the current branch, keyed by email. */
export function AuthorPicker({ authors, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const chosen = useMemo(() => new Set(selected.map((e) => e.toLowerCase())), [selected]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return authors.filter((a) => !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [authors, query]);

  const toggle = (email: string) => {
    const key = email.toLowerCase();
    onChange(chosen.has(key) ? selected.filter((e) => e.toLowerCase() !== key) : [...selected, email]);
  };

  const label =
    selected.length === 0
      ? "Any author"
      : selected.length === 1
        ? (authors.find((a) => a.email.toLowerCase() === selected[0].toLowerCase())?.name ?? selected[0])
        : `${selected.length} authors`;

  return (
    <div className="menu-wrap author-picker" ref={ref} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" className="input picker-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={selected.length ? undefined : "muted"}>{label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu picker">
          <input className="input" autoFocus placeholder="Search authors" aria-label="Search authors" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="picker-list" role="listbox" aria-multiselectable="true" aria-label="Authors">
            {shown.length === 0 && <p className="empty">No authors match</p>}
            {shown.map((a) => (
              <label key={a.email} className="picker-item" role="option" aria-selected={chosen.has(a.email.toLowerCase())}>
                <input type="checkbox" checked={chosen.has(a.email.toLowerCase())} onChange={() => toggle(a.email)} />
                <span className="who">
                  <span>{a.name}</span>
                  <small className="muted">{a.email}</small>
                </span>
                <span className="mono muted">{a.commits}</span>
              </label>
            ))}
          </div>
          <div className="picker-foot">
            <span className="muted">{selected.length} selected</span>
            <button type="button" className="btn ghost" onClick={() => onChange([])} disabled={selected.length === 0}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
