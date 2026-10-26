import { forwardRef } from "react";
import { ArrowRightToLine, FileDown, X } from "lucide-react";
import { Author, Branch } from "../api";
import { AuthorPicker } from "./AuthorPicker";
import { BranchPicker } from "./BranchPicker";
import { Filters } from "../hooks";
import { useI18n } from "../i18n";

interface Props {
  filters: Filters;
  branches: Branch[];
  authors: Author[];
  source: string | null;
  shown: number;
  selected: number;
  loading: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onSource: (name: string) => void;
  onLoad: () => void;
  /** Saves the selected commits as a txt for "Add by hash". */
  onExportTxt: () => void;
  /** Narrow layout for a column of the Branches tab. */
  compact?: boolean;
}

export const FilterBar = forwardRef<HTMLInputElement, Props>(function FilterBar(
  { filters, branches, authors, source, shown, selected, loading, onChange, onSource, onLoad, onExportTxt, compact },
  searchRef,
) {
  const { t } = useI18n();
  const targets = [...branches.filter((b) => b.isRemote), ...branches.filter((b) => !b.isRemote)].filter((b) => b.name !== source);
  return (
    <div className={`filters${compact ? " compact" : ""}`} role="search" aria-label={t("filters.label")}>
      <div className="row0">
        <div className="field source-field">
          <span>{t("filters.branch")}</span>
          <BranchPicker branches={branches} value={source} onChange={onSource} label={t("filters.branch")} />
        </div>
        <button
          className="btn txt-btn"
          onClick={onExportTxt}
          disabled={selected === 0}
          title={selected === 0 ? t("reason.noSelection") : t("filters.exportTxtTitle")}
        >
          <FileDown size={16} />
          {compact ? "txt" : t("filters.exportTxt")}
        </button>
        <button
          className="btn primary load-btn"
          onClick={onLoad}
          disabled={selected === 0}
          title={selected === 0 ? t("reason.noSelection") : `${t("filters.loadTitle")} (Ctrl+Enter)`}
        >
          <ArrowRightToLine size={16} />
          {compact ? (selected === 0 ? t("filters.loadShort") : t("filters.loadShortN", { count: selected })) : selected === 0 ? t("filters.load") : t("filters.loadN", { count: selected })}
        </button>
      </div>
      <label className="field wide">
        <span>
          {t("filters.message")} <kbd>/</kbd>
        </span>
        <input ref={searchRef} className="input" placeholder={t("filters.messagePlaceholder")} value={filters.text} onChange={(e) => onChange({ text: e.target.value })} />
      </label>
      <label className="field">
        <span>{t("filters.ticket")}</span>
        <input className="input" placeholder="PAY-123" value={filters.ticket} onChange={(e) => onChange({ ticket: e.target.value })} />
      </label>
      <div className="field">
        <span>{t("filters.author")}</span>
        <AuthorPicker authors={authors} selected={filters.authors} onChange={(emails) => onChange({ authors: emails })} />
      </div>
      <label className="field">
        <span>{t("filters.from")}</span>
        <input className="input" type="date" value={filters.since} max={filters.until || undefined} onChange={(e) => onChange({ since: e.target.value })} />
      </label>
      <div className="field">
        <span>{t("filters.to")}</span>
        <div className="date-to">
          <input
            className="input"
            type="date"
            aria-label={t("filters.to")}
            value={filters.until}
            min={filters.since || undefined}
            onChange={(e) => onChange({ until: e.target.value })}
          />
          {(filters.since || filters.until) && (
            <button className="btn ghost icon-btn" onClick={() => onChange({ since: "", until: "" })} aria-label={t("filters.clearDates")} title={t("filters.clearDates")}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="row2">
        <label className="check">
          {t("filters.missingFrom")}
          <select className="input target-select" value={filters.target} onChange={(e) => onChange({ target: e.target.value })}>
            <option value="">{t("filters.anyBranch")}</option>
            {targets.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check" title={filters.target ? undefined : t("filters.hideAppliedHint")}>
          <input type="checkbox" checked={filters.hideApplied} disabled={!filters.target} onChange={(e) => onChange({ hideApplied: e.target.checked })} />
          {t("filters.hideApplied")}
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.hideMerges} onChange={(e) => onChange({ hideMerges: e.target.checked })} />
          {t("filters.hideMerges")}
        </label>
        <span className="count" aria-live="polite">
          {loading ? t("filters.loading") : shown === 1 ? t("filters.count1") : t("filters.countN", { count: shown })}
          {selected > 0 && ` · ${t("filters.selected", { count: selected })}`}
        </span>
      </div>
    </div>
  );
});
