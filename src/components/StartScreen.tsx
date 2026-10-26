import { FolderOpen, LoaderCircle } from "lucide-react";
import { useI18n } from "../i18n";

interface Props {
  recents: string[];
  busy: boolean;
  error: string | null;
  onBrowse: () => void;
  onOpen: (path: string) => void;
}

export function StartScreen({ recents, busy, error, onBrowse, onOpen }: Props) {
  const { t } = useI18n();
  return (
    <main className="start">
      <div className="start-card">
        <div>
          <h1>Cherrypick Masive</h1>
          <p>{t("start.intro")}</p>
        </div>
        <div>
          <button className="btn primary" onClick={onBrowse} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <FolderOpen size={16} />}
            {busy ? t("start.opening") : t("start.open")}
          </button>
        </div>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {recents.length > 0 && (
          <section className="recents" aria-label={t("start.recentLabel")}>
            <h2>{t("start.recent")}</h2>
            {recents.map((path) => (
              <button key={path} onClick={() => onOpen(path)} disabled={busy}>
                <b>{path.split(/[\\/]/).filter(Boolean).pop()}</b>
                <small>{path}</small>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
