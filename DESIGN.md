---
name: Cherrypick Masive
description: A three-pane Windows git client where a batch cherry-pick is a visible, resumable session.
colors:
  ground: "#f6f7f9"
  pane: "#ffffff"
  pane-sunken: "#f6f8fa"
  hairline: "#d0d7de"
  hairline-soft: "#eaeef2"
  ink: "#1f2328"
  ink-muted: "#59636e"
  selection-blue: "#0969da"
  selection-blue-strong: "#0a5bc4"
  selection-blue-soft: "#ddf4ff"
  on-accent: "#ffffff"
  applied-green: "#1a7f37"
  applied-green-soft: "#dafbe1"
  skipped-amber: "#9a6700"
  skipped-amber-soft: "#fff8c5"
  conflict-red: "#cf222e"
  conflict-red-soft: "#ffebe9"
  neutral-soft: "#eaeef2"
  diff-add-bg: "#e6ffec"
  diff-del-bg: "#ffebe9"
  diff-hunk: "#0550ae"
  scrim: "rgba(13, 17, 23, 0.45)"
typography:
  headline:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.45
  meta:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  badge:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "18px"
  mono:
    fontFamily: "Cascadia Mono, Consolas, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "\"tnum\""
rounded:
  tick: "3px"
  item: "4px"
  control: "6px"
  popover: "8px"
  pill: "11px"
  dialog: "12px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "30px"
  button-hover:
    backgroundColor: "{colors.pane-sunken}"
  button-primary:
    backgroundColor: "{colors.selection-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "30px"
  button-primary-hover:
    backgroundColor: "{colors.selection-blue-strong}"
  button-primary-disabled:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.ink-muted}"
  button-ghost-hover:
    backgroundColor: "{colors.neutral-soft}"
  button-danger:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.conflict-red}"
    rounded: "{rounded.control}"
    height: "30px"
  button-danger-hover:
    backgroundColor: "{colors.conflict-red-soft}"
  input:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "30px"
  commit-row:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    padding: "0 12px"
    height: "34px"
  commit-row-hover:
    backgroundColor: "{colors.pane-sunken}"
  commit-row-selected:
    backgroundColor: "{colors.selection-blue-soft}"
  branch-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "5px 8px"
  branch-item-current:
    backgroundColor: "{colors.selection-blue-soft}"
    textColor: "{colors.selection-blue}"
  badge-ticket:
    backgroundColor: "{colors.selection-blue-soft}"
    textColor: "{colors.selection-blue}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "0 6px"
  status-applied:
    backgroundColor: "{colors.applied-green-soft}"
    textColor: "{colors.applied-green}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  status-skipped:
    backgroundColor: "{colors.skipped-amber-soft}"
    textColor: "{colors.skipped-amber}"
    rounded: "{rounded.pill}"
    height: "22px"
  status-conflict:
    backgroundColor: "{colors.conflict-red-soft}"
    textColor: "{colors.conflict-red}"
    rounded: "{rounded.pill}"
    height: "22px"
  status-already-there:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    height: "22px"
  status-applying:
    backgroundColor: "{colors.selection-blue-soft}"
    textColor: "{colors.selection-blue}"
    rounded: "{rounded.pill}"
    height: "22px"
  dialog:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.dialog}"
    width: "min(640px, 92vw)"
---

# Design System: Cherrypick Masive

## Overview

**Creative North Star: "The Workbench Git Client"**

Cherrypick Masive is the category standard on purpose: a three-pane git client (branches, history, detail) built for Windows developers who backport commit sets several times a week. The user chose the canon over invented directions, and the quality bar is GitHub Desktop and Fork. That means the system wins on craft, not novelty: honest hairlines, a disciplined 30px control height, tabular monospace columns that line up, and a single blue that means "selected" or "the next thing to do".

The history list is the work surface. Everything else serves reading it: the sidebar picks the branch, the filter bar narrows it, the right pane explains the focused commit and is replaced by the session panel while a cherry-pick runs. Density is high (13px body, 34px rows) and long-session legibility comes from neutral ground, low-chroma panes and strong ink rather than from whitespace.

State is the one place colour is allowed to speak, and it never speaks alone. The build refuses dashboard cards, metric tiles and decoration; a light and a dark scheme carry the same roles through the same custom properties.

**Key Characteristics:**
- Three fixed panes on a neutral ground, separated by 1px hairlines, no floating cards.
- One blue for selection, focus and the primary action; nothing else is blue except tickets and diff hunk headers.
- Status colour is always icon + word + tint, never a bare dot or swatch.
- Cascadia Mono for every hash, date, count, path and diff line, with tabular figures.
- Light and dark schemes mirror each other role for role (`prefers-color-scheme`, overridable with `data-theme="light"`).

## Colors

A GitHub-lineage neutral palette: cool greys, near-black ink, one saturated blue, and four state hues that each appear only as a soft tint plus a strong text colour.

