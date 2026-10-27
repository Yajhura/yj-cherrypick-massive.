import type { Commit, Queue, Session } from "./api.ts";

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

/**
 * What a progress poll may show: only a session that still needs work. A finished run
 * stays in the session file until dismissed and must not replace a new start.
 * Same rule as `isSessionFinished` in api.ts, kept here free of the Tauri runtime.
 */
export function polledSession(s: Session | null): Session | null {
  if (!s) return null;
  const finished = s.state.kind === "aborted" || (s.state.kind === "completed" && s.state.pushError === null);
  return finished ? null : s;
}

/** A queue blocks a new start while a target is pending or running. */
export function isQueueActive(queue: Queue | null): boolean {
  return !!queue && queue.entries.some((e) => e.outcome === "pending" || e.outcome === "running");
}

export function targetsDone(queue: Queue): { done: number; total: number } {
  const done = queue.entries.filter((e) => e.outcome !== "pending" && e.outcome !== "running").length;
  return { done, total: queue.entries.length };
}

/** Commits every chosen target already has: applying them anywhere would change nothing. */
export function inEveryTarget(found: Map<string, Set<string>>, hashes: string[], targets: string[]): string[] {
  if (targets.length === 0) return [];
  return hashes.filter((h) => targets.every((t) => found.get(t)?.has(h)));
}

/** Next remote branch to offer as a target: releases first, then main/master, then the rest. */
export function suggestTarget(branches: { name: string; isRemote: boolean }[], chosen: string[], source: string | null): string {
  const free = branches.filter((b) => b.isRemote && b.name !== source && !chosen.includes(b.name)).map((b) => b.name);
  const rank = (name: string) => (/\/release/.test(name) ? 0 : /\/(main|master)$/.test(name) ? 1 : 2);
  return [...free].sort((a, b) => rank(a) - rank(b))[0] ?? "";
}

/** The branch a new Branches column opens on: develop or main first, then the next suggestion. */
export function columnBranch(branches: { name: string; isRemote: boolean }[], used: string[]): string | null {
  const preferred = ["origin/develop", "origin/main", "origin/master"].find((n) => !used.includes(n) && branches.some((b) => b.name === n));
  return preferred ?? (suggestTarget(branches, used, null) || branches.find((b) => !used.includes(b.name))?.name || null);
}
