import { test } from "node:test";
import assert from "node:assert/strict";
import { type Basket, addToBasket, emptyBasket, inEveryTarget, isQueueActive, loadIntoBasket, orderByDate, polledSession, progressOf, rangeBetween, suggestTarget, targetsDone } from "./basket.ts";
import type { Commit, Queue, QueueEntry, Session } from "./api.ts";

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

test("a progress poll only accepts a session that is still running", () => {
  const base = { items: [], warnings: [], repo: "r", target: "t", branch: "b", worktree: "w", current: 0 };
  const running = { ...base, state: { kind: "running" } } as unknown as Session;
  const conflict = { ...base, state: { kind: "conflict", files: ["a"] } } as unknown as Session;
  const pushFailed = { ...base, state: { kind: "completed", pushed: false, pushError: "x", nothingApplied: false } } as unknown as Session;
  const done = { ...base, state: { kind: "completed", pushed: true, pushError: null, nothingApplied: false } } as unknown as Session;
  const aborted = { ...base, state: { kind: "aborted" } } as unknown as Session;
  assert.equal(polledSession(running), running);
  assert.equal(polledSession(conflict), conflict);
  assert.equal(polledSession(pushFailed), pushFailed);
  // A finished run left in the file from before must not replace the screen.
  assert.equal(polledSession(done), null);
  assert.equal(polledSession(aborted), null);
  assert.equal(polledSession(null), null);
});

test("a queue is active while a target is pending or running", () => {
  const entry = (outcome: QueueEntry["outcome"]) => ({ target: "t", branch: "b", outcome, applied: 0, empty: 0, skipped: 0, error: null });
  const q = (...o: QueueEntry["outcome"][]) => ({ repo: "r", hashes: [], entries: o.map(entry) }) as Queue;
  assert.equal(isQueueActive(q("pushed", "running")), true);
  assert.equal(isQueueActive(q("pushed", "pending")), true);
  assert.equal(isQueueActive(q("pushed", "aborted", "nothingApplied", "failed")), false);
  assert.equal(isQueueActive(null), false);
  assert.deepEqual(targetsDone(q("pushed", "aborted", "running", "pending")), { done: 2, total: 4 });
});

test("only commits present in every chosen target can be removed as already there", () => {
  const found = new Map([
    ["origin/release/1", new Set(["a", "b"])],
    ["origin/release/2", new Set(["b"])],
  ]);
  assert.deepEqual(inEveryTarget(found, ["a", "b", "c"], ["origin/release/1", "origin/release/2"]), ["b"]);
  assert.deepEqual(inEveryTarget(found, ["a", "b"], ["origin/release/1"]), ["a", "b"]);
  assert.deepEqual(inEveryTarget(found, ["a"], []), []);
});

test("the next suggested target skips the source and the targets already chosen", () => {
  const branches = ["origin/main", "origin/develop", "origin/release/2", "origin/release/1", "develop"].map((name) => ({ name, isRemote: name.startsWith("origin/") }));
  assert.equal(suggestTarget(branches, [], "origin/develop"), "origin/release/2");
  assert.equal(suggestTarget(branches, ["origin/release/2"], "origin/develop"), "origin/release/1");
  assert.equal(suggestTarget(branches, ["origin/release/2", "origin/release/1"], "origin/develop"), "origin/main");
  assert.equal(suggestTarget(branches, ["origin/release/2", "origin/release/1", "origin/main"], "origin/develop"), "");
});
