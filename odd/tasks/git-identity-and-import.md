# Git identity per repo and import hashes from a txt
Objective: set the repo's git user (name, email) from the app, and import a txt of hashes into the Cherry-pick basket. Last features before the first release (v1).
Branch: feat/cherry-pick-app · Delivery: ask-on-risk · Runners: `cargo test` (src-tauri), `npm test` + `npx tsc --noEmit`.

## Specs
- S1 "configurar el usuario de git es decir correo y nombre" / "Por repositorio (Recommended)": Settings shows the git user of the open repo (name, email and where it comes from: this repo, global or none) and saves name and email with `git config --local`. Name and email are required; the email must contain "@". Assumption: the section lives in the Settings dialog.
- S2 "algo que se olvido es el tema de importar hashesh": an "Importar txt" button next to "Agregar por hash" opens a txt and adds its commits like a paste (text after # ignored; unknown, merges and repeats reported). Assumption: placed next to "Agregar por hash".
- S3 "al importar debe reordenar si hay commits en el cherrypick masive": imported commits merge with the ones already in the basket, which stays in chronological order (oldest first).

## Tasks
- [ ] T1 S1-S2 backend: git_identity / set_git_identity, import_hashes(path) · inline
- [ ] T2 S1-S3 UI: Settings section, Import txt button, merge order test · inline

## Log
- L1 2026-10-26 user request (verbatim): "Ahora antes de pushear la primera y crear un realese con el ejecutable dela primera v1, debemos crear dos feat uno es configurar el usuario de git es decir correo y nombre, y tambien algo que se olvido es el tema de importar hashesh"
- L2 Answers: scope "Por repositorio (Recommended)"; import "Aca una aclaracion al importar debe reordenar si hay commits en el cherrypick masive". The basket table already orders by date (orderByDate); placement and Settings location were defaulted and told to the user.
