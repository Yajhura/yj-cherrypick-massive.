# Feature: cherry-pick-app

Objective: Windows desktop app (Tauri 2 + React) for mass cherry-pick (N commits -> 1 branch) and branch history view/export.
Branch: `feat/cherry-pick-app` · Delivery: ask-on-risk · Test runner: `cargo test` (src-tauri), `npm run build` (type-check UI).

## Specs

- S1 Stack: Tauri + React, Windows only, internal team. Git through the system `git` CLI.
- S2 Repo: open a local folder + remember recent repos. Automatic `git fetch` on open and before running a cherry-pick.
- S3 Commit selection: "Checkbox en lista, Filtro por texto/ticket, Diferencia entre ramas, Filtro por autor/fecha, Por rango de fecha tambein". Ticket filter is a configurable regex, default `[A-Z]+-\d+`.
- S4 Duplicates: detect commits already in target via patch-id (`git cherry`) + `-x` trailer `(cherry picked from commit ...)`.
- S5 Merge commits (2+ parents) excluded by default (shown disabled with a "merge" badge). Squash commits are normal commits.
- S6 Execution: chronological order (oldest first), always `cherry-pick -x`, in a temporary git worktree; user working copy untouched.
- S7 Conflicts: pause, show conflicted files, button to open worktree in IDE, actions Continue / Skip / Abort.
- S8 Empty cherry-pick (change already in target): skip and report in final summary.
- S9 Paused session persisted on disk; on reopen offer Continue or Abort-and-clean.
- S10 Result: create new branch from editable name template (default `cherry-pick/{target}/{date}`, `{ticket}` supported) and push it. User opens the PR manually.
- S11 History view: hash, author, date, message; changed files (`--stat`); full diff of the selected commit. Reuses the selection filters.
- S12 Export what is filtered on screen to Excel (.xlsx), CSV, Markdown.
- S13 Distribution: installer + auto-update via GitHub Releases. (Needs repo URL + signing key from user — deferred.)

## Tasks

- [ ] T1 S1,S2 — git CLI runner, repo open/recents, fetch, branch list · route: inline
- [ ] T2 S3,S4,S5,S11 — commit log parsing + filters + duplicate/merge detection, stat & diff · route: inline
- [ ] T3 S6-S10 — cherry-pick engine: worktree, session state machine, persistence, push · route: inline
- [ ] T4 S12 — export CSV/MD/XLSX · route: inline
- [ ] T5 S2,S3,S7,S9-S12 — React UI (repo picker, filters, commit table, run panel, history, export) · route: inline
- [ ] T6 S13 — updater/installer config · route: inline · blocked on user input (GitHub repo, signing key)

## Log

- L1 (2026-10-25) User request: "quiero armar una aplicacion desktop donde pueda hacer cherrypick masivo tambien tenga una opcion donde pueda ver el historial de una rama y exportar."
- L2 (2026-10-25) Grilling session settled S1-S13 (see memory `cherrypick-app-design`). User confirmed: "Sí, está completo".
- L3 (2026-10-25) User: "arranca". Scaffolded with create-tauri-app 4.8.0 (react-ts, npm, Tauri 2).