### Primary
- **Selection Blue** (`selection-blue`): the primary button ("Cherry-pick N commits…"), checked checkboxes, the focus ring, the current branch in the sidebar, ticket badges and the "Applying" status. Hover deepens to **Selection Blue Strong**. Dark scheme value is #4493f8 with ink-dark text on it.
- **Selection Blue Soft** (`selection-blue-soft`): the fill of selected history rows, the current session item, the current branch and ticket badges.

### Neutral
- **Ground** (`ground`): the window behind panes; visible on the start screen.
- **Pane** (`pane`): toolbar, sidebar, filter bar, list and detail backgrounds.
- **Pane Sunken** (`pane-sunken`): sticky list header, row hover, session action panel, `kbd` keys.
- **Hairline** (`hairline`): every pane border, control stroke and dialog edge. **Hairline Soft** (`hairline-soft`) separates rows inside lists.
- **Ink** (`ink`) and **Ink Muted** (`ink-muted`): primary text, and author/date/meta/label text. Muted ink still clears WCAG AA on pane and sunken surfaces.
- **Neutral Soft** (`neutral-soft`): ghost hover, menu hover, disabled primary fill and the "Already there" status tint.

### State
- **Applied Green** with its soft tint: "Applied" status and the "in target" badge; also diff additions (`+` counts, add-line background `diff-add-bg`).
- **Skipped Amber** with its soft tint: "Skipped" status and warning notices (truncated diff).
- **Conflict Red** with its soft tint: "Conflict" status, danger buttons, error notices and error text; also diff deletions (`diff-del-bg`).
- **Diff Hunk** (`diff-hunk`) on blue-soft: `@@` hunk header lines only.

### Named Rules
**The Word-With-Every-Colour Rule.** A status colour always arrives with an icon and a word: Applied (circle-check), Already there (circle-minus), Skipped (skip-forward), Conflict (octagon-alert), Pending (dashed circle, dashed outline, no fill), Applying (spinning loader). Colour without the word is a defect.

**The One Blue Rule.** Blue means selection, focus or the primary action. Do not use it for decoration, headings or secondary buttons.

## Typography

**UI Font:** Segoe UI Variable Text (with Segoe UI, system-ui)
**Mono Font:** Cascadia Mono (with Consolas, ui-monospace)

**Character:** The native Windows voice for everything a person reads as language, and Cascadia Mono for everything a person compares as data. Cascadia Mono ships with Windows 11 and Windows Terminal and holds up better at 12px than Consolas, which stays the fallback.

### Hierarchy
- **Headline** (600, 22px): start screen title only.
- **Title** (600, 16px, 1.35): commit subject in the detail pane, session heading ("Cherry-pick into …"), dialog titles. 15px is used for empty-state headings, 14px bold for the repo name in the toolbar.
- **Body** (400, 13px, 1.45): the base size for rows, buttons, inputs, menus and toasts.
- **Label** (600, 12px): list column headers, sidebar section headings, status chips. Sentence case; no uppercase, no tracking.
- **Meta** (400, 12px): field labels (500), commit meta, hints, notices, session progress, file list.
- **Badge** (11px, 18px line): ticket, merge and "in target" badges; `kbd` keys in mono.
- **Mono** (400, 12px, 1.5, tabular figures): hashes, dates, +/- counts, file paths, the target branch route, conflicted file lists and the diff.

### Named Rules
**The Data-Is-Mono Rule.** If a value is compared down a column or copied into a terminal (hash, date, count, path, branch), it is set in the mono face with tabular figures.

## Layout

A fixed application shell: a 48px toolbar row over a three-column workspace (`240px | minmax(420px, 1fr) | minmax(360px, 34%)`). The window minimum is 1100px wide. Panes scroll independently; the page itself never scrolls.

The history table is a CSS grid shared by the sticky 30px header and 34px rows: checkbox (34px), subject (fluid, with ticket and state badges inline), author (140px), hash (76px), date (124px, `YYYY-MM-DD HH:mm` local time). The filter bar is a five-column grid above it with a second full-width row for toggles and the right-aligned visible count.

Under 1280px the workspace tightens to `200px | minmax(380px, 1fr) | minmax(320px, 30%)`, the filter grid drops to four columns, and the author column is hidden so the subject stays readable. During a session, history rows show the pick status in the author column (header reads "Author · status"), so under 1280px that column returns at 112px and the date shows only the day.

Spacing runs on 4 / 6 / 8 / 12 / 16 / 20px. Panes pad 12px (toolbar, filters, list) or 16px (detail, session); dialogs pad 20px. Gaps between controls are 8px; icon-to-label gaps are 6px (4px inside status chips).

## Elevation & Depth

