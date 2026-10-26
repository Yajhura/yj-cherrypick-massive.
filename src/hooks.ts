import { useEffect, useMemo, useRef, useState } from "react";
import { api, Author, Commit, CommitDiff, CommitList, CommitQuery, errorMessage, FileStat } from "./api";
import { rangeBetween } from "./basket";
import { isSelectable } from "./components/CommitList";
import { onlyToday } from "./selection";

export interface Filters {
  target: string;
  /** Selected author emails; empty means any author. */
  authors: string[];
  since: string;
  until: string;
  text: string;
  ticket: string;
  hideApplied: boolean;
  hideMerges: boolean;
}

export const emptyFilters: Filters = {
  target: "",
  authors: [],
  since: "",
  until: "",
  text: "",
  ticket: "",
  hideApplied: false,
  hideMerges: false,
};

/** Loads the commit list for the current branch and filters, debounced while typing. */
export function useCommits(repo: string | null, source: string | null, filters: Filters, ticketPattern: string, reloadKey: number) {
  const [list, setList] = useState<CommitList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { target, authors, since, until, text, ticket } = filters;
  const authorsKey = authors.join(",");
  useEffect(() => {
    if (!repo || !source) {
      setList(null);
      return;
    }
    let cancelled = false;
    const query: CommitQuery = {
      source,
      target: target || undefined,
      authors,
      since: since || undefined,
      until: until || undefined,
      text: text || undefined,
      ticket: ticket || undefined,
      ticketPattern,
    };
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .listCommits(repo, query)
        .then((result) => {
          if (cancelled) return;
          setList(result);
          setError(null);
        })
        .catch((e) => !cancelled && setError(errorMessage(e)))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [repo, source, target, authorsKey, since, until, text, ticket, ticketPattern, reloadKey]);

  return { list, loading, error };
}

interface Detail {
  stat: FileStat[];
  diff: CommitDiff;
}

/** Stat and diff of the active commit; the next commit is prefetched so J/K feels instant. */
export function useCommitDetail(repo: string | null, active: Commit | null, next: Commit | null) {
  const cache = useRef(new Map<string, Promise<Detail>>());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cache.current.clear();
  }, [repo]);

  const load = (hash: string): Promise<Detail> => {
    let entry = cache.current.get(hash);
    if (!entry && repo) {
      entry = Promise.all([api.commitStat(repo, hash), api.commitDiff(repo, hash)]).then(([stat, diff]) => ({ stat, diff }));
      entry.catch(() => cache.current.delete(hash));
      cache.current.set(hash, entry);
      if (cache.current.size > 40) {
        const oldest = cache.current.keys().next().value;
        if (oldest) cache.current.delete(oldest);
      }
    }
    return entry ?? Promise.reject("no repository");
  };

  useEffect(() => {
    if (!repo || !active) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    load(active.hash)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    if (next) load(next.hash).catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, active?.hash, next?.hash]);

  return { detail, loading, error };
}

/**
 * One branch's commit list with its own filters, selection and active row. The History
 * tab and each column of the Branches tab are one of these.
 */
export function useBranchView(repo: string | null, ticketPattern: string, reloadKey: number) {
  const [source, setSource] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => onlyToday(emptyFilters, new Date()));
  const [selected, setSelected] = useState<Map<string, Commit>>(new Map());
  const [activeIndex, setActiveIndex] = useState(0);

  const [authors, setAuthors] = useState<Author[]>([]);
  useEffect(() => {
    if (!repo || !source) return setAuthors([]);
    let cancelled = false;
    api
      .listAuthors(repo, source)
      .then((list) => !cancelled && setAuthors(list))
      .catch(() => !cancelled && setAuthors([]));
    return () => {
      cancelled = true;
    };
  }, [repo, source, reloadKey]);

  const { list, loading, error } = useCommits(repo, source, filters, ticketPattern, reloadKey);
  const visible = useMemo(() => {
    const commits = list?.commits ?? [];
    return commits.filter((c) => !(filters.hideApplied && c.alreadyInTarget) && !(filters.hideMerges && c.isMerge));
  }, [list, filters.hideApplied, filters.hideMerges]);

  const safeIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));

  /** A new repo starts from scratch, on today's commits. */
  const reset = (branch: string | null) => {
    setSource(branch);
    setFilters(onlyToday(emptyFilters, new Date()));
    setSelected(new Map());
    setActiveIndex(0);
  };

  /** Another branch keeps the filters but starts again on today. */
  const selectBranch = (name: string) => {
    setSource(name);
    setFilters((f) => onlyToday(f, new Date()));
    setSelected(new Map());
    setActiveIndex(0);
  };

  const changeFilters = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch, hideApplied: (patch.target ?? f.target) ? (patch.hideApplied ?? f.hideApplied) : false }));
    setActiveIndex(0);
  };

  const toggle = (c: Commit) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(c.hash)) next.delete(c.hash);
      else next.set(c.hash, c);
      return next;
    });

  const selectRange = (from: number, to: number) =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of rangeBetween(visible, from, to)) next.set(c.hash, c);
      return next;
    });

  return {
    source,
    filters,
    authors,
    list,
    loading,
    error,
    visible,
    selected,
    safeIndex,
    active: visible[safeIndex] ?? null,
    reset,
    selectBranch,
    changeFilters,
    clearFilters: () => setFilters(emptyFilters),
    setActiveIndex,
    toggle,
    selectRange,
    selectAll: () => setSelected(new Map(visible.filter(isSelectable).map((c) => [c.hash, c]))),
    clearSelection: () => setSelected(new Map()),
  };
}

export type BranchView = ReturnType<typeof useBranchView>;
