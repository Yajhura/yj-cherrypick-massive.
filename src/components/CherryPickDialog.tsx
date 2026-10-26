import { useEffect, useMemo, useState } from "react";
import { Cherry, LoaderCircle } from "lucide-react";
import { api, Branch, Commit } from "../api";
import { Dialog } from "./Dialog";

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
  const targets = useMemo(
    () => [...branches.filter((b) => b.isRemote), ...branches.filter((b) => !b.isRemote)].filter((b) => b.name !== source),
    [branches, source],
  );
  const [target, setTarget] = useState(defaultTarget);
  const [branch, setBranch] = useState("");
  const [edited, setEdited] = useState(false);

  // Oldest first, the order the engine applies them in.
  const ordered = useMemo(() => [...commits].sort((a, b) => a.date.localeCompare(b.date)), [commits]);
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
    api.renderBranchName(template, target, tickets).then(setBranch).catch(() => setBranch(""));
  }, [open, edited, target, template, tickets]);

  const localTarget = target !== "" && !targets.find((b) => b.name === target)?.isRemote;

  return (
    <Dialog
      open={open}
      title={`Cherry-pick ${commits.length} commit${commits.length === 1 ? "" : "s"}`}
      description={`From ${source}. Runs in a separate worktree; your working copy is not touched.`}
      onClose={() => !busy && onCancel()}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onStart(target, branch.trim())} disabled={busy || !target || !branch.trim()}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Cherry size={16} />}
            {busy ? "Fetching and applying…" : "Start cherry-pick"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Onto branch</span>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
          {targets.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
              {b.isRemote ? "" : " (local)"}
            </option>
          ))}
        </select>
        {localTarget && <p className="hint">Local branches are not updated by fetch. Prefer the remote branch to start from the latest state.</p>}
      </label>
      <label className="field">
        <span>New branch to create and push</span>
        <input
          className="input mono"
          value={branch}
          disabled={busy}
          onChange={(e) => {
            setEdited(true);
            setBranch(e.target.value);
          }}
        />
        <p className="hint">From the template in Settings. Open the pull request yourself after the push.</p>
      </label>
      <div className="field">
        <span>Order of application (oldest first, with -x)</span>
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
            {alreadyThere} of these look already applied in the compared branch; they will be reported as “Already there” if nothing changes.
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
