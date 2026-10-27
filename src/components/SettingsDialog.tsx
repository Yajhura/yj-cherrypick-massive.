import { useEffect, useState } from "react";
import { api, GitIdentity, Settings } from "../api";
import { Dialog } from "./Dialog";
import { languageNames, useI18n } from "../i18n";

interface Props {
  open: boolean;
  settings: Settings;
  /** The open repository, whose git user can be set; null on the start screen. */
  repoRoot: string | null;
  error: string | null;
  onCancel: () => void;
  /** `identity` is set only when the user changed the repository's git user. */
  onSave: (settings: Settings, identity: { name: string; email: string } | null) => void;
}

const SCOPE_HINT = { local: "settings.gitScopeLocal", global: "settings.gitScopeGlobal", system: "settings.gitScopeSystem", none: "settings.gitScopeNone" } as const;

export function SettingsDialog({ open, settings, repoRoot, error, onCancel, onSave }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(settings);
  const [identity, setIdentity] = useState<GitIdentity | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  // The repository's current git user, read each time the dialog opens.
  useEffect(() => {
    if (!open || !repoRoot) return setIdentity(null);
    let stale = false;
    api
      .gitIdentity(repoRoot)
      .then((id) => {
        if (stale) return;
        setIdentity(id);
        setName(id.name);
        setEmail(id.email);
      })
      .catch(() => !stale && setIdentity(null));
    return () => {
      stale = true;
    };
  }, [open, repoRoot]);

  const identityChanged = identity !== null && (name.trim() !== identity.name || email.trim() !== identity.email);

  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog
      open={open}
      title={t("settings.title")}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" onClick={() => onSave(draft, identityChanged ? { name, email } : null)}>
            {t("common.save")}
          </button>
        </>
      }
    >
      {identity && (
        <fieldset className="field git-user">
          <legend>{t("settings.gitUser")}</legend>
          <div className="git-user-fields">
            <label className="field">
              <span>{t("settings.gitName")}</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="field">
              <span>{t("settings.gitEmail")}</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
          </div>
          <p className={`hint${identity.scope === "none" ? " warn-text" : ""}`}>{t(SCOPE_HINT[identity.scope])}</p>
        </fieldset>
      )}
      <label className="field">
        <span>{t("settings.language")}</span>
        <select className="input" value={draft.language} onChange={(e) => set({ language: e.target.value })}>
          <option value="auto">{t("settings.langAuto")}</option>
          <option value="en">{languageNames.en}</option>
          <option value="es">{languageNames.es}</option>
        </select>
      </label>
      <label className="field">
        <span>{t("settings.ticket")}</span>
        <input className="input mono" value={draft.ticketPattern} onChange={(e) => set({ ticketPattern: e.target.value })} />
        <p className="hint">{t("settings.ticketHint")}</p>
      </label>
      <label className="field">
        <span>{t("settings.template")}</span>
        <input className="input mono" value={draft.branchTemplate} onChange={(e) => set({ branchTemplate: e.target.value })} />
        <p className="hint">{t("settings.templateHint", { target: "{target}", date: "{date}", time: "{time}", ticket: "{ticket}" })}</p>
      </label>
      <label className="field">
        <span>{t("settings.explorerBranch")}</span>
        <input className="input mono" value={draft.explorerBranch} onChange={(e) => set({ explorerBranch: e.target.value })} />
        <p className="hint">{t("settings.explorerBranchHint")}</p>
      </label>
      <label className="field">
        <span>{t("settings.editor")}</span>
        <input className="input mono" value={draft.editorCommand} onChange={(e) => set({ editorCommand: e.target.value })} />
        <p className="hint">{t("settings.editorHint")}</p>
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
