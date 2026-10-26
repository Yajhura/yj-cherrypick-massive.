import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { FileChange } from "../api";
import { buildTree, TreeNode } from "../diffModel";
import { Key, useI18n } from "../i18n";

interface Props {
  files: FileChange[];
  selected: string | null;
  onSelect: (path: string) => void;
}

const STATUS: Record<FileChange["status"], { letter: string; label: Key }> = {
  added: { letter: "A", label: "viewer.statusAdded" },
  modified: { letter: "M", label: "viewer.statusModified" },
  deleted: { letter: "D", label: "viewer.statusDeleted" },
  renamed: { letter: "R", label: "viewer.statusRenamed" },
  copied: { letter: "C", label: "viewer.statusCopied" },
  typechange: { letter: "T", label: "viewer.statusTypechange" },
};

export function statusLabel(status: FileChange["status"]): Key {
  return STATUS[status].label;
}

function Counts({ additions, deletions }: { additions: number | null; deletions: number | null }) {
  const { t } = useI18n();
  if (additions === null) return <span className="muted counts">{t("detail.binary")}</span>;
  return (
    <span className="counts mono">
      {additions > 0 && <span className="add">+{additions}</span>}
      {(deletions ?? 0) > 0 && <span className="del">−{deletions}</span>}
    </span>
  );
}

/** Changed files of a commit as a folder tree with a name filter. */
export function FileTree({ files, selected, onSelect }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return buildTree(q ? files.filter((f) => f.path.toLowerCase().includes(q)) : files);
  }, [files, filter]);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const render = (nodes: TreeNode<FileChange>[], depth: number) =>
    nodes.map((node) => {
      const indent = { paddingLeft: 8 + depth * 14 };
      if (node.kind === "folder") {
        // A filter shows every match, so folders stay open while filtering.
        const open = filter.trim() !== "" || !collapsed.has(node.path);
        return (
          <div key={`d:${node.path}`} role="group">
            <button type="button" className="tree-row folder" style={indent} onClick={() => toggle(node.path)} aria-expanded={open} title={node.path}>
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <Folder size={14} aria-hidden="true" />
              <span className="name">{node.name}</span>
              <Counts additions={node.additions} deletions={node.deletions} />
            </button>
            {open && render(node.children, depth + 1)}
          </div>
        );
      }
      const f = node.file;
      return (
        <button
          type="button"
          key={`f:${node.path}`}
          className={`tree-row file${node.path === selected ? " selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 + 18 }}
          onClick={() => onSelect(node.path)}
          aria-current={node.path === selected}
          title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
        >
          <span className={`file-status ${f.status}`} aria-label={t(STATUS[f.status].label)} title={t(STATUS[f.status].label)}>
            {STATUS[f.status].letter}
          </span>
          <span className="name">{node.name}</span>
          <Counts additions={f.additions} deletions={f.deletions} />
        </button>
      );
    });

  return (
    <nav className="file-tree" aria-label={t("viewer.files")}>
      <input className="input" placeholder={t("viewer.filterFiles")} aria-label={t("viewer.filterFiles")} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="tree-body">
        {tree.length === 0 ? <p className="empty">{t("viewer.noFiles")}</p> : render(tree, 0)}
      </div>
    </nav>
  );
}
