import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRows,
  buildTree,
  changeStops,
  languageFor,
  markRanges,
  parseHunks,
  splitHighlighted,
  splitPatch,
  toSplit,
  wordDiff,
} from "./diffModel.ts";

const filePatch = [
  "diff --git a/a.cs b/a.cs",
  "index 1..2 100644",
  "--- a/a.cs",
  "+++ b/a.cs",
  "@@ -2,3 +2,3 @@ class A",
  " two\r",
  "-three",
  "+THREE",
  " four",
  "@@ -9,2 +9,3 @@",
  " nine",
  "+nine and a half",
  " ten",
  "\\ No newline at end of file",
].join("\n");

test("hunks carry line numbers on both sides and drop CR and no-newline markers", () => {
  const hunks = parseHunks(filePatch);
  assert.equal(hunks.length, 2);
  assert.deepEqual(
    hunks[0].lines.map((l) => [l.kind, l.text, l.oldNo, l.newNo]),
    [
      ["ctx", "two", 2, 2],
      ["del", "three", 3, null],
      ["add", "THREE", null, 3],
      ["ctx", "four", 4, 4],
    ],
  );
  assert.deepEqual(hunks[1].lines.map((l) => l.text), ["nine", "nine and a half", "ten"]);
  assert.deepEqual([hunks[1].oldStart, hunks[1].newStart], [9, 9]);
});

test("a commit patch is split per file, with renames, deletions and binaries", () => {
  const patch = [
    "diff --git a/src/old name.cs b/src/new name.cs",
    "similarity index 90%",
    "rename from src/old name.cs",
    "rename to src/new name.cs",
    "--- a/src/old name.cs",
    "+++ b/src/new name.cs",
    "@@ -1 +1 @@",
    "-a",
    "+b",
    "diff --git a/gone.txt b/gone.txt",
    "deleted file mode 100644",
    "--- a/gone.txt",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-x",
    "diff --git a/logo.bin b/logo.bin",
    "new file mode 100644",
    "Binary files /dev/null and b/logo.bin differ",
    "diff --git a/moved.txt b/dir/moved.txt",
    "similarity index 100%",
    "rename from moved.txt",
    "rename to dir/moved.txt",
  ].join("\n");
  const files = splitPatch(patch);
  assert.deepEqual([...files.keys()], ["src/new name.cs", "gone.txt", "logo.bin", "dir/moved.txt"]);
  assert.equal(files.get("src/new name.cs")!.hunks.length, 1);
  assert.equal(files.get("gone.txt")!.hunks[0].lines[0].kind, "del");
  assert.equal(files.get("logo.bin")!.binary, true);
  assert.equal(files.get("dir/moved.txt")!.hunks.length, 0);
});

const newContent = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
newContent[2] = "THREE";
newContent.splice(9, 0, "nine and a half");
// newContent: 13 lines; hunks cover new 2-4 and 9-11.

test("rows show gaps that expand from either side with the right numbers", () => {
  const hunks = parseHunks(filePatch);
  const collapsed = buildRows(hunks, newContent, new Map());
  const gaps = collapsed.filter((r) => r.type === "gap");
  assert.deepEqual(
    gaps.map((g) => g.type === "gap" && [g.key, g.newFrom, g.newTo]),
    [
      ["0", 1, 1],
      ["1", 5, 8],
      ["2", 12, 13],
    ],
  );
  // Reveal 2 lines below the first hunk and 1 line above the second.
  const opened = buildRows(hunks, newContent, new Map([["1", { top: 2, bottom: 1 }]]));
  const shown = opened.filter((r) => r.type === "line" && r.line.kind === "ctx" && r.expanded).map((r) => r.type === "line" && [r.line.oldNo, r.line.newNo, r.line.text]);
  assert.deepEqual(shown, [
    [5, 5, "line 5"],
    [6, 6, "line 6"],
    [8, 8, "line 8"],
  ]);
  const rest = opened.find((r) => r.type === "gap" && r.key === "1");
  assert.ok(rest && rest.type === "gap" && rest.newFrom === 7 && rest.newTo === 7);
  // Without the file content (binary, too large) gaps cannot expand.
  assert.equal(buildRows(hunks, null, new Map()).filter((r) => r.type === "gap").length, 0);
});

