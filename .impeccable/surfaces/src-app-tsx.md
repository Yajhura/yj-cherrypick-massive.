---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

Scope: main app window (`src/App.tsx` and its components). Mode: Operate.
Audience/job: developers who know git, several times a week, backporting commit sets and reading/exporting branch history. History is the first screen; cherry-pick launches from the history selection.
Constraints: keyboard-operable, WCAG AA contrast, long-session legibility, state of every commit readable at a glance, must not look like a generic dashboard.

## Direction contract

THESIS: A three-pane git client at GitHub Desktop / Fork craft, where the history list is the work surface and a cherry-pick is a visible, resumable session rather than a fire-and-forget toolbar action. Refuses dashboard cards, metric tiles and decoration.

OWN-WORLD: Neutral light panes (#f6f7f9 ground, white panes, #d0d7de hairlines), ink #1f2328, one blue (#0969da/#2f6feb) for selection and primary action; state colours only where they mean something (green applied, grey empty, amber skipped, red conflict) always paired with a word. System UI type (Segoe UI); Cascadia Mono (ships with Windows 11 and Windows Terminal, steadier at 12px than Consolas, which stays the fallback) for hashes, dates, counts and diffs in tabular columns. Dark scheme mirrors the same roles.

STORY: Open a repo, land on the branch history, filter by ticket/author/date or "missing from <target>", tick commits, press Cherry-pick, confirm target and branch name, watch each commit resolve; on conflict open VS Code, then Continue/Skip/Abort; finish with a pushed branch. Export whatever the list shows.

FIRST VIEWPORT: Top toolbar: repo, Open, Fetch, Export, changes-panel toggle, settings. Tab bar: History and Cherry-pick (count or progress badge, red while a run needs the user). History: searchable branch picker and primary "Load N into Cherry-pick" above the filter bar, the commit table (checkbox with Shift+click ranges, subject with ticket and badges, author, hash, date) and, on the right, the focused commit detail (files with +/- and diff). Cherry-pick: target picker, branch name and Start over the table of commits to apply; during a run, a progress bar, the conflict banner with live resolution state, and the table with per-commit status.

FORM: Category standard (canon), chosen by the user over the roll; quality bar GitHub Desktop and Fork. seed:a8f16d78efd24772

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
