import { FolderOpen, LoaderCircle } from "lucide-react";

interface Props {
  recents: string[];
  busy: boolean;
  error: string | null;
  onBrowse: () => void;
  onOpen: (path: string) => void;
}

export function StartScreen({ recents, busy, error, onBrowse, onOpen }: Props) {
  return (
    <main className="start">
      <div className="start-card">
        <div>
          <h1>Cherrypick Masive</h1>
          <p>Open a local repository to browse branch history, export it, or cherry-pick commits onto another branch.</p>
        </div>
        <div>
          <button className="btn primary" onClick={onBrowse} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <FolderOpen size={16} />}
            {busy ? "Opening and fetching…" : "Open repository…"}
          </button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        {recents.length > 0 && (
          <section className="recents" aria-label="Recent repositories">
            <h2>Recent</h2>
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
