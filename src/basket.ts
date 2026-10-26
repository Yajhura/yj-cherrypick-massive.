import type { Commit, Session } from "./api.ts";

/** Commits waiting in the Cherry-pick tab, all loaded from one branch (plus pasted hashes). */
export interface Basket {
  source: string | null;
  commits: Commit[];
}

export const emptyBasket: Basket = { source: null, commits: [] };

export type LoadResult =
  | { kind: "loaded"; basket: Basket }
  /** The basket holds commits of another branch: the user decides whether to replace them. */
  | { kind: "confirm"; current: string | null; replacement: Basket };

function merge(existing: Commit[], incoming: Commit[]): { commits: Commit[]; repeated: number } {
  const seen = new Set(existing.map((c) => c.hash));
  const added = incoming.filter((c) => !seen.has(c.hash) && seen.add(c.hash));
  return { commits: [...existing, ...added], repeated: incoming.length - added.length };
}

/** Loads commits selected in the history of `source`, one branch at a time. */
export function loadIntoBasket(basket: Basket, source: string, commits: Commit[]): LoadResult {
  if (basket.commits.length > 0 && basket.source !== source) {
    return { kind: "confirm", current: basket.source, replacement: { source, commits: merge([], commits).commits } };
  }
  return { kind: "loaded", basket: { source, commits: merge(basket.commits, commits).commits } };
}

/** Adds commits found by hash, which may come from any branch. */
export function addToBasket(basket: Basket, commits: Commit[]): { basket: Basket; repeated: number } {
  const { commits: merged, repeated } = merge(basket.commits, commits);
  return { basket: { ...basket, commits: merged }, repeated };
}

/** Selectable commits between two rows of the history, both included. */
export function rangeBetween(commits: Commit[], from: number, to: number): Commit[] {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return commits.slice(start, end + 1).filter((c) => !c.isMerge);
}

/** Oldest author date first, like the engine. Compares instants, so time zones do not matter. */
export function orderByDate<T extends { date: string }>(commits: T[]): T[] {
  return [...commits].sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
}

export interface Progress {
  done: number;
  total: number;
  percent: number;
  applied: number;
  empty: number;
  skipped: number;
  pending: number;
}

export function progressOf(session: Session): Progress {
  const count = (status: string) => session.items.filter((i) => i.status === status).length;
  const total = session.items.length;
  const pending = count("pending");
  const done = total - pending;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    applied: count("applied"),
    empty: count("empty"),
    skipped: count("skipped"),
    pending,
  };
}
