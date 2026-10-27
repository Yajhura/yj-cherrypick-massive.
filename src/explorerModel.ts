import type { Blame } from "./api.ts";

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/** True when every character of `query` appears in `text` in order. */
function isSubsequence(query: string, text: string) {
  let i = 0;
  for (const ch of text) if (ch === query[i]) i++;
  return i === query.length;
}

/**
 * F1 file search: exact names first (with or without extension), then names that
 * start with the query, names that contain it, paths that contain it and, last,
 * paths that hold its letters in order. Ties go to the shorter path.
 */
export function searchFiles(paths: string[], query: string, limit = 50): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return paths.slice(0, limit);
  const rank = (path: string) => {
    const p = path.toLowerCase();
    const name = baseName(p);
    const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    if (name === q || stem === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (p.includes(q)) return 3;
    return isSubsequence(q, p) ? 4 : -1;
  };
  return paths
    .map((path, index) => ({ path, index, rank: rank(path) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.path.length - b.path.length || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.path);
}

export interface BlameCardData {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  /** Every line (0-based) that comes from the same commit, for highlighting. */
  lines: number[];
}

/** What the hover card shows for a line, or null past the end of the file. */
export function blameCard(blame: Blame, line: number): BlameCardData | null {
  const hash = blame.lines[line];
  const commit = hash ? blame.commits[hash] : undefined;
  if (!hash || !commit) return null;
  const lines = blame.lines.flatMap((h, i) => (h === hash ? [i] : []));
  return { hash, shortHash: hash.slice(0, 8), ...commit, lines };
}

export interface Match {
  line: number;
  start: number;
  end: number;
}

/** Every case-insensitive occurrence of `query` in the file, in reading order. */
export function findMatches(lines: string[], query: string): Match[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const matches: Match[] = [];
  lines.forEach((text, line) => {
    const t = text.toLowerCase();
    for (let at = t.indexOf(q); at !== -1; at = t.indexOf(q, at + q.length)) matches.push({ line, start: at, end: at + q.length });
  });
  return matches;
}

/** The branch the Files tab opens on: the configured one, else main/master, else the first remote. */
export function explorerStart(branches: { name: string; isRemote: boolean }[], wanted: string): string | null {
  const names = branches.map((b) => b.name);
  const found = [wanted, "origin/main", "origin/master"].find((n) => n && names.includes(n));
  return found ?? branches.find((b) => b.isRemote)?.name ?? names[0] ?? null;
}
