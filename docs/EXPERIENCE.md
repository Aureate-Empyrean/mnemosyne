# Mnemosyne application experience

This describes the interface of the experimental `experiment/opus-ui` redesign.
The backend API, the domain model, resource identities and Workspace semantics are
unchanged; everything here is presentation and interaction.

Governing rule: **expose workflows, not schemas.** Every surface has one dominant
action. Metadata appears as compact chips that are edited in small popovers, rare
properties live behind one disclosure, and destructive actions live in overflow
menus and confirmations, never as permanent red buttons.

## Shell

- **Sidebar**: brand mark, a Workspace switcher (a button with a menu listing
  Workspaces, archived ones separately, "New Workspace…" and "Manage Workspaces"),
  the five primary destinations (Home, Notes, Tasks, Projects, Collections) with a
  sliding selection indicator, and "Today's note". Trash, Applications and a "More"
  menu (manage Workspaces, export, sync) sit at the bottom. A sync notice appears
  only when changes stay queued for Nexus across two checks.
- **Top bar**: breadcrumbs that reflect real context (Collections › Research ›
  Note) and Workspace-scoped search (`/` or Ctrl/Cmd+K). Search runs as you type.
- **Drawer**: one right-hand drawer serves as the Task inspector and as the details
  panel for Notes, Projects and Collections. At 1280 px and wider it pushes the
  content aside so the list stays visible; below that it overlays.
- The shell renders once; only the view and the drawer re-render, so focus and
  motion stay continuous.

## Surfaces

- **Home**: today's date, a capture bar (Task or Note, with deadline, priority and
  project chips for tasks), Today (overdue first), a Today's-note card and a short
  list of recently edited notes, projects and collections. No counts or filler.
- **Tasks**: segmented views Today · Inbox · Upcoming · Completed · All. Overdue is
  the first group in Today rather than a separate tab. Upcoming groups by date,
  Completed by completion day, All by Project. Quick-add is the first row of the
  list and inherits its context: Today defaults to a deadline of today, Upcoming to
  tomorrow, a Project to that Project. Defaults are visible chips and removable. When
  a new task lands elsewhere a toast says where, with an Open action.
- **Task rows**: round checkbox, title and only useful chips (deadline, priority
  when set, project when not implied, checklist progress). Clicking the row opens
  the inspector; the checkbox completes the task immediately.
- **Task inspector**: checkbox and title, property chips with "+ Add", a borderless
  description, the checklist, and a collapsed "Attachments, links and more". The
  overflow menu holds Cancel/Reopen and Move to Trash. Board column is not shown;
  it belongs to the Project board. There is no Save button.
- **Notes**: list (title, snippet, relative time) beside a writing-first editor:
  large title, metadata chips (collections, project, tags), a quiet formatting bar
  that comes forward while writing, Write/Preview, quiet save status, details
  drawer and an overflow menu. Collections in Trash stay attached and are shown as
  "Collection in Trash" instead of being silently dropped.
- **Daily Note**: titled with the localized date, with previous/next navigation
  across existing daily notes and "Go to today". Navigation never creates notes.
- **Projects**: a compact list with progress and deadline; a project page with an
  editable title, a status pill, date chips, a goal description, and Overview,
  Board, Tasks and Notes tabs. Board cards move by drag and drop, the card menu or
  Alt+←/→. Completed cards stay in their column under "N finished". Columns never
  complete tasks.
- **Collections**: a collapsible tree with note counts beside the selected
  Collection (description, New note here, Add existing notes, sub-collections and
  its notes). Notes open in place with a way back. "Move to…" never offers a
  Collection's own descendants.
- **Search**: results grouped by kind with highlighted titles and snippets; Enter
  opens the first result, Esc returns to where you were.
- **Trash**: recovery first. A one-line retention policy with Change, rows with
  relative deletion time and time left, Restore on each row, permanent deletion in
  the row menu, a selection bar only after something is selected, and
  confirmations that state counts. Shortening retention states how many items it
  would remove.
- **Workspaces**: rename, time zone and archive inline. An archived Workspace shows
  a banner with "Restore Workspace" and becomes read-only everywhere.
- **Save safety**: autosave is quiet. When a save fails the status offers Retry;
  when the resource changed elsewhere it offers "Keep mine" or "Use saved". Leaving
  a surface with unsaved changes asks whether to stay, keep your version or discard.
  Text is never discarded silently.

## Typography

- **Roboto** is the typeface for all functional text (`--font-ui`). The Nexus module
  sandbox sends `default-src 'none'` without `font-src`, so a module cannot ship a
  web font (a `data:` font is blocked too). Roboto is therefore used when it is
  installed on the viewer's system, with a system sans-serif fallback. Bundling it
  needs a Nexus-side `font-src` decision.
- **Greater Theory** is a poster element for fixed uppercase brand strings only:
  `MNEMOSYNE` and `AUREATE EMPYREAN` (sidebar wordmark, welcome and splash). It is
  never bundled or committed. `@font-face` declares `local("Greater Theory")`; at
  startup the app loads that face, and only if it is available adds
  `has-display-font`, which switches those strings from spaced Roboto to Greater
  Theory. It is never used for user content, localized strings, headings or
  anything dynamic, so glyph gaps cannot occur. With Roboto alone the interface is
  complete.

## Motion

Tokens: `--fast` 120 ms (hover, press, small state), `--base` 180 ms (tabs,
disclosures, list changes), `--slow` 230 ms (drawer, larger spatial moves);
`--ease-out` for entering, `--ease-in` for leaving, a gentle spring for the
checkbox.

- Views fade and rise 6 px; drilling into a project, collection note or note from a
  list slides in from the right.
- The navigation indicator and tab underline slide to the new item.
- The inspector slides in from the right while the selected row stays highlighted.
- Completing a task pops the checkbox, draws the mark and strikes the title. The
  row stays for about 2.5 s with an inline Undo, then collapses out of views that
  exclude completed tasks.
- New rows expand in with a brief accent wash; removed rows collapse; moved rows
  and board cards glide to their new position (FLIP).
- Menus, dialogs and toasts scale and fade from their origin; toasts pause while
  hovered.
- Nothing waits for an animation: state changes happen first and motion follows.
- `prefers-reduced-motion: reduce` removes transforms and height animation; the
  interface behaves the same, with Undo still available.

## Known limitations caused by the current backend

These belong to the separate safety/contract pass and were not changed here.

- The resource list returns full content for every resource, so a Workspace larger
  than the 2 MiB gateway response cap cannot load.
- Conflicts are recognized by the backend's error message text, because the bridge
  passes only the message, not the HTTP status.
- Links created from Markdown stay in "Links" when the text is removed.
- Resolving a trashed resource reports it as deleted to other modules.
- Task views are computed in the browser from the full list, with the same
  semantics as before (Today = due or starting today; Inbox = open tasks without a
  project).
- The board's fourth column is still named "Done" even though it does not complete
  tasks; the board says so explicitly.
- `scripts/browser_qa.cjs` targets the previous interface and a live installation
  and was not used. The redesign was verified in a disposable Nexus-like harness
  (sandboxed iframe, the Nexus bridge, gateway key, CSP and response limits) with a
  scratch database.
