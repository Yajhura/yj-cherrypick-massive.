import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { buildTree, TreeNode } from "../diffModel";
import { useI18n } from "../i18n";

interface Props {
  files: string[];
  selected: string | null;
  onSelect: (path: string) => void;
}

type Entry = { path: string; additions: null; deletions: null };

/** Folders that hold `path`, so opening a file from F1 shows where it lives. */
function ancestors(path: string) {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** The branch's folders and files; folders start closed. */
export function ExplorerTree({ files, selected, onSelect }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selected) setOpen((prev) => new Set([...prev, ...ancestors(selected)]));
  }, [selected]);

  const tree = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const entries: Entry[] = (q ? files.filter((f) => f.toLowerCase().includes(q)) : files).map((path) => ({ path, additions: null, deletions: null }));
    return buildTree(entries);
  }, [files, filter]);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const filtering = filter.trim() !== "";
  const render = (nodes: TreeNode<Entry>[], depth: number) =>
    nodes.map((node) => {
      if (node.kind === "folder") {
        // A filter shows every match, so folders stay open while filtering.
        const expanded = filtering || open.has(node.path);
        return (
          <div key={`d:${node.path}`} role="group">
            <button type="button" className="tree-row folder" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(node.path)} aria-expanded={expanded} title={node.path}>
              {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <Folder size={14} aria-hidden="true" />
              <span className="name">{node.name}</span>
            </button>
            {expanded && render(node.children, depth + 1)}
          </div>
        );
      }
      return (
        <button
          type="button"
          key={`f:${node.path}`}
          className={`tree-row file${node.path === selected ? " selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 + 18 }}
          onClick={() => onSelect(node.path)}
          aria-current={node.path === selected}
          title={node.path}
        >
          <FileText size={14} aria-hidden="true" />
          <span className="name">{node.name}</span>
        </button>
      );
    });

  return (
    <nav className="file-tree" aria-label={t("files.tree")}>
      <input className="input" placeholder={t("viewer.filterFiles")} aria-label={t("viewer.filterFiles")} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="tree-body">{tree.length === 0 ? <p className="empty">{t("viewer.noFiles")}</p> : render(tree, 0)}</div>
    </nav>
  );
}
