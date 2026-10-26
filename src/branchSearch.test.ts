import { test } from "node:test";
import assert from "node:assert/strict";
import { searchBranches } from "./branchSearch.ts";

const b = (name: string, isRemote = false) => ({ name, isRemote });
const names = (list: { name: string }[]) => list.map((x) => x.name);

test("exact match comes before longer names that start with the query", () => {
  const branches = [b("cem-412312"), b("cem-fx-4331"), b("main"), b("cem")];
  assert.deepEqual(names(searchBranches(branches, "cem")), ["cem", "cem-412312", "cem-fx-4331"]);
});

test("matches the name without the remote and the last path segment", () => {
  const branches = [b("origin/feature/cem-9", true), b("origin/cem-1", true), b("origin/cem", true), b("origin/acem", true)];
  assert.deepEqual(names(searchBranches(branches, "cem")), ["origin/cem", "origin/cem-1", "origin/feature/cem-9", "origin/acem"]);
});

test("is case-insensitive, trims the query and keeps the given order on ties", () => {
  const branches = [b("release/2.4"), b("release/2.3"), b("develop")];
  assert.deepEqual(names(searchBranches(branches, "  RELEASE ")), ["release/2.4", "release/2.3"]);
});

test("an empty query returns every branch in the given order", () => {
  const branches = [b("main"), b("develop"), b("zeta")];
  assert.deepEqual(names(searchBranches(branches, "")), ["main", "develop", "zeta"]);
});

test("a query that includes the remote name also matches", () => {
  const branches = [b("origin/release/2", true), b("origin/release/1", true), b("release/1")];
  assert.deepEqual(names(searchBranches(branches, "origin/release/1")), ["origin/release/1"]);
  assert.deepEqual(names(searchBranches(branches, "origin/rel")), ["origin/release/2", "origin/release/1"]);
});
