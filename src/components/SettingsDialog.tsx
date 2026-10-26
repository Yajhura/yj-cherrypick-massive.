import { useEffect, useState } from "react";
import { Settings } from "../api";
import { Dialog } from "./Dialog";

interface Props {
  open: boolean;
  settings: Settings;
  error: string | null;
  onCancel: () => void;
  onSave: (settings: Settings) => void;
}

export function SettingsDialog({ open, settings, error, onCancel, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog
      open={open}
      title="Settings"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSave(draft)}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Ticket pattern (regular expression)</span>
        <input className="input mono" value={draft.ticketPattern} onChange={(e) => set({ ticketPattern: e.target.value })} />
        <p className="hint">Extracts ticket ids from commit messages for the Ticket filter and exports. Default: [A-Z]+-\d+</p>
      </label>
      <label className="field">
        <span>Branch name template</span>
        <input className="input mono" value={draft.branchTemplate} onChange={(e) => set({ branchTemplate: e.target.value })} />
        <p className="hint">Placeholders: {"{target}"} (without origin/), {"{date}"} (YYYYMMDD), {"{ticket}"} (first ticket of the selection).</p>
      </label>
      <label className="field">
        <span>Editor command</span>
        <input className="input mono" value={draft.editorCommand} onChange={(e) => set({ editorCommand: e.target.value })} />
        <p className="hint">Program used by “Open in editor”, found in PATH. Example: code, cursor, idea64.</p>
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
