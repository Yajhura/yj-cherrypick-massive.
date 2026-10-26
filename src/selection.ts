/** What a click on a commit row does, from the modifier keys held. */
export function clickAction(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): "activate" | "toggle" | "range" {
  if (e.shiftKey) return "range";
  if (e.ctrlKey || e.metaKey) return "toggle";
  return "activate";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day as `YYYY-MM-DD`, the value a date input takes. */
export function todayISO(now: Date) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Narrows the date range to today; a repo or branch opens on today's commits. */
export function onlyToday<F extends { since: string; until: string }>(filters: F, now: Date): F {
  const day = todayISO(now);
  return { ...filters, since: day, until: day };
}
