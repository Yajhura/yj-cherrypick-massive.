// Pure model of the code viewer: parsing patches, building rows with expandable
// context, side-by-side pairing, word-level changes, change stops, the file tree
// and highlighted line segments. No DOM or Tauri here, so it is unit-tested.

export type LineKind = "ctx" | "add" | "del";

export interface DiffLine {
  kind: LineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Text after the second `@@`, usually the enclosing class or function. */
  section: string;
  lines: DiffLine[];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/** Hunks of one file's patch. Header lines before the first hunk are ignored. */
export function parseHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const header = HUNK.exec(line);
    if (header) {
      current = {
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        section: header[5] ?? "",
        lines: [],
      };
      hunks.push(current);
      oldNo = current.oldStart;
      newNo = current.newStart;
      continue;
    }
    if (!current) continue;
    const mark = line[0];
    const text = line.slice(1);
    if (mark === " ") current.lines.push({ kind: "ctx", text, oldNo: oldNo++, newNo: newNo++ });
    else if (mark === "-") current.lines.push({ kind: "del", text, oldNo: oldNo++, newNo: null });
    else if (mark === "+") current.lines.push({ kind: "add", text, oldNo: null, newNo: newNo++ });
    // "\ No newline at end of file" and anything else is not a line of the file.
  }
  return hunks;
}

export interface FilePatch {
  hunks: Hunk[];
  binary: boolean;
}

function pathOf(section: string[]): string | null {
  const after = (prefix: string) => section.find((l) => l.startsWith(prefix))?.slice(prefix.length) ?? null;
  const plus = after("+++ b/");
  if (plus !== null) return plus;
  const renamed = after("rename to ") ?? after("copy to ");
  if (renamed !== null) return renamed;
  const minus = after("--- a/");
  if (minus !== null) return minus;
  const binary = /^Binary files (?:a\/(.*)|\/dev\/null) and (?:b\/(.*)|\/dev\/null) differ$/.exec(section.find((l) => l.startsWith("Binary files ")) ?? "");
  if (binary) return binary[2] ?? binary[1] ?? null;
  // "diff --git a/X b/X": both halves are the same path.
  const rest = section[0].slice("diff --git a/".length);
  const half = (rest.length - 3) / 2;
  if (Number.isInteger(half) && rest.slice(0, half) === rest.slice(half + 3)) return rest.slice(0, half);
  return null;
}

/** Splits a whole-commit patch into one entry per file, keyed by the new path. */
export function splitPatch(patch: string): Map<string, FilePatch> {
  const files = new Map<string, FilePatch>();
  const lines = patch.split("\n");
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const section = lines.slice(start, end).map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
    const path = pathOf(section);
    if (path !== null) {
      files.set(path, {
        hunks: parseHunks(section.join("\n")),
        binary: section.some((l) => l.startsWith("Binary files ") || l === "GIT binary patch"),
      });
    }
  };
  lines.forEach((line, i) => {
    if (line.startsWith("diff --git ")) {
      flush(i);
      start = i;
    }
  });
  flush(lines.length);
  return files;
}

export interface Reveal {
  /** Lines shown at the start of the gap (below the previous hunk). */
  top: number;
  /** Lines shown at the end of the gap (above the next hunk). */
  bottom: number;
}

export type Row =
  | { type: "line"; line: DiffLine; id: string; expanded?: boolean }
  /** Hidden unchanged lines that can be expanded from the file content. */
  | { type: "gap"; key: string; newFrom: number; newTo: number; section: string; atStart: boolean; atEnd: boolean }
  /** A jump between hunks that cannot be expanded (no file content). */
  | { type: "sep"; key: string; section: string };

/** First new line a hunk occupies and the first new line after it (pure deletions sit after `newStart`). */
function newSpan(h: Hunk): [number, number] {
  return h.newLines === 0 ? [h.newStart + 1, h.newStart + 1] : [h.newStart, h.newStart + h.newLines];
}

function oldSpan(h: Hunk): [number, number] {
  return h.oldLines === 0 ? [h.oldStart + 1, h.oldStart + 1] : [h.oldStart, h.oldStart + h.oldLines];
}

/**
 * Rows of one file: hunk lines plus the gaps between them. With the new file content,
 * gaps can be revealed from either side; `reveal` is keyed by gap index ("0" is before
 * the first hunk).
 */
