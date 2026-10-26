import { useEffect, useRef, useState } from "react";
import { api, Commit, CommitDiff, CommitList, CommitQuery, errorMessage, FileStat } from "./api";

export interface Filters {
  target: string;
  author: string;
  since: string;
  until: string;
  text: string;
  ticket: string;
  hideApplied: boolean;
  hideMerges: boolean;
}

export const emptyFilters: Filters = {
  target: "",
  author: "",
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

  const { target, author, since, until, text, ticket } = filters;
  useEffect(() => {
    if (!repo || !source) {
      setList(null);
      return;
    }
    let cancelled = false;
    const query: CommitQuery = {
      source,
      target: target || undefined,
      author: author || undefined,
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
  }, [repo, source, target, author, since, until, text, ticket, ticketPattern, reloadKey]);

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
