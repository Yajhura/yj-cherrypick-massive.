interface Named {
  name: string;
  isRemote: boolean;
}

/** Name without the remote: `origin/release/2.4` -> `release/2.4`. */
function localName(b: Named): string {
  const name = b.name.toLowerCase();
  if (!b.isRemote) return name;
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

/** 0 exact, 1 prefix, 2 a later word starts with it, 3 contains it, -1 no match. */
function matchRank(name: string, q: string): number {
  const last = name.slice(name.lastIndexOf("/") + 1);
  if (name === q || last === q) return 0;
  if (name.startsWith(q) || last.startsWith(q)) return 1;
  if (name.split(/[/_\-.]/).some((part) => part.startsWith(q))) return 2;
  return name.includes(q) ? 3 : -1;
}

/**
 * Filters branches by `query` and ranks the closest names first: an exact match,
 * then names starting with the query, shorter first. Ties keep the incoming order,
 * which already puts main, develop and releases first.
 */
export function searchBranches<T extends Named>(branches: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return branches;
  return branches
    .map((branch, index) => {
      const name = localName(branch);
      // "origin/rel" must find origin/release/*: also try the full name.
      const ranks = [matchRank(name, q), matchRank(branch.name.toLowerCase(), q)].filter((r) => r >= 0);
      return { branch, index, rank: ranks.length ? Math.min(...ranks) : -1, length: name.length };
    })
    .filter((m) => m.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.length - b.length || a.index - b.index)
    .map((m) => m.branch);
}
