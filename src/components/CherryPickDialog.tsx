import { useEffect, useMemo, useState } from "react";
import { Cherry, LoaderCircle } from "lucide-react";
import { api, Branch, Commit } from "../api";
import { Dialog } from "./Dialog";
import { useI18n } from "../i18n";

interface Props {
  open: boolean;
  commits: Commit[];
  branches: Branch[];
  source: string;
  defaultTarget: string;
  template: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onStart: (target: string, branch: string) => void;
}

export function CherryPickDialog({ open, commits, branches, source, defaultTarget, template, busy, error, onCancel, onStart }: Props) {
  const { t } = useI18n();
  const targets = useMemo(
    () => [...branches.filter((b) => b.isRemote), ...branches.filter((b) => !b.isRemote)].filter((b) => b.name !== source),
    [branches, source],
  );
  const [target, setTarget] = useState(defaultTarget);
  const [branch, setBranch] = useState("");
  const [edited, setEdited] = useState(false);

  // Oldest author date first, like the engine. Compare instants, not ISO strings, so
  // commits written in different time zones still order correctly.
  const ordered = useMemo(() => [...commits].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [commits]);
  const alreadyThere = commits.filter((c) => c.alreadyInTarget).length;
  const tickets = useMemo(() => [...new Set(ordered.flatMap((c) => c.tickets))], [ordered]);

  useEffect(() => {
    if (open) {
      setTarget(defaultTarget || targets[0]?.name || "");
      setEdited(false);
    }
  }, [open, defaultTarget, targets]);

  useEffect(() => {
    if (!open || edited || !target) return;
    // Drop late answers so the name pushed always matches the target on screen.
    let stale = false;
    setBranch("");
    api
      .renderBranchName(template, target, tickets)
      .then((name) => !stale && setBranch(name))
      .catch(() => !stale && setBranch(""));
    return () => {
      stale = true;
    };
  }, [open, edited, target, template, tickets]);

  const localTarget = target !== "" && !targets.find((b) => b.name === target)?.isRemote;

  return (
    <Dialog
      open={open}
      title={commits.length === 1 ? t("dialog.title1") : t("dialog.titleN", { count: commits.length })}
      description={t("dialog.description", { source })}
      onClose={() => !busy && onCancel()}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" onClick={() => onStart(target, branch.trim())} disabled={busy || !target || !branch.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Cherry size={16} />}
            {busy ? t("dialog.starting") : t("dialog.start")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t("dialog.onto")}</span>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
          {targets.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.isRemote ? "" : ` ${t("dialog.local")}`}
            </option>
          ))}
        </select>
        {localTarget && <p className="hint">{t("dialog.localHint")}</p>}
      </label>
      <label className="field">
        <span>{t("dialog.newBranch")}</span>
        <input
          className="input mono"
          value={branch}
          disabled={busy}
          onChange={(e) => {
            setEdited(true);
            setBranch(e.target.value);
          }}
        />
        <p className="hint">{t("dialog.newBranchHint")}</p>
      </label>
      <div className="field">
        <span>{t("dialog.order")}</span>
        <div className="preview">
          {ordered.map((c, i) => (
            <div key={c.hash}>
              <span className="mono muted">{i + 1}</span>
              <span className="mono">{c.shortHash}</span>
              <span title={c.subject}>{c.subject}</span>
            </div>
          ))}
        </div>
        {alreadyThere > 0 && (
          <p className="hint">
            {t("dialog.alreadyThere", { count: alreadyThere })}
          </p>
        )}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
