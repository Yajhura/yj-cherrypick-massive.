# Code viewer tab
Objective: a "Code" tab to browse the files of a commit and read its changes comfortably. First module of the 2026-10-26 improvement plan (then multi-target, Azure DevOps PR, auto-update, tech debt).
Branch: feat/cherry-pick-app · Delivery: ask-on-risk · Runners: `cargo test` (src-tauri), `npm test` + `npx tsc --noEmit`.

## Specs
- S1 "mejorar el mostrar codigo al elegir el commit seria un boton donde me lleve a un nuevo tab y navegar por archivos y visualizar mejor el codigo modificado". A "Code" tab opened by a button in the commit detail or Enter in the history list; it shows that commit and replaces it when another one is opened. J/K or arrows move to the previous/next commit of the history list.
- S2 Folder tree on the left with the commit's files, collapsible folders, +/- counts per file and a name filter.
- S3 Side-by-side diff by default with a toggle to unified; the choice is remembered.
- S4 Changed blocks with buttons to expand context above and below, up to the whole file.
- S5 Syntax highlighting for C#, TypeScript/JavaScript, JSON, XML/csproj, SQL, YAML, CSS and HTML, light and dark themes.
- S6 Word-level highlight inside changed lines; "ignore whitespace" toggle (git diff -w).
- S7 "Un boton en la cual de arriba y abajo donde navega en cada cambio": ↑/↓ buttons (F7/Shift+F7, Alt+↑/↓) go through every change of the commit, crossing to the next file; shows "Change 3 of 12".
- S8 Per file: open in VS Code (local repo), copy path, view the full file as it is in that commit.

## Tasks
- [x] T1 S2,S4,S6,S8 backend: commit_files (status, renames, counts), file_diff (per file, -w), file_versions (old/new content, binary, size limit) · inline · bd6ea6f (RED compile failure, GREEN 7/7; commit_patch test written with its code, no separate RED)
- [x] T2 S3,S4,S6,S7 pure TS: parse diff, side-by-side pairing, word diff, gaps/expansion, change list, highlighted line segments + tests · inline · e3a1c58 (RED module missing, GREEN 10/10)
- [x] T3 S1,S2,S3,S5,S7,S8 UI: Code tab, tree, diff view, toolbar, keyboard, highlight.js · inline · UI commit

## Log
- L1 2026-10-26 user request (verbatim): "otra feature mas seria el tema, de mejorar el mostrar codigo al elegir el commit seria un boton  donde me lleve a un nuevo tab y navegar por archivos y visualizar mejor el codigo modificado"
- L2 Grilling: side-by-side + unified (Recommended); folder tree; changes + expand context; one "Code" tab that shows the chosen commit; syntax highlighting for the team's languages; extras: copy path / full version, open in VS Code, ignore whitespace, word highlight, "Un boton en la cual de arriba y abajo donde navega en cada cambio"; ↓ jumps to the next file; build it first. User: "si".
- L3 Evidence: cargo test 55/55, npm test 26/26, tsc clean, vite build (+87 KB for highlight.js core and 8 languages). Real app E2E over WebView2 CDP with a scratch repo (user settings backed up, verified unchanged, restored): 26/26 checks PASS for S1-S8 (detail button, Enter and J/K, compact tree and filter, split default, C# highlighting, word changes 1->2 and old->new, two gaps and +20 expansion, 6 change stops walked with F7 across 5 files and back with Alt+Up, ignore whitespace, unified remembered, full file 129 lines, editor args, copy path toast). E2E found that with -w git drops whitespace-only files from the patch and the view stayed blank; fixed by treating a file missing from a complete patch as having no hunks.
