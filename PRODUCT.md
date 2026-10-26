# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Desktop app built with Tauri 2 + React; the UI is a web view on Windows only.)

## Users

Developers on an internal team who know git well (hashes, branches, worktrees, conflicts). They use the app to backport or promote sets of commits from one branch to another, and to inspect and export a branch's history. Git terminology can be used without explanation.

## Product Purpose

Make mass cherry-picks (N commits onto one target branch) safe and fast: select commits with filters, apply them in chronological order in an isolated worktree, pause on conflicts for resolution in the user's IDE, and push the result as a new branch for a pull request. Secondary job: view a branch's history (commits, changed files, diff) and export the filtered view to XLSX, CSV, or Markdown. Success: a backport that used to be a manual, error-prone terminal session becomes a reviewed, repeatable flow that never touches the user's working copy.

## Positioning

Unlike general git GUIs, it treats a batch of cherry-picks as one resumable session: duplicate detection against the target (patch-id plus `cherry picked from` trailer), merge commits excluded, empty picks skipped and reported, and a persisted session that survives closing the app.

## Operating Context

- Runs on developer Windows machines next to their IDE (VS Code by default, configurable).
- Uses the system `git` CLI and the user's existing credentials; fetches automatically.
- Picks run in a temporary worktree; conflicts are resolved in the IDE and resumed from the app.
- Result branch is pushed; the developer opens the PR manually in their git host.

## Capabilities and Constraints

- Selection filters: checkbox list, ticket (configurable regex, default `[A-Z]+-\d+`), free text, author, date range, branch difference (commits in source missing from target).
- Always `cherry-pick -x`; chronological order; merge commits (2+ parents) excluded; squash commits are normal.
- Conflict actions: Continue, Skip, Abort; open worktree in editor.
- Branch name from an editable template (`{target}`, `{date}`, `{ticket}`).
- One active session at a time.
- Undecided: auto-update distribution details (GitHub repo and signing key not provided yet).

## Brand Commitments

No corporate brand. Neutral product name "Cherrypick Masive". No logo assets.

## Evidence on Hand

None. No screenshots, testimonials, or usage data exist; do not fabricate any.

## Product Principles

1. Never touch the user's working copy or lose their work.
2. Show the true state of every commit (applied, empty, skipped, conflict) — no optimistic summaries.
3. Git stays the source of truth; the app orchestrates, it does not reinvent merge tooling.
4. Fast for experts: dense information, keyboard-first, few confirmations except for destructive actions.

## Accessibility & Inclusion

Fully operable by keyboard; text and UI contrast at WCAG AA.
