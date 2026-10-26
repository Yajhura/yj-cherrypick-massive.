import { useMemo, useState } from "react";
import { Cloud, GitBranch } from "lucide-react";
import { Branch } from "../api";
import { searchBranches } from "../branchSearch";
import { useI18n } from "../i18n";

interface Props {
  branches: Branch[];
  current: string | null;
  onSelect: (name: string) => void;
}

export function Sidebar({ branches, current, onSelect }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const { local, remote } = useMemo(() => {
    const match = searchBranches(branches, query);
    return { local: match.filter((b) => !b.isRemote), remote: match.filter((b) => b.isRemote) };
  }, [branches, query]);

  const group = (title: string, items: Branch[], Icon: typeof Cloud) => (
    <>
      <h2>{title}</h2>
      {items.length === 0 && <p className="empty">{t("sidebar.none")}</p>}
      {items.map((b) => (
        <button key={b.name} className="branch" aria-current={b.name === current} onClick={() => onSelect(b.name)} title={b.name}>
          <Icon size={14} />
          <span>{b.name}</span>
        </button>
      ))}
    </>
  );

  return (
    <nav className="sidebar" aria-label={t("sidebar.label")}>
      <input
        className="input filter-branches"
        placeholder={t("sidebar.filter")}
        aria-label={t("sidebar.filter")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {group(t("sidebar.remote"), remote, Cloud)}
      {group(t("sidebar.local"), local, GitBranch)}
    </nav>
  );
}
