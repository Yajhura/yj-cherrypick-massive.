import { test } from "node:test";
import assert from "node:assert/strict";
import { type Basket, addToBasket, emptyBasket, loadIntoBasket, orderByDate, progressOf, rangeBetween } from "./basket.ts";
import type { Commit, Session } from "./api.ts";

const commit = (hash: string, date: string, isMerge = false): Commit => ({
  hash,
  shortHash: hash.slice(0, 8),
  parents: [],
  authorName: "Ana",
  authorEmail: "ana@example.com",
  date,
  subject: `subject ${hash}`,
  body: "",
  tickets: [],
  isMerge,
  alreadyInTarget: false,
});

const a = commit("aaaa", "2026-02-01T10:00:00+00:00");
const b = commit("bbbb", "2026-02-02T10:00:00+00:00");
const m = commit("mmmm", "2026-02-03T10:00:00+00:00", true);
const c = commit("cccc", "2026-02-04T10:00:00+00:00");

test("a range covers both ends in either direction and skips merges", () => {
  const list = [c, m, b, a];
  assert.deepEqual(rangeBetween(list, 0, 3).map((x) => x.hash), ["cccc", "bbbb", "aaaa"]);
  assert.deepEqual(rangeBetween(list, 2, 0).map((x) => x.hash), ["cccc", "bbbb"]);
});

test("loading into an empty basket or from the same branch adds without repeats", () => {
  const first = loadIntoBasket(emptyBasket, "origin/develop", [a, b]);
  assert.equal(first.kind, "loaded");
  const basket = (first as { basket: Basket }).basket;
  const again = loadIntoBasket(basket, "origin/develop", [b, c]);
  assert.deepEqual(again, { kind: "loaded", basket: { source: "origin/develop", commits: [a, b, c] } });
});

test("loading from another branch asks before replacing", () => {
  const basket: Basket = { source: "origin/develop", commits: [a] };
  assert.deepEqual(loadIntoBasket(basket, "origin/feature", [b]), {
    kind: "confirm",
    current: "origin/develop",
    replacement: { source: "origin/feature", commits: [b] },
  });
  // An empty basket never asks, whatever branch it came from.
  assert.equal(loadIntoBasket({ source: "origin/develop", commits: [] }, "origin/feature", [b]).kind, "loaded");
});

test("pasted commits are added to the basket and repeats are counted", () => {
  const basket: Basket = { source: "origin/develop", commits: [a] };
  assert.deepEqual(addToBasket(basket, [a, c]), { basket: { source: "origin/develop", commits: [a, c] }, repeated: 1 });
});

test("commits are applied oldest first by instant, not by text", () => {
  const late = commit("late", "2026-02-01T12:00:00+05:00"); // 07:00 UTC
  const early = commit("early", "2026-02-01T08:00:00+00:00");
  assert.deepEqual(orderByDate([early, late]).map((x) => x.hash), ["late", "early"]);
});

test("progress counts finished picks over the total", () => {
  const item = (status: Session["items"][number]["status"]) => ({ hash: status, subject: "", author: "", date: "", status, newHash: null });
  const session = { items: [item("applied"), item("empty"), item("skipped"), item("pending")] } as Session;
  assert.deepEqual(progressOf(session), { done: 3, total: 4, percent: 75, applied: 1, empty: 1, skipped: 1, pending: 1 });
  assert.equal(progressOf({ items: [] } as unknown as Session).percent, 0);
});