export function buildRows(hunks: Hunk[], newContent: string[] | null, reveal: Map<string, Reveal>): Row[] {
  const rows: Row[] = [];
  let nextNew = 1;
  let nextOld = 1;
  const gap = (key: string, from: number, to: number, delta: number, section: string, atStart: boolean, atEnd: boolean) => {
    if (to < from) return;
    if (!newContent) {
      if (!atStart && !atEnd) rows.push({ type: "sep", key, section });
      return;
    }
    const r = reveal.get(key) ?? { top: 0, bottom: 0 };
    const total = to - from + 1;
    const top = atStart ? 0 : Math.min(r.top, total);
    const bottom = atEnd ? 0 : Math.min(r.bottom, total - top);
    const ctx = (n: number): Row => ({
      type: "line",
      id: `g${key}:${n}`,
      expanded: true,
      line: { kind: "ctx", text: newContent[n - 1] ?? "", oldNo: n + delta, newNo: n },
    });
    for (let n = from; n < from + top; n++) rows.push(ctx(n));
    const hiddenFrom = from + top;
    const hiddenTo = to - bottom;
    if (hiddenFrom <= hiddenTo) rows.push({ type: "gap", key, newFrom: hiddenFrom, newTo: hiddenTo, section, atStart, atEnd });
    for (let n = hiddenTo + 1; n <= to; n++) rows.push(ctx(n));
  };

  hunks.forEach((h, i) => {
    const [newFirst, newAfter] = newSpan(h);
    const [oldFirst, oldAfter] = oldSpan(h);
    gap(String(i), nextNew, newFirst - 1, oldFirst - newFirst, h.section, i === 0, false);
    h.lines.forEach((line, j) => rows.push({ type: "line", line, id: `${i}:${j}` }));
    nextNew = newAfter;
    nextOld = oldAfter;
  });
  if (hunks.length > 0 && newContent) {
    gap(String(hunks.length), nextNew, newContent.length, nextOld - nextNew, "", false, true);
  }
  return rows;
}

export type SplitRow =
  | { type: "pair"; left: DiffLine | null; right: DiffLine | null; id: string; expanded?: boolean }
  | Extract<Row, { type: "gap" | "sep" }>;

/** Side-by-side rows: a run of deletions is paired line by line with the additions after it. */
export function toSplit(rows: Row[]): SplitRow[] {
  const out: SplitRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.type !== "line") {
      out.push(row);
      i++;
      continue;
    }
    if (row.line.kind === "ctx") {
      out.push({ type: "pair", left: row.line, right: row.line, id: row.id, expanded: row.expanded });
      i++;
      continue;
    }
    const dels: Extract<Row, { type: "line" }>[] = [];
    const adds: Extract<Row, { type: "line" }>[] = [];
    while (i < rows.length) {
      const r = rows[i];
      if (r.type === "line" && r.line.kind === "del" && adds.length === 0) dels.push(r);
      else if (r.type === "line" && r.line.kind === "add") adds.push(r);
      else break;
      i++;
    }
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      out.push({ type: "pair", left: dels[k]?.line ?? null, right: adds[k]?.line ?? null, id: (dels[k] ?? adds[k]).id });
    }
  }
  return out;
}

export type Range = [number, number];

const TOKEN = /\w+|\s+|[^\w\s]/g;
/** Above this many tokens per side, the whole line is marked instead of diffing words. */
const MAX_TOKENS = 400;

/** Character ranges that differ between an old and a new line, at word granularity. */
export function wordDiff(oldText: string, newText: string): { left: Range[]; right: Range[] } {
  const a = oldText.match(TOKEN) ?? [];
  const b = newText.match(TOKEN) ?? [];
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return { left: oldText ? [[0, oldText.length]] : [], right: newText ? [[0, newText.length]] : [] };
  }
  // Longest common subsequence of tokens.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const keepA = new Array<boolean>(a.length).fill(false);
  const keepB = new Array<boolean>(b.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) {
      keepA[i++] = true;
      keepB[j++] = true;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  const ranges = (tokens: string[], keep: boolean[]): Range[] => {
    const out: Range[] = [];
    let pos = 0;
    tokens.forEach((tok, k) => {
      if (!keep[k]) {
        const last = out[out.length - 1];
        if (last && last[1] === pos) last[1] = pos + tok.length;
        else out.push([pos, pos + tok.length]);
      }
      pos += tok.length;
    });
    return out;
  };
  return { left: ranges(a, keepA), right: ranges(b, keepB) };
}

export interface ChangeStop {
  path: string;
  /** Row id of the first changed line of the block. */
  rowId: string;
  /** New-side line the block sits at, for display. */
  newLine: number;
}

/** One stop per block of consecutive changed lines, through every file in order. */
export function changeStops(files: { path: string; hunks: Hunk[] }[]): ChangeStop[] {
  const stops: ChangeStop[] = [];
  for (const { path, hunks } of files) {
    hunks.forEach((h, i) => {
      let inBlock = false;
      h.lines.forEach((line, j) => {
        if (line.kind === "ctx") {
          inBlock = false;
          return;
        }
        if (inBlock) return;
        inBlock = true;
        const firstAdd = h.lines.slice(j).find((l) => l.kind !== "del");
        const newLine = firstAdd?.newNo ?? newSpan(h)[1];
        stops.push({ path, rowId: `${i}:${j}`, newLine });
      });
    });
  }
  return stops;
}

export interface TreeInput {
  path: string;
  additions: number | null;
  deletions: number | null;
}

