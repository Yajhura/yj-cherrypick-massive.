import { useEffect, useState } from "react";
import { Settings } from "../api";
import { Dialog } from "./Dialog";
import { languageNames, useI18n } from "../i18n";

interface Props {
  open: boolean;
  settings: Settings;
  error: string | null;
  onCancel: () => void;
  onSave: (settings: Settings) => void;
}

export function SettingsDialog({ open, settings, error, onCancel, onSave }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(settings);
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

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
          <button className="btn primary" onClick={() => onSave(draft)}>
            {t("common.save")}
          </button>
        </>
      }
    >
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
        <p className="hint">{t("settings.templateHint", { target: "{target}", date: "{date}", ticket: "{ticket}" })}</p>
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
