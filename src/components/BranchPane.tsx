import { forwardRef, ReactNode, RefObject } from "react";
import { TriangleAlert } from "lucide-react";
import { Branch } from "../api";
import { BranchView } from "../hooks";
import { FilterBar } from "./FilterBar";
import { CommitList } from "./CommitList";
import { Display } from "./SessionPanel";
import { useI18n } from "../i18n";

interface Props {
  view: BranchView;
  branches: Branch[];
  sessionStatus: Map<string, Display>;
  searchRef?: RefObject<HTMLInputElement | null>;
  /** Notices shown above the list, such as a failed fetch. */
  notices?: ReactNode;
  /** Narrow layout for a column of the Branches tab. */
  compact?: boolean;
  onLoad: () => void;
  onExportTxt: () => void;
  onOpen: (index: number) => void;
}

/** One branch's filters and commit list: the History tab and each Branches column. */
export const BranchPane = forwardRef<HTMLDivElement, Props>(function BranchPane(
  { view, branches, sessionStatus, searchRef, notices, compact, onLoad, onExportTxt, onOpen },
  listRef,
) {
  const { t } = useI18n();
  const { source, filters, visible, selected, loading, error, list } = view;
  return (
    <>
      <FilterBar
        ref={searchRef}
        filters={filters}
        branches={branches}
        authors={view.authors}
        source={source}
        shown={visible.length}
        selected={selected.size}
        loading={loading}
        compact={compact}
        onSource={view.selectBranch}
        onLoad={onLoad}
        onExportTxt={onExportTxt}
        onChange={view.changeFilters}
      />
      {notices}
      {error && (
        <div className="notice error" role="alert">
          <TriangleAlert size={16} />
          <span className="grow">{error}</span>
        </div>
      )}
      {list?.truncated && (
        <div className="notice warn" role="status">
          <TriangleAlert size={16} />
          <span className="grow">{t("app.truncated")}</span>
        </div>
      )}
      {!loading && !error && visible.length === 0 ? (
        <div className="placeholder">
          <h2>{t("app.noMatchTitle")}</h2>
          <p>
            {filters.target
              ? t("app.noMatchTarget", { source: source ?? "", target: filters.target })
              : filters.since || filters.until
                ? t("app.noMatchDates")
                : t("app.noMatchBody")}
          </p>
          <button className="btn" onClick={view.clearFilters}>
            {t("app.clearFilters")}
          </button>
        </div>
      ) : (
        <CommitList
          ref={listRef}
          commits={visible}
          sessionStatus={sessionStatus}
          selected={new Set(selected.keys())}
          activeIndex={view.safeIndex}
          onActivate={view.setActiveIndex}
          onToggle={view.toggle}
          onSelectRange={view.selectRange}
          onOpen={(i) => {
            view.setActiveIndex(i);
            onOpen(i);
          }}
          onSelectAll={view.selectAll}
          onClearSelection={view.clearSelection}
        />
      )}
    </>
  );
});
