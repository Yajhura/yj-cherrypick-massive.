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

- [x] T1 S1,S2 — git CLI runner, repo open/recents, fetch, branch list · route: inline · cb852a9, fix e7ffc87
- [x] T2 S3,S4,S5,S11 — commit log parsing + filters + duplicate/merge detection, stat & diff · route: inline · cb852a9
- [x] T3 S6-S10 — cherry-pick engine: worktree, session state machine, persistence, push · route: inline · f559675, fix 02f29e2 · Risk: item 1 → independent verifier + native review (approved)
- [x] T4 S12 — export CSV/MD/XLSX · route: inline · cb852a9
- [x] T5 S2,S3,S7,S9-S12 — React UI (repo picker, filters, commit table, run panel, history, export) · route: inline · 2847ae2..9362375 · finish review ship, DESIGN.md written, real-app E2E passed, native review approved
- [ ] T6 S13 — updater/installer config · route: inline · blocked on user input (GitHub repo, signing key)

## Log

- L1 (2026-10-25) User request: "quiero armar una aplicacion desktop donde pueda hacer cherrypick masivo tambien tenga una opcion donde pueda ver el historial de una rama y exportar."
- L2 (2026-10-25) Grilling session settled S1-S13 (see memory `cherrypick-app-design`). User confirmed: "Sí, está completo".
- L3 (2026-10-25) User: "arranca". Scaffolded with create-tauri-app 4.8.0 (react-ts, npm, Tauri 2).
- L4 Backend core cb852a9: 13 integration tests (real git repos in temp dirs). Native review (risk+reliability) found R1 critical: `open_in_editor` used `cmd /C <editor> <path>` → command injection with `&` in paths without spaces. Fixed in e7ffc87 (resolve editor in PATH, spawn directly); RED reproduced against `cmd /C`, GREEN after. Re-review approved and acknowledged (boundary e7ffc87).
- L5 Engine f559675: 9 tests (order, -x, empty, conflict/continue/skip/abort, persistence, push failure/retry, merge/branch/concurrency guards). Mutation check: removing chronological sort fails the order test.
- L6 Independent verifier: blockers B1 (`--topo-order` not chronological across merged history) and B2 (pick finished in the IDE → Continue fails, Skip mislabels). Fixed in 02f29e2 with `--author-date-order` and a persisted `pick_base`; also A1 short hashes, A2 corrupt session dismissable, A3 resume Running session, A6 remote branch clash checked at start. 8 RED tests → GREEN; verifier recheck confirmed B1/B2 fixed. Open advisories: A4 binary conflicts accepted without markers, A5 marker check false positives, A7 prefer `origin/x` targets in UI.
- L7 Native review of engine range (risk, resilience, reliability) approved and acknowledged. PRODUCT.md written (impeccable init). UI answers: used several times per week; "Historial primero"; avoid unclear state, generic dashboard look, poor long-session legibility.
- L8 User chose the category standard (canon), quality bar GitHub Desktop + Fork. Surface brief at .impeccable/surfaces/src-app-tsx.md. UI written (toolbar, branch sidebar, filters, keyboard listbox, detail+diff, session panel, dialogs); `npm run build` passes. Pending: run `npm run tauri dev` smoke test, screenshots, impeccable finish review, DESIGN.md, T6 updater.
- L9 UI inspected in 2 screenshot rounds (production build in headless Edge with mocked IPC + synthetic data): fixed duplicate ticket badges, truncated dates, wrapping filter row, collapsed subject at 1100px (42c9a2f). Detector clean on src/. RDD assess 5e11890..HEAD: medium, under_budget (review pending in slice). Finish review running.
- L10 Finish review: fix → 7 fixes (session state visible in history, AA checkboxes, date fields, disabled primary, diff fill, stale branch-name guard, mono face recorded) → 2 regressions fixed → user funded a 3rd round (date-only cells at 1100px in sessions) → ship. DESIGN.md + .impeccable/design.json written by the documenter; code aligned to its scales.
- L11 Real-app E2E over WebView2 DevTools (no mocks, real git): open repo → select PAY-1..3 → dialog names cherry-pick/release/1.0/<date> → conflict on a.txt → Continue refused with markers → resolve → applied. Found bug: push from the worktree broke relative remote URLs → fixed by pushing from the main repo (fd64e06, RED→GREEN test). Persisted session reopened as "Push failed" → Retry push → remote has 3 commits in order, resolved content, -x trailer. One unexplained app exit on the very first run (exit 0) did not reproduce, including with a forced push failure.
- L12 Native review 5e11890..9362375 (risk, reliability, readability) approved and acknowledged. Non-blocking advisories for later: R2-failed-shown-as-conflict (SessionPanel.tsx:31), R3-branch-name-churn and R3-preview-order (CherryPickDialog.tsx:29), R3-stale-detail and R3-stale-list (hooks.ts), R3-ui-untested, plus 5 suggestions.
- Next: T6 (needs GitHub repo URL + updater signing key); optional follow-ups above; engine advisories A4/A5.
