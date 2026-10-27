import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import { searchFiles } from "../explorerModel";
import { useI18n } from "../i18n";

interface Props {
  open: boolean;
  files: string[];
  branch: string | null;
  onPick: (path: string) => void;
  onClose: () => void;
}

/** F1: find a file of the explorer's branch by name or path, from any tab. */
export function FileSearch({ open, files, branch, onPick, onClose }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const results = useMemo(() => searchFiles(files, query), [files, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;
  const pick = (path: string | undefined) => path && onPick(path);
  const name = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const folder = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf("/")));

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("files.searchTitle")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            className="input"
            role="combobox"
            aria-expanded="true"
            aria-controls="file-search-list"
            aria-activedescendant={results[cursor] ? `fs-${cursor}` : undefined}
            placeholder={t("files.searchPlaceholder", { branch: branch ?? "" })}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(results[cursor]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        <ul id="file-search-list" role="listbox" ref={listRef} className="palette-list">
          {results.length === 0 ? (
            <li className="empty">{files.length === 0 ? t("filters.loading") : t("files.searchEmpty")}</li>
          ) : (
            results.map((p, i) => (
              <li key={p} id={`fs-${i}`} role="option" aria-selected={i === cursor} className={i === cursor ? "cursor" : undefined} onMouseEnter={() => setCursor(i)} onClick={() => pick(p)}>
                <FileText size={14} aria-hidden="true" />
                <span className="name">{name(p)}</span>
                <span className="folder mono">{folder(p)}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
