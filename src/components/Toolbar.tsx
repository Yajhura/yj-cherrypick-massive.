import { useEffect, useRef, useState } from "react";
import { ChevronDown, Cherry, Download, FileSpreadsheet, FileText, FolderOpen, PanelRightClose, PanelRightOpen, RefreshCw, Settings, Table } from "lucide-react";
import { ExportFormat } from "../api";
import { Key, useI18n } from "../i18n";

interface Props {
  repoRoot: string;
  branch: string | null;
  fetching: boolean;
  selectedCount: number;
  sessionActive: boolean;
  visibleCount: number;
  cherryPickDisabledReason: string | null;
  onOpenRepo: () => void;
  onFetch: () => void;
  onCherryPick: () => void;
  onExport: (format: ExportFormat) => void;
  onSettings: () => void;
  showChanges: boolean;
  onToggleChanges: () => void;
}

const formats: { format: ExportFormat; label: Key; Icon: typeof Table }[] = [
  { format: "xlsx", label: "toolbar.exportXlsx", Icon: FileSpreadsheet },
  { format: "csv", label: "toolbar.exportCsv", Icon: Table },
  { format: "markdown", label: "toolbar.exportMd", Icon: FileText },
];

function repoName(root: string) {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root;
}

export function Toolbar(props: Props) {
  const { t } = useI18n();
  const { repoRoot, branch, fetching, selectedCount, sessionActive, visibleCount, cherryPickDisabledReason } = props;
  const cherryPickLabel = sessionActive
    ? t("toolbar.sessionInProgress")
    : selectedCount === 1
      ? t("toolbar.cherryPick1")
      : selectedCount > 1
        ? t("toolbar.cherryPickN", { count: selectedCount })
        : t("toolbar.cherryPick");
  const changesLabel = props.showChanges ? t("toolbar.hideChanges") : t("toolbar.showChanges");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  return (
    <header className="toolbar">
      <div className="repo">
        <b>{repoName(repoRoot)}</b>
        <small title={repoRoot}>{branch ?? t("toolbar.noBranch")}</small>
      </div>
      <button className="btn" onClick={props.onOpenRepo} title={t("toolbar.openTitle")}>
        <FolderOpen size={16} /> {t("toolbar.open")}
      </button>
      <button className="btn" onClick={props.onFetch} disabled={fetching} title={t("toolbar.fetchTitle")}>
        <RefreshCw size={16} className={fetching ? "spin" : undefined} /> {fetching ? t("toolbar.fetching") : t("toolbar.fetch")}
      </button>
      <div className="spacer" />
      <div className="menu-wrap" ref={menuRef}>
        <button
          className="btn"
          disabled={visibleCount === 0}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          title={t("toolbar.exportTitle")}
        >
          <Download size={16} /> {t("toolbar.export")} {visibleCount > 0 ? visibleCount : ""} <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <div className="menu" role="menu" onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}>
            {formats.map(({ format, label, Icon }) => (
              <button
                key={format}
                role="menuitem"
                autoFocus={format === "xlsx"}
                onClick={() => {
                  setMenuOpen(false);
                  props.onExport(format);
                }}
              >
                <Icon size={16} /> {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className="btn primary"
        onClick={props.onCherryPick}
        disabled={cherryPickDisabledReason !== null}
        title={cherryPickDisabledReason ?? t("toolbar.cherryPickTitle")}
        aria-describedby={cherryPickDisabledReason ? "cherry-pick-reason" : undefined}
      >
        <Cherry size={16} />
        {cherryPickLabel}
      </button>
      {cherryPickDisabledReason && (
        <span id="cherry-pick-reason" className="sr-only">
          {cherryPickDisabledReason}
        </span>
      )}
      <button
        className="btn ghost icon-btn"
        onClick={props.onToggleChanges}
        aria-pressed={props.showChanges}
        aria-label={changesLabel}
        title={`${changesLabel} (Ctrl+D)`}
      >
        {props.showChanges ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
      </button>
      <button className="btn ghost icon-btn" onClick={props.onSettings} aria-label={t("toolbar.settings")} title={t("toolbar.settings")}>
        <Settings size={16} />
      </button>
    </header>
  );
}
