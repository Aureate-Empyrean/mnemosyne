# QA handoff — interaction refactor, 2026-09-30

Deployed at http://localhost:12333/app/modules/mnemosyne.

Implemented the interaction and Trash decisions from architecture `a499da9`.
Architecture changes through `f762f84` were also checked; they do not change this
V1 interaction or Trash scope.

## Verification

- 21 backend tests: Workspace isolation, migrations, concurrency/conflicts, dates,
  references, shared attachments and the new Trash lifecycle. Retention tests cover
  the exact 30-day boundary, Never, restore/re-trash, archived Workspaces and the
  migration grace period. Batch validation is atomic and Workspace-scoped.
- 8 DOM interaction tests: primary navigation, scoped search, Note browsing and
  save-before-switch, focus on writing, title-and-Enter Task creation, direct Task
  completion, progressive disclosure, deletion confirmations and sanitized preview.
- 88 Nexus regression tests passed. No Nexus source changes were needed.
- Ruff, JavaScript syntax checks and the Docker build passed.
- Live integration smoke passed: authenticated gateway, scoped resources, shared
  attachment roundtrip, real Nexus backlinks, export, Daily Note uniqueness,
  Task dates/lifecycle, and persistence across disable/re-enable. Other installed
  module states were preserved; the check does not require the Example Module.

## Real browser and visual QA

Playwright Chromium used the real Nexus application boundary and services. Temporary
owner sessions were revoked and only the recorded verification Workspaces removed.
The final run passed with **zero page or console errors** and eight screenshots.

Verified Home, Notes, Tasks, Projects, Collections, Daily Note, Search, Trash and
Workspace switching. Specific checks include direct Task completion/reopening,
quick creation with Enter, checklist edits, independent Kanban movement, Note
switching with autosave, Markdown preview, shared attachment upload, references,
multi-Collection membership, restore with relationships intact, individual deletion
with cancellation/confirmation, selected restore, Empty Trash, and reload persistence.
Never retained an aged test item; switching to 30 days allowed the actual background
worker to expire it. Desktop and 390px mobile layouts were checked; no document-level
horizontal overflow was found. Switching back to Nexus opened its working Overview.

Visual inspection covered the Home working surface, adjacent Note browsing/editor,
compact Project header with board first, Collection tree/content and mobile Notes.
Browser findings fixed: stale Note browsing titles after save, blocked native
autofocus in the sandbox, and editing during asynchronous navigation. Browser input
now waits for navigation completion, rather than typing into a departing screen.

Local evidence (ignored by Git): `artifacts/browser-result.json`,
`artifacts/browser-run.log`, and `artifacts/01-home.png` through
`artifacts/08-mobile-notes.png`.

## Existing data and deployment

Before deployment, a SQLite backup was made inside Mnemosyne's retained volume at
`/data/backups/pre-interaction-refactor.sqlite3`. Comparing all original columns and
rows confirmed the existing Workspace and five resources were unchanged. SQLite
integrity and foreign-key checks passed after migration to schema 3. Nexus grants,
configuration and the retained storage volume were preserved.

## Remaining V1 limits

- Markdown source and rendered preview; no rich block editor or offline sync.
- Attachments remain limited to 1 MiB; board columns remain fixed.
- Root-page reload selects the first active Workspace. Resource deep links retain
  their Workspace; the visible switcher always scopes subsequent data requests.
- Retention runs at startup and approximately once a minute while the app is running.
  Existing Trash receives a fresh retention period during migration because its
  historical deletion timestamp was unavailable. Shared blob garbage collection
  remains outside Mnemosyne's ownership.
