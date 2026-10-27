import { test } from "node:test";
import assert from "node:assert/strict";
import { blameCard, explorerStart, findMatches, searchFiles } from "./explorerModel.ts";

const paths = [
  "src/app/patient/patient.service.ts",
  "src/app/app.component.ts",
  "src/app/patient/patient-list.component.ts",
  "README.md",
  "src/app/shared/pager.ts",
  "docs/patient.md",
];

test("an exact file name comes first, then names that start with the query, then contain it", () => {
  assert.deepEqual(searchFiles(paths, "README.md"), ["README.md"]);
  assert.deepEqual(searchFiles(paths, "patient").slice(0, 3), ["docs/patient.md", "src/app/patient/patient.service.ts", "src/app/patient/patient-list.component.ts"]);
});

test("the search is fuzzy, case-insensitive and also matches folders", () => {
  assert.deepEqual(searchFiles(paths, "PTSRV"), ["src/app/patient/patient.service.ts"]);
  assert.deepEqual(searchFiles(paths, "shared/"), ["src/app/shared/pager.ts"]);
  assert.deepEqual(searchFiles(paths, "zzz"), []);
});

test("an empty query lists the first files and the result is capped", () => {
  assert.equal(searchFiles(paths, "  ").length, paths.length);
  assert.equal(searchFiles(paths, "a", 2).length, 2);
});

test("the blame card carries the line's commit and the lines it shares", () => {
  const blame = {
    lines: ["aaaa1111aaaa", "bbbb2222bbbb", "aaaa1111aaaa"],
    commits: {
      aaaa1111aaaa: { author: "Ana", date: "2026-02-01T10:00:00+00:00", subject: "JIRA-1 add" },
      bbbb2222bbbb: { author: "Bruno", date: "2026-02-02T10:00:00+00:00", subject: "JIRA-2 edit" },
    },
  };
  assert.deepEqual(blameCard(blame, 2), { hash: "aaaa1111aaaa", shortHash: "aaaa1111", author: "Ana", date: "2026-02-01T10:00:00+00:00", subject: "JIRA-1 add", lines: [0, 2] });
  assert.equal(blameCard(blame, 9), null);
});

test("in-file search finds every match, case-insensitive, with its line and columns", () => {
  const lines = ["const Foo = 1;", "foo(foo);", "bar"];
  assert.deepEqual(findMatches(lines, "foo"), [
    { line: 0, start: 6, end: 9 },
    { line: 1, start: 0, end: 3 },
    { line: 1, start: 4, end: 7 },
  ]);
  assert.deepEqual(findMatches(lines, ""), []);
});

test("the explorer opens on the configured branch, else main, else the first remote", () => {
  const b = (...names: string[]) => names.map((name) => ({ name, isRemote: name.startsWith("origin/") }));
  assert.equal(explorerStart(b("origin/main", "origin/develop"), "origin/develop"), "origin/develop");
  assert.equal(explorerStart(b("origin/main", "origin/release/1"), "origin/develop"), "origin/main");
  assert.equal(explorerStart(b("develop", "origin/release/1"), "origin/develop"), "origin/release/1");
  assert.equal(explorerStart(b("main"), "origin/develop"), "main");
  assert.equal(explorerStart([], "origin/develop"), null);
});
