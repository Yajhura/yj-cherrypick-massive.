import { useEffect, useRef, useState } from "react";
import { ChevronDown, Cherry, Download, FileSpreadsheet, FileText, FolderOpen, RefreshCw, Settings, Table } from "lucide-react";
import { ExportFormat } from "../api";

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
}

const formats: { format: ExportFormat; label: string; Icon: typeof Table }[] = [
  { format: "xlsx", label: "Excel workbook (.xlsx)", Icon: FileSpreadsheet },
  { format: "csv", label: "CSV (.csv)", Icon: Table },
  { format: "markdown", label: "Markdown table (.md)", Icon: FileText },
];

function repoName(root: string) {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? root;
}

export function Toolbar(props: Props) {
  const { repoRoot, branch, fetching, selectedCount, sessionActive, visibleCount, cherryPickDisabledReason } = props;
  const cherryPickLabel = sessionActive
    ? "Session in progress"
    : selectedCount > 0
      ? `Cherry-pick ${selectedCount} commit${selectedCount === 1 ? "" : "s"}…`
      : "Cherry-pick…";
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
        <small title={repoRoot}>{branch ?? "No branch selected"}</small>
      </div>
      <button className="btn" onClick={props.onOpenRepo} title="Open another repository (Ctrl+O)">
        <FolderOpen size={16} /> Open
      </button>
      <button className="btn" onClick={props.onFetch} disabled={fetching} title="Fetch all remotes (F5)">
        <RefreshCw size={16} className={fetching ? "spin" : undefined} /> {fetching ? "Fetching…" : "Fetch"}
      </button>
      <div className="spacer" />
      <div className="menu-wrap" ref={menuRef}>
        <button
          className="btn"
          disabled={visibleCount === 0}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          title="Export the commits shown in the list"
        >
          <Download size={16} /> Export {visibleCount > 0 ? visibleCount : ""} <ChevronDown size={14} />
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
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className="btn primary"
        onClick={props.onCherryPick}
        disabled={cherryPickDisabledReason !== null}
        title={cherryPickDisabledReason ?? "Cherry-pick the selected commits (Ctrl+Enter)"}
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
      <button className="btn ghost icon-btn" onClick={props.onSettings} aria-label="Settings" title="Settings">
        <Settings size={16} />
      </button>
    </header>
  );
}
