import { memo, useMemo } from "react";
import { ChevronsDownUp, ChevronDown, ChevronUp } from "lucide-react";
import { DiffLine, markRanges, Range, Row, Segment, toSplit, wordDiff } from "../diffModel";
import { useI18n } from "../i18n";

export type DiffMode = "split" | "unified";

/** Lines revealed per click on a context gap. */
export const EXPAND_STEP = 20;

interface Props {
  rows: Row[];
  mode: DiffMode;
  oldSegs: Segment[][] | null;
  newSegs: Segment[][] | null;
  /** Row id of the change the toolbar navigation points at. */
  currentRow: string | null;
  onReveal: (key: string, side: "top" | "bottom", count: number) => void;
}

/** Word-level ranges for each deleted/added line paired with a counterpart. */
function wordRanges(rows: Row[]): Map<DiffLine, Range[]> {
  const ranges = new Map<DiffLine, Range[]>();
  let i = 0;
  while (i < rows.length) {
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < rows.length) {
      const r = rows[i];
      if (r.type === "line" && r.line.kind === "del" && adds.length === 0) dels.push(r.line);
      else if (r.type === "line" && r.line.kind === "add") adds.push(r.line);
      else break;
      i++;
    }
    if (dels.length === 0 && adds.length === 0) {
      i++;
      continue;
    }
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const { left, right } = wordDiff(dels[k].text, adds[k].text);
      // A line that changed completely reads better without a second tint on top.
      if (left.length > 0 && !(left.length === 1 && left[0][1] - left[0][0] === dels[k].text.length)) ranges.set(dels[k], left);
      if (right.length > 0 && !(right.length === 1 && right[0][1] - right[0][0] === adds[k].text.length)) ranges.set(adds[k], right);
    }
  }
  return ranges;
}

function Code({ line, segs, ranges }: { line: DiffLine; segs: Segment[] | undefined; ranges: Range[] | undefined }) {
  // Highlighting comes from the file; if it does not match the patch line, show the text plain.
  const base = segs && segs.map((s) => s.text).join("") === line.text ? segs : [{ text: line.text, cls: "" }];
  const parts = markRanges(base, ranges ?? []);
  return (
    <span className="code">
      {parts.map((p, i) => (
        <span key={i} className={`${p.cls}${p.changed ? " word" : ""}` || undefined}>
          {p.text}
        </span>
      ))}
      {line.text === "" && " "}
    </span>
  );
}

function Gap({ row, onReveal }: { row: Extract<Row, { type: "gap" }>; onReveal: Props["onReveal"] }) {
  const { t } = useI18n();
  const count = row.newTo - row.newFrom + 1;
  return (
    <div className="d-gap" role="row">
      <span className="gap-actions">
        {!row.atEnd && (
          <button type="button" className="btn ghost" onClick={() => onReveal(row.key, "bottom", EXPAND_STEP)} title={t("viewer.expandUp", { count: EXPAND_STEP })} aria-label={t("viewer.expandUp", { count: EXPAND_STEP })}>
            <ChevronUp size={14} />
          </button>
        )}
        {!row.atStart && (
          <button type="button" className="btn ghost" onClick={() => onReveal(row.key, "top", EXPAND_STEP)} title={t("viewer.expandDown", { count: EXPAND_STEP })} aria-label={t("viewer.expandDown", { count: EXPAND_STEP })}>
            <ChevronDown size={14} />
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => onReveal(row.key, row.atEnd ? "top" : "bottom", count)} title={t("viewer.expandAll", { count })} aria-label={t("viewer.expandAll", { count })}>
          <ChevronsDownUp size={14} />
        </button>
      </span>
      <span className="gap-text">
        {t("viewer.hidden", { count })}
        {row.section && <span className="mono section"> {row.section}</span>}
      </span>
    </div>
  );
}

function Num({ n }: { n: number | null }) {
  return <span className="num mono">{n ?? ""}</span>;
}

/** The diff of one file, unified or side by side, with expandable context. */
export const DiffView = memo(function DiffView({ rows, mode, oldSegs, newSegs, currentRow, onReveal }: Props) {
  const ranges = useMemo(() => wordRanges(rows), [rows]);
  const split = useMemo(() => (mode === "split" ? toSplit(rows) : null), [rows, mode]);
  const segsOf = (line: DiffLine) => (line.kind === "del" ? oldSegs?.[(line.oldNo ?? 0) - 1] : newSegs?.[(line.newNo ?? 0) - 1]);

  if (split) {
    return (
      <div className="diff-table split" role="table">
        {split.map((r) => {
          if (r.type === "gap") return <Gap key={`gap${r.key}`} row={r} onReveal={onReveal} />;
          if (r.type === "sep") return <div key={`sep${r.key}`} className="d-gap sep" role="row"><span className="gap-text mono">{r.section || "⋯"}</span></div>;
          const side = (line: DiffLine | null, which: "left" | "right") =>
            line ? (
              <>
                <Num n={which === "left" ? line.oldNo : line.newNo} />
                <span className={`cell ${line.kind === "ctx" ? "" : line.kind}`}>
                  <Code line={line} segs={segsOf(line)} ranges={ranges.get(line)} />
                </span>
              </>
            ) : (
              <>
                <span className="num empty" />
                <span className="cell empty" />
              </>
            );
          return (
            <div key={r.id} data-row={r.id} className={`d-row${r.id === currentRow ? " current" : ""}${r.expanded ? " expanded" : ""}`} role="row">
              {side(r.left, "left")}
              {side(r.right, "right")}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="diff-table unified" role="table">
      {rows.map((r) => {
        if (r.type === "gap") return <Gap key={`gap${r.key}`} row={r} onReveal={onReveal} />;
        if (r.type === "sep") return <div key={`sep${r.key}`} className="d-gap sep" role="row"><span className="gap-text mono">{r.section || "⋯"}</span></div>;
        const { line } = r;
        return (
          <div key={r.id} data-row={r.id} className={`d-row ${line.kind === "ctx" ? "" : line.kind}${r.id === currentRow ? " current" : ""}${r.expanded ? " expanded" : ""}`} role="row">
            <Num n={line.oldNo} />
            <Num n={line.newNo} />
            <span className="sign mono" aria-hidden="true">
              {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
            </span>
            <span className="cell">
              <Code line={line} segs={segsOf(line)} ranges={ranges.get(line)} />
            </span>
          </div>
        );
      })}
    </div>
  );
});

/** The whole file as it is in the commit, highlighted, with the added lines marked. */
export function FullFile({ segs, added }: { segs: Segment[][]; added: Set<number> }) {
  return (
    <div className="diff-table full" role="table">
      {segs.map((line, i) => (
        <div key={i} className={`d-row${added.has(i + 1) ? " add" : ""}`} role="row">
          <Num n={i + 1} />
          <span className="cell">
            <span className="code">
              {line.map((s, k) => (
                <span key={k} className={s.cls || undefined}>
                  {s.text}
                </span>
              ))}
              {line.length === 0 && " "}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