export type TreeNode<T extends TreeInput = TreeInput> =
  | { kind: "folder"; name: string; path: string; children: TreeNode<T>[]; additions: number; deletions: number }
  | { kind: "file"; name: string; path: string; file: T };

/** Folder tree of changed files: folders first, single-child folder chains compacted. */
export function buildTree<T extends TreeInput>(files: T[]): TreeNode<T>[] {
  type Folder = Extract<TreeNode<T>, { kind: "folder" }>;
  const root: Folder = { kind: "folder", name: "", path: "", children: [], additions: 0, deletions: 0 };
  for (const file of files) {
    const parts = file.path.split("/");
    let folder = root;
    parts.slice(0, -1).forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let next = folder.children.find((c): c is Folder => c.kind === "folder" && c.name === part);
      if (!next) {
        next = { kind: "folder", name: part, path, children: [], additions: 0, deletions: 0 };
        folder.children.push(next);
      }
      folder = next;
    });
    folder.children.push({ kind: "file", name: parts[parts.length - 1], path: file.path, file });
  }
  const finish = (node: Folder): Folder => {
    node.children = node.children.map((c) => (c.kind === "folder" ? finish(c) : c));
    node.children.sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === "folder" ? -1 : 1));
    for (const c of node.children) {
      node.additions += c.kind === "folder" ? c.additions : (c.file.additions ?? 0);
      node.deletions += c.kind === "folder" ? c.deletions : (c.file.deletions ?? 0);
    }
    // "a" with only "b" inside becomes "a/b".
    if (node !== root && node.children.length === 1 && node.children[0].kind === "folder") {
      const only = node.children[0];
      return { ...only, name: `${node.name}/${only.name}` };
    }
    return node;
  };
  return finish(root).children;
}

export interface Segment {
  text: string;
  /** highlight.js class of the innermost span, or "" for plain text. */
  cls: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x27": "'" };

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, name: string) => {
    if (name in ENTITIES) return ENTITIES[name];
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return m;
  });
}

/**
 * Splits highlight.js HTML into per-line segments. Spans that cross a newline are
 * closed at the end of the line and reopened on the next, so every line renders alone.
 */
export function splitHighlighted(html: string): Segment[][] {
  const lines: Segment[][] = [[]];
  const stack: string[] = [];
  const push = (text: string) => {
    if (!text) return;
    const cls = stack[stack.length - 1] ?? "";
    const line = lines[lines.length - 1];
    const last = line[line.length - 1];
    if (last && last.cls === cls) last.text += text;
    else line.push({ text, cls });
  };
  const TAG = /<span class="([^"]*)">|<\/span>/g;
  let pos = 0;
  const text = (chunk: string) => {
    decode(chunk)
      .split("\n")
      .forEach((part, i) => {
        if (i > 0) lines.push([]);
        push(part);
      });
  };
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    text(html.slice(pos, m.index));
    if (m[1] !== undefined) stack.push(m[1]);
    else stack.pop();
    pos = TAG.lastIndex;
  }
  text(html.slice(pos));
  return lines;
}

export interface MarkedSegment extends Segment {
  changed: boolean;
}

/** Splits segments at the character ranges, marking the parts inside them as changed. */
export function markRanges(segments: Segment[], ranges: Range[]): MarkedSegment[] {
  const out: MarkedSegment[] = [];
  let pos = 0;
  for (const seg of segments) {
    const end = pos + seg.text.length;
    const cuts = new Set<number>([pos, end]);
    for (const [a, b] of ranges) {
      if (a > pos && a < end) cuts.add(a);
      if (b > pos && b < end) cuts.add(b);
    }
    const points = [...cuts].sort((x, y) => x - y);
    for (let k = 0; k < points.length - 1; k++) {
      const [a, b] = [points[k], points[k + 1]];
      const changed = ranges.some(([x, y]) => a >= x && b <= y);
      const last = out[out.length - 1];
      const piece = seg.text.slice(a - pos, b - pos);
      if (last && last.cls === seg.cls && last.changed === changed) last.text += piece;
      else out.push({ text: piece, cls: seg.cls, changed });
    }
    pos = end;
  }
  return out;
}

const LANGUAGES: [RegExp, string][] = [
  [/\.cs$/i, "csharp"],
  [/\.(ts|tsx|mts|cts)$/i, "typescript"],
  [/\.(js|jsx|mjs|cjs)$/i, "javascript"],
  [/\.json$/i, "json"],
  [/\.(xml|csproj|vbproj|props|targets|config|resx|xaml|html?|cshtml|razor|svg|nuspec)$/i, "xml"],
  [/\.sql$/i, "sql"],
  [/\.ya?ml$/i, "yaml"],
  [/\.(css|scss|less)$/i, "css"],
];

/** highlight.js language for a path, or null to show plain text. */
export function languageFor(path: string): string | null {
  return LANGUAGES.find(([re]) => re.test(path))?.[1] ?? null;
}
