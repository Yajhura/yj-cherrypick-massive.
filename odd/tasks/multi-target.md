# Multi-target cherry-pick queue
Objective: pick the commits once and apply them to several target branches, one target after another, each with its own branch and push. Module 2 of the 2026-10-26 plan.
Branch: feat/cherry-pick-app · Delivery: ask-on-risk · Runners: `cargo test` (src-tauri), `npm test` + `npx tsc --noEmit`.

## Specs
- S1 "El mismo fix a varias ramas" / "En cola, un destino por vez (Recommended)": in the Cherry-pick tab the user marks several targets; each target runs as its own session (own worktree, branch from the template, push), in order, one at a time.
- S2 A conflict pauses only the current target; once resolved (or skipped) the queue continues with the next target.
- S3 "Sigue con los demás (Recommended)": aborting a target marks it "Aborted" in the summary and the queue continues with the remaining targets.
- S4 At the end, a summary per target: target, branch, result (pushed, nothing to push, push failed, aborted). (The "Create PR" button per target is module 3.)
- S5 Each target's branch name comes from the template and is editable per target before starting; all names are validated before the first target runs.
- S6 Assumption: the queue is persisted, so closing the app mid-queue resumes it; a push failure waits for Retry or Abort like today.
- S7 Assumption: "Already in target" marks show which of the chosen targets already contain each commit.

## Tasks
- [x] T1 S1-S6 backend: QueueStore (queue.json), start_queue (validate all names, start first), advance_queue (record outcome, start next), current_queue, dismiss_queue · inline · 09848c5 (RED compile failure, GREEN 6/6, suite 61/61)
- [x] T2 S1-S5,S7 UI: multi-target picker with per-target branch names, queue strip and summary, auto-advance · inline · UI commit (RED helpers in basket.test.ts)

## Log
- L1 2026-10-26 user answers (verbatim): pain "El mismo fix a varias ramas, Abrir el PR a mano"; multi-target "En cola, un destino por vez (Recommended)"; abort one "Sigue con los demás (Recommended)"; order "Multi-destino → PR → auto-update (Recommended)", later the code viewer was put first. User: "continua" after the code viewer.
- L2 Evidence: cargo test 61/61, npm test 30/30, tsc clean. Real app E2E (scratch repo, user settings backed up and restored, test queue/session files and one orphan worktree from a failed run removed): 12/12 PASS. Run 1 release/1 (conflict resolved) + release/2: both pushed with both commits, strip "Te necesita / En espera", badge "1/2 · 0/2". Run 2 release/3 (commit skipped) + main: "Nada para pushear" then "Push hecho". An existing branch name is rejected before anything runs. The E2E found that typing "origin/release/1" in the branch picker matched nothing; fixed in a separate commit (search ranks the full name too).
- L3 Not covered by E2E: Abort inside a queue (the native confirm dialog cannot be driven over CDP); covered by queue_test aborting_a_target_records_it_and_the_rest_still_run. Resuming a queue after closing the app between targets is implemented (Continue with the next target) but not exercised end to end.
