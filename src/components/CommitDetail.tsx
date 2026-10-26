import { useMemo } from "react";
import { GitCommitHorizontal, LoaderCircle, TriangleAlert } from "lucide-react";
import { Commit, CommitDiff, FileStat } from "../api";
import { formatDate } from "./CommitList";
import { useI18n } from "../i18n";

interface Props {
  commit: Commit | null;
  stat: FileStat[] | null;
  diff: CommitDiff | null;
  loading: boolean;
  error: string | null;
}

function lineClass(line: string) {
  if (line.startsWith("diff --git")) return "l-file";
  if (line.startsWith("@@")) return "l-hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "l-add";
  if (line.startsWith("-") && !line.startsWith("---")) return "l-del";
  return undefined;
}

export function CommitDetail({ commit, stat, diff, loading, error }: Props) {
  const { t } = useI18n();
  const lines = useMemo(() => (diff ? diff.patch.split("\n") : []), [diff]);

  if (!commit) {
    return (
      <section className="detail" aria-label={t("detail.label")}>
        <div className="placeholder">
          <GitCommitHorizontal size={28} />
          <h2>{t("detail.noneTitle")}</h2>
          <p>{t("detail.noneBody")}</p>
        </div>
      </section>
    );
  }

  const totals = (stat ?? []).reduce((acc, f) => ({ add: acc.add + (f.additions ?? 0), del: acc.del + (f.deletions ?? 0) }), { add: 0, del: 0 });

  return (
    <section className="detail" aria-label={t("detail.label")}>
      <div className="detail-head">
        <h1>{commit.subject}</h1>
        <div className="meta">
          <span>{commit.authorName} &lt;{commit.authorEmail}&gt;</span>
          <span className="mono">{formatDate(commit.date)}</span>
          <span className="mono">{commit.hash}</span>
        </div>
        {commit.body && <p className="body">{commit.body}</p>}
      </div>
      {error && (
        <div className="notice error" role="alert">
          <TriangleAlert size={16} />
          <span className="grow">{t("detail.loadError", { error })}</span>
        </div>
      )}
      {loading && !stat && (
        <div className="placeholder">
          <LoaderCircle size={20} className="spin" />
        </div>
      )}
      {stat && (
        <div className="files" aria-label={t("detail.changedFiles")}>
          <div className="file muted">
            <span>
              {stat.length === 1 ? t("detail.files1") : t("detail.filesN", { count: stat.length })}
            </span>
            <span className="nums mono">
              <span className="add">+{totals.add}</span>
              <span className="del">−{totals.del}</span>
            </span>
          </div>
          {stat.map((f) => (
            <div key={f.path} className="file">
              <span className="path mono" title={f.path}>
                <bdi>{f.path}</bdi>
              </span>
              <span className="nums mono">
                {f.additions === null ? (
                  <span className="muted">{t("detail.binary")}</span>
                ) : (
                  <>
                    <span className="add">+{f.additions}</span>
                    <span className="del">−{f.deletions}</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {diff?.truncated && (
        <div className="notice warn">
          <TriangleAlert size={16} />
          <span className="grow">{t("detail.truncated")}</span>
        </div>
      )}
      {diff && (
        <pre className="diff" aria-label={t("detail.diff")}>
          {lines.map((line, i) => (
            <div key={i} className={lineClass(line)}>
              {line || " "}
            </div>
          ))}
        </pre>
      )}
    </section>
  );
}
