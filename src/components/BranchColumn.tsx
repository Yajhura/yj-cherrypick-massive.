import { useEffect } from "react";
import { X } from "lucide-react";
import { Branch, Commit } from "../api";
import { useBranchView } from "../hooks";
import { BranchPane } from "./BranchPane";
import { Display } from "./SessionPanel";
import { useI18n } from "../i18n";

interface Props {
  repoRoot: string;
  branches: Branch[];
  /** Branch shown when the column opens. */
  initial: string | null;
  number: number;
  ticketPattern: string;
  reloadKey: number;
  sessionStatus: Map<string, Display>;
  canRemove: boolean;
  onRemove: () => void;
  /** Loads the selection into the Cherry-pick tab; resolves true when it was loaded. */
  onLoad: (source: string, commits: Commit[]) => Promise<boolean>;
  onExportTxt: (source: string | null, commits: Commit[]) => void;
  onOpen: (commits: Commit[], index: number) => void;
}

/** One column of the Branches tab: its own branch, filters and selection. */
export function BranchColumn({ repoRoot, branches, initial, number, ticketPattern, reloadKey, sessionStatus, canRemove, onRemove, onLoad, onExportTxt, onOpen }: Props) {
  const { t } = useI18n();
  const view = useBranchView(repoRoot, ticketPattern, reloadKey);

  useEffect(() => {
    view.reset(initial);
    // Only a new repository restarts the column; later branch changes are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoRoot]);

  const selected = [...view.selected.values()];
  return (
    <section className="branch-col" aria-label={t("branches.column", { number, branch: view.source ?? "" })}>
      <div className="col-head">
        <span className="muted">{t("branches.columnTitle", { number })}</span>
        <button className="btn ghost icon-btn" onClick={onRemove} disabled={!canRemove} aria-label={t("branches.remove", { number })} title={canRemove ? t("branches.remove", { number }) : t("branches.minimum")}>
          <X size={14} />
        </button>
      </div>
      <BranchPane
        view={view}
        branches={branches}
        sessionStatus={sessionStatus}
        compact
        onLoad={async () => {
          if (view.source && selected.length > 0 && (await onLoad(view.source, selected))) view.clearSelection();
        }}
        onExportTxt={() => onExportTxt(view.source, selected)}
        onOpen={(i) => onOpen(view.visible, i)}
      />
    </section>
  );
}
