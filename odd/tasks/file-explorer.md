# File explorer with blame and F1 file search
Objective: a Files tab to browse a branch's folders and files, see which commit last changed each line (git blame) and find any file with F1.
Branch: feat/cherry-pick-app · Delivery: ask-on-risk · Runners: `cargo test` (src-tauri), `npm test` + `npx tsc --noEmit`.

## Specs
- S1 "agregar un explorador de archivo es decir navegar entre carpetas ver archivos" / "Tab nuevo 'Archivos' (Recommended)": a fifth tab "Archivos" (Alt+5) with a folder tree on the left and the chosen file on the right (line numbers, syntax colours of the Code tab languages). Binary or too large files show a notice instead of their content.
- S2 "por defecto que sea develop y se pueda cambiar en una configuracion o en el tab" / "origin/develop (Recommended)": the tab reads the files of a branch through git (no checkout); it starts on the "Explorer default branch" setting, `origin/develop` by default (falling back to `origin/main` when missing); a branch picker in the tab changes it.
- S3 "ver que hizo ese cambio con git blame" / "Solo al pasar el mouse" / "Tarjeta + click fija (Recommended)": hovering a line shows a card with the commit that last changed it (hash, author, date, subject) and highlights the lines of the same commit; a click pins the card with "Ver commit" (opens it in the Code tab) and "Copiar hash".
- S4 "al darle f1 se abra el buscador para buscar el archivo" / "Desde cualquier tab (Recommended)": F1 from any tab opens a floating search over the paths of the explorer's branch, fuzzy, exact names first; arrows, Enter (opens the file in the Files tab) and Esc.
- S5 Extras "Copiar ruta, Buscar dentro del archivo, Historial del archivo": copy the relative path; Ctrl+F searches the open file with next/previous; "Historial del archivo" lists the commits that touched the file, a click opens the commit in Code.

## Tasks
- [x] T1 S1-S3,S5 backend: list_files, read_file, blame (porcelain), file_log, explorerBranch setting · inline · RED unresolved explorer module / missing field, GREEN cargo 77/77
- [x] T2 S3-S5 pure TS: fuzzy path search, blame card data, in-file search matches, start branch · inline · RED module missing / explorerStart missing, GREEN npm 40/40
- [x] T3 S1-S5 UI: Files tab, tree, viewer with hover/pinned blame, F1 palette, Ctrl+F, history panel, setting field · inline · tsc clean, E2E 25/25

## Log
- L1 2026-10-26 user request (verbatim): "Otra nueva feature es agregar un explorador de archivo es decir navegar entre carpetas ver archivos y ver que hizo ese cambio con git blame. y también al darle f1 se abra el buscador para buscar el archivo"
- L2 Grilling answers: version "por defecto que sea develop y se pueda cambiar en una configuracion o en el tab"; location "Tab nuevo 'Archivos' (Recommended)"; blame "Solo al pasar el mouse"; F1 "Desde cualquier tab (Recommended)"; develop "origin/develop (Recommended)"; hover "Tarjeta + click fija (Recommended)"; extras "Copiar ruta, Buscar dentro del archivo, Historial del archivo". User confirmed: "si".
- L3 E2E in the real app (scratch repo with develop/main, user's release app closed by the user, only the scratch entry added to and then removed from Recents): 25/25 across S1-S5: opens on origin/develop with 4 files, folders closed, blame card per line (Bruno/JIRA-2 on lines 3 and 5, Ana/JIRA-1 elsewhere), pinned card with Ver commit -> Code and Copiar hash, Ctrl+F counts and steps, file history newest first -> Code, F1 from History (fuzzy "xjs" -> x.js, Enter reveals docs/guide.md in the tree), picker to origin/main without checkout, Settings field. Rows are memoized so hover repaints only changed lines. Decision: Files is the fifth tab (Alt+5).
