import { test } from "node:test";
import assert from "node:assert/strict";
import { clickAction, onlyToday, todayISO } from "./selection.ts";

test("a plain click only shows the commit; Ctrl toggles one and Shift selects the range", () => {
  assert.equal(clickAction({ ctrlKey: false, metaKey: false, shiftKey: false }), "activate");
  assert.equal(clickAction({ ctrlKey: true, metaKey: false, shiftKey: false }), "toggle");
  assert.equal(clickAction({ ctrlKey: false, metaKey: true, shiftKey: false }), "toggle");
  assert.equal(clickAction({ ctrlKey: false, metaKey: false, shiftKey: true }), "range");
  // Shift wins, as in Explorer: Ctrl+Shift extends the range.
  assert.equal(clickAction({ ctrlKey: true, metaKey: false, shiftKey: true }), "range");
});

test("today is the local calendar day, padded for date inputs", () => {
  assert.equal(todayISO(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(todayISO(new Date(2026, 9, 26, 0, 1)), "2026-10-26");
});

test("the date range starts on today and keeps every other filter", () => {
  const filters = { text: "fix", since: "2026-01-01", until: "", authors: ["a@x"] };
  assert.deepEqual(onlyToday(filters, new Date(2026, 9, 26, 9)), { text: "fix", since: "2026-10-26", until: "2026-10-26", authors: ["a@x"] });
});
