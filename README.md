# Cherrypick Massive

A Windows desktop app for mass cherry-picks. Pick N commits by ticket, author, text or date, apply them to one or several target branches in an isolated worktree, resolve conflicts in your IDE, and push a new branch ready for a pull request. Your working copy is never touched.

It also browses a branch's history, files and blame, and exports commit lists to XLSX, CSV, Markdown or TXT.

Built with Tauri 2 (Rust) and React. It drives the `git` CLI you already have, with your credentials.

## Quick start

1. Install [Git for Windows](https://git-scm.com/download/win) and make sure `git` is on your `PATH`.
2. Build the installer (see [Development](#development)) and run `cherrypick-masive_<version>_x64-setup.exe`.
3. Open a local repository. The app fetches it and lists the history of `origin/develop` for today.
4. Select commits, press **Load N into Cherry-pick**, choose the target branch and press **Start cherry-pick**.

The app pushes the new branch when every commit is applied. You then open the pull request in your git host.

## What each tab does

| Tab | Shortcut | Use it to |
|-----|----------|-----------|
| History | Alt+1 | Filter a branch's commits (text, ticket, author, dates, "missing from" a target), select them, view stat and diff, export the view. |
| Cherry-pick | Alt+2 | Apply the selected commits to one or more targets, follow progress, resolve conflicts, see the summary. |
| Code | Alt+3 | Read a commit file by file: folder tree, side by side or unified diff, word-level changes, change navigator. |
| Branches | Alt+4 | Compare 2 to 4 branches side by side, each with its own filters and selection. |
| Files | Alt+5 | Browse any branch's folders and files without checkout, see who changed each line (blame on hover), file history, find in file. |

Press **F1** in any tab to search a file by name or path.

## How a cherry-pick runs

| Step | Behaviour |
|------|-----------|
| Order | Commits are applied oldest first, by author date. |
| Isolation | Each target runs in a temporary `git worktree`; your checkout and uncommitted work stay as they are. |
| Traceability | Always `git cherry-pick -x`, so each commit records its origin. |
| Merges | Merge commits are shown but cannot be selected. |
| Already there | Commits whose change exists in the target (patch-id or `-x` trailer) are flagged and can be removed in one click. Empty picks are skipped and reported. |
| Conflicts | The run pauses and lists the files. Open them in your editor, resolve, then **Continue**, **Skip** or **Abort**. Continue stays disabled while conflict markers remain. |
| Several targets | Targets run one after another. A conflict pauses only its target; aborting one moves on to the next. |
| Result branch | Named from a template (`cherry-pick/{target}/{date}-{time}` by default). If the branch already exists, the app warns you and adds the commits on top, pushing without force. |
| Restart safety | The session and the queue are saved; closing the app mid-run resumes it on the next start. |

## Selecting commits

| Action | Result |
|--------|--------|
| Click | Shows the commit's detail. The selection does not change. |
| Ctrl+click or double click | Toggles one commit. |
| Shift+click | Selects the range from the last toggled commit. |
| Space / Ctrl+A / Esc | Toggle the active commit / select all / clear. |
| Row `<>` button or Enter | Opens the commit in the Code tab. |
| **Export txt** | Saves the selection as `<hash>  # subject (author)`, one per line. |
| **Add by hash** | Pastes hashes (a teammate's txt works as is; text after `#` is ignored). |
| **Import txt** | Adds the commits of a txt file; they merge with the list, which stays oldest first. |

## Settings

| Setting | Default | Notes |
|---------|---------|-------|
| Ticket pattern | `[A-Z]+-\d+` | Regex used to detect tickets in commit messages. |
| Branch name template | `cherry-pick/{target}/{date}-{time}` | Placeholders: `{target}`, `{date}` (YYYYMMDD), `{time}` (HHmm), `{ticket}`. |
| Explorer default branch | `origin/develop` | Branch the Files tab opens on; falls back to `origin/main`. |
| Editor command | `code` | Used to open conflicts and worktrees. |
| Language | Auto | English or Spanish. |
| Git user of this repository | Your current git user | Name and email saved with `git config --local`; they sign the commits the cherry-pick creates. Shows whether the current one comes from the repo, global or nowhere. |

Settings, the saved session and temporary worktrees live in `%APPDATA%\com.internal.cherrypickmasive`.

## Development

Prerequisites: Windows 10/11, Node.js 22.18+ (the tests use its built-in TypeScript support), Rust stable (MSVC toolchain), Git.

```bash
npm install
npm run tauri dev      # run the app with hot reload
npm run tauri build    # installer in src-tauri/target/release/bundle/nsis/
```

Tests:

```bash
npm test                      # frontend logic (node --test)
npx tsc --noEmit              # type check
cd src-tauri && cargo test    # backend, against real temporary git repositories
```

| Folder | Contents |
|--------|----------|
| `src/` | React UI; pure, tested logic in `*.ts` next to its `*.test.ts`. |
| `src/components/` | Tabs and widgets. |
| `src-tauri/src/` | Git wrapper, cherry-pick engine, queue, history, explorer, export, settings. |
| `src-tauri/tests/` | Integration tests that build scratch repos with a local remote. |
| `odd/tasks/` | Feature specs and their implementation log. |
| `DESIGN.md`, `PRODUCT.md` | Design system and product context. |

## Not done yet

- Creating the pull request from the app (Azure DevOps through `az`).
- Auto-update and signed releases.
- Cleaning up worktrees left behind by an interrupted run.

Windows only for now.