test("side by side pairs deletions with additions and keeps the leftovers alone", () => {
  const hunks = parseHunks(["@@ -1,4 +1,3 @@", " same", "-a", "-b", "+A", " end"].join("\n"));
  const split = toSplit(buildRows(hunks, null, new Map()));
  assert.deepEqual(
    split.map((r) => r.type === "pair" && [r.left?.text ?? null, r.right?.text ?? null]),
    [
      ["same", "same"],
      ["a", "A"],
      ["b", null],
      ["end", "end"],
    ],
  );
});

test("word diff marks only the changed words", () => {
  const { left, right } = wordDiff("int total = count + 1;", "int total = count + 2;");
  assert.deepEqual(left, [[20, 21]]);
  assert.deepEqual(right, [[20, 21]]);
  const moved = wordDiff("return a;", "return b;");
  assert.deepEqual(moved.right, [[7, 8]]);
});

test("change stops run through every file in order and count blocks, not lines", () => {
  const two = parseHunks(filePatch);
  const one = parseHunks(["@@ -1 +1 @@", "-x", "+y"].join("\n"));
  const stops = changeStops([
    { path: "a.cs", hunks: two },
    { path: "b.cs", hunks: [] },
    { path: "c.cs", hunks: one },
  ]);
  assert.deepEqual(
    stops.map((s) => [s.path, s.newLine]),
    [
      ["a.cs", 3],
      ["a.cs", 10],
      ["c.cs", 1],
    ],
  );
});

test("the tree groups folders, compacts single-child chains and sorts folders first", () => {
  const tree = buildTree([
    { path: "CEM.API/CEM.DOMAIN/Repo/IRepo.cs", additions: 1, deletions: 0 },
    { path: "CEM.API/CEM.DOMAIN/Repo/Repo.cs", additions: 2, deletions: 1 },
    { path: "CEM.API/Program.cs", additions: 0, deletions: 3 },
    { path: "README.md", additions: 1, deletions: 1 },
  ]);
  assert.deepEqual(
    tree.map((n) => [n.name, n.kind]),
    [
      ["CEM.API", "folder"],
      ["README.md", "file"],
    ],
  );
  const api = tree[0];
  assert.ok(api.kind === "folder");
  assert.deepEqual(
    api.children.map((n) => n.name),
    ["CEM.DOMAIN/Repo", "Program.cs"],
  );
  assert.deepEqual([api.additions, api.deletions], [3, 4]);
});

test("highlighted html is split into lines, reopening spans that cross newlines", () => {
  const html = 'a <span class="hljs-comment">/* x\ny */</span> &lt;b&gt; &amp;&quot;\n<span class="hljs-string">&#x27;s&#x27;</span>';
  const lines = splitHighlighted(html);
  assert.deepEqual(lines, [
    [
      { text: "a ", cls: "" },
      { text: "/* x", cls: "hljs-comment" },
    ],
    [
      { text: "y */", cls: "hljs-comment" },
      { text: ' <b> &"', cls: "" },
    ],
    [{ text: "'s'", cls: "hljs-string" }],
  ]);
});

test("changed ranges split highlighted segments", () => {
  const segs = [
    { text: "int ", cls: "hljs-type" },
    { text: "x = 1;", cls: "" },
  ];
  assert.deepEqual(markRanges(segs, [[2, 6]]), [
    { text: "in", cls: "hljs-type", changed: false },
    { text: "t ", cls: "hljs-type", changed: true },
    { text: "x ", cls: "", changed: true },
    { text: "= 1;", cls: "", changed: false },
  ]);
});

test("languages come from the extension", () => {
  assert.equal(languageFor("src/A.cs"), "csharp");
  assert.equal(languageFor("x/App.TSX"), "typescript");
  assert.equal(languageFor("proj.csproj"), "xml");
  assert.equal(languageFor("appsettings.json"), "json");
  assert.equal(languageFor("db/001.sql"), "sql");
  assert.equal(languageFor("Makefile"), null);
});
