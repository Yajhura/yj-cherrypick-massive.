import { useMemo, useState } from "react";
import { Cloud, GitBranch } from "lucide-react";
import { Branch } from "../api";

interface Props {
  branches: Branch[];
  current: string | null;
  onSelect: (name: string) => void;
}

export function Sidebar({ branches, current, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const { local, remote } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = branches.filter((b) => !q || b.name.toLowerCase().includes(q));
    return { local: match.filter((b) => !b.isRemote), remote: match.filter((b) => b.isRemote) };
  }, [branches, query]);

  const group = (title: string, items: Branch[], Icon: typeof Cloud) => (
    <>
      <h2>{title}</h2>
      {items.length === 0 && <p className="empty">None</p>}
      {items.map((b) => (
        <button key={b.name} className="branch" aria-current={b.name === current} onClick={() => onSelect(b.name)} title={b.name}>
          <Icon size={14} />
          <span>{b.name}</span>
        </button>
      ))}
    </>
  );

  return (
    <nav className="sidebar" aria-label="Branches">
      <input
        className="input filter-branches"
        placeholder="Filter branches"
        aria-label="Filter branches"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {group("Remote", remote, Cloud)}
      {group("Local", local, GitBranch)}
    </nav>
  );
}
