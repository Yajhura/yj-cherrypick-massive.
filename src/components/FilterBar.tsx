import { forwardRef } from "react";
import { Author, Branch } from "../api";
import { AuthorPicker } from "./AuthorPicker";
import { Filters } from "../hooks";

interface Props {
  filters: Filters;
  branches: Branch[];
  authors: Author[];
  source: string | null;
  shown: number;
  selected: number;
  loading: boolean;
  onChange: (patch: Partial<Filters>) => void;
}

export const FilterBar = forwardRef<HTMLInputElement, Props>(function FilterBar(
  { filters, branches, authors, source, shown, selected, loading, onChange },
  searchRef,
) {
  const targets = [...branches.filter((b) => b.isRemote), ...branches.filter((b) => !b.isRemote)].filter((b) => b.name !== source);
  return (
    <div className="filters" role="search" aria-label="Filter commits">
      <label className="field wide">
        <span>
          Message <kbd>/</kbd>
        </span>
        <input ref={searchRef} className="input" placeholder="Text in subject or body" value={filters.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      <label className="field">
        <span>Ticket</span>
        <input className="input" placeholder="PAY-123" value={filters.ticket} onChange={(e) => onChange({ ticket: e.target.value })} />
      </label>
      <div className="field">
        <span id="author-label">Author</span>
        <AuthorPicker authors={authors} selected={filters.authors} onChange={(emails) => onChange({ authors: emails })} />
      </div>
      <label className="field">
        <span>From</span>
        <input className="input" type="date" value={filters.since} max={filters.until || undefined} onChange={(e) => onChange({ since: e.target.value })} />
      </label>
      <label className="field">
        <span>To</span>
        <input className="input" type="date" value={filters.until} min={filters.since || undefined} onChange={(e) => onChange({ until: e.target.value })} />
      </label>
      <div className="row2">
        <label className="check">
          Missing from
          <select className="input" value={filters.target} onChange={(e) => onChange({ target: e.target.value })} style={{ width: 220 }}>
            <option value="">Any branch (full history)</option>
            {targets.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check" title={filters.target ? undefined : "Choose a branch in Missing from first"}>
          <input type="checkbox" checked={filters.hideApplied} disabled={!filters.target} onChange={(e) => onChange({ hideApplied: e.target.checked })} />
          Hide already in target
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.hideMerges} onChange={(e) => onChange({ hideMerges: e.target.checked })} />
          Hide merge commits
        </label>
        <span className="count" aria-live="polite">
          {loading ? "Loading…" : `${shown} commit${shown === 1 ? "" : "s"}`}
          {selected > 0 && ` · ${selected} selected`}
        </span>
      </div>
    </div>
  );
});