Flat by default. The three panes, toolbar and filter bar sit on the same plane and are separated only by hairlines and the ground/pane/sunken tonal step. A single shadow exists and is reserved for things that float above the panes: dialogs, the export menu and the toast. Dialogs add a dimmed backdrop.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgba(31, 35, 40, 0.16)`; dark `rgba(0, 0, 0, 0.5)`): dialog, dropdown menu, toast.
- **Row ring** (`box-shadow: inset 0 0 0 2px` focus blue): the keyboard-active history row. **Current item ring** (`inset 0 0 0 1px` blue) over blue-soft: the commit being applied in the session list.

### Named Rules
**The Panes-Don't-Float Rule.** Nothing docked in the shell casts a shadow. Only overlays do.

## Shapes

Gently rounded, small radii that read as native controls: 6px on buttons, inputs, branch items and bordered lists; 8px on the menu and toast; 12px only on dialogs. Pills (the 11px pill radius on 22px status chips and 18px badges) mark state and tags. The dialog backdrop is the only translucent fill: the scrim token. Checkboxes and the focus outline use 3px. Borders are always 1px solid hairline; the only dashed border is the "Pending" status, where it signals "not yet decided".

## Components

### Buttons
Quiet, native, one height everywhere.
- **Shape:** 30px tall, 6px radius, 1px hairline stroke, 0 12px padding, 16px lucide icon with a 6px gap.
- **Default:** pane fill, ink text; hover goes to pane-sunken.
- **Primary:** blue fill and border, white 600 text; hover deepens. Disabled primary drops to neutral-soft with muted text instead of fading, and a screen-reader reason is attached.
- **Danger:** default button with red text, red-soft hover (Abort, destructive actions).
- **Ghost / Icon:** transparent until hover; icon-only buttons are 30px square with an aria-label.
- **Disabled:** 55% opacity, not-allowed cursor.

### Status chips
The signature of the session. 22px pill, 12px 600 text, 13px icon, soft tint fill with strong text (see the Word-With-Every-Colour Rule). Used in the session item list and, during a session, in the history list's author column.

### Badges
18px pills at 11px: ticket badges in blue on blue-soft (600), merge badge in muted ink with a hairline, "in target" in green on green-soft. A ticket already present in the subject is not repeated as a badge.

### Inputs / Fields
- **Style:** 30px tall, 6px radius, hairline stroke, pane fill, 0 8px padding; label above in 12px/500 muted ink with a 4px gap.
- **Focus:** 2px blue outline drawn inside the stroke (offset -1px), border goes transparent.
- **Checkbox:** custom 15px square, 3px radius, muted-ink stroke; checked fills blue with a white SVG tick; disabled uses neutral-soft.

### History list
A keyboard listbox (arrows, j/k, Home/End, PageUp/PageDown, Space/x to toggle, Ctrl+A, Escape). Rows are 34px, separated by soft hairlines; hover is pane-sunken, selected is blue-soft, keyboard-active gets the 2px inset ring. Merge commits stay visible but cannot be ticked.

### Navigation (branch sidebar)
Pane background with a right hairline; 12px/600 muted section headings; branch items are full-width 6px-radius buttons, neutral-soft on hover, blue-soft fill with blue 600 text when current.

### Detail and session panes
Header block (16px padding, title + 12px meta) over a scrolling body. Detail shows changed files (mono path, green/red counts) over the diff (mono 12px/1.5, add/del line tints, hunk headers in blue). The session pane shows the route in mono, a polite live progress line, the item list, and a sunken action panel at the bottom (Continue / Skip / Abort / Open in editor).

### Notices, dialogs, menu, toast
Notices are full-width bands with a hairline below: amber-soft for warnings, red-soft for errors, icon tinted with the state colour, text in ink. Dialogs are native `<dialog>`, 640px max, 12px radius, Float shadow, 45% dark backdrop, footer actions right-aligned. The toast is inverted (ink fill, pane text), bottom-centre, and eases in over 180ms (`cubic-bezier(0.16, 1, 0.3, 1)`); it and the spinner stop under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** keep every control at 30px and every history row at 34px.
- **Do** pair every status tint with its lucide icon and its word: Applied, Already there, Skipped, Conflict, Pending, Applying.
- **Do** set hashes, dates, counts, paths and diffs in Cascadia Mono with tabular figures, falling back to Consolas.
- **Do** separate panes with 1px hairlines (#d0d7de light, #30363d dark) and tonal steps, not shadows.
- **Do** define every new colour as a custom property with both a light and a dark value.
- **Do** keep a visible 2px blue focus indicator on every focusable element.
- **Do** measure new screens against GitHub Desktop and Fork.

### Don't:
- **Don't** use dashboard cards, metric tiles or decorative illustration.
- **Don't** use blue for anything but selection, focus, the primary action, tickets and hunk headers.
- **Don't** show a state with colour alone, or an icon alone.
- **Don't** add shadows to docked panes, rows or buttons.
- **Don't** add uppercase tracked labels or kickers above headings; headings are sentence case at 12px/600 or larger.
- **Don't** use typed glyphs or emoji as icons; icons are lucide SVGs.
