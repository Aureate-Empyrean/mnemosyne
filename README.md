# Mnemosyne

Workspace-scoped personal knowledge and work, built for Aureate Empyrean.
Canonical architecture lives in `../architecture`; this repository implements its
Mnemosyne V1 subset. Licensed AGPL-3.0-or-later.

## Included

- Create, rename, switch and archive Workspaces with timezone-aware date views.
- Portable Markdown Notes, autosave with conflict detection, sanitized preview,
  tags, icon/accent, pinned favorites, multiple hierarchical Collections, trash
  and restore, explicit permanent deletion, Daily Notes unique per date/Workspace.
- Tasks: quick title-and-Enter creation, direct completion, Inbox, Today, Upcoming,
  Overdue, Completed, All Tasks, lifecycle, priority, start/deadline,
  completion date, checklist, tags, related Notes and Projects.
- Projects with lifecycle, related Notes/Tasks and a four-column Kanban board;
  board column is independent of task completion.
- Scoped full-content search, explicit resource links, local and Nexus backlinks,
  Module Protocol resolver, retried reference/event outbox and shared attachments.
- Independent full-window application with violet identity and shared neutral tokens.
- Home for capture, today's work, today's note and recent resources; Notes with a
  browsing pane and writing-first editor; Tasks with in-list completion (with Undo),
  context-aware quick add and a task inspector; Project Overview/Board/Tasks/Notes;
  a Collection tree with membership browsing; recovery-first Trash.
- Metadata is edited through chips and popovers; attachments, links and identity
  live in a details drawer. Motion follows every state change and respects
  reduced-motion preferences. See `docs/EXPERIENCE.md`.

## Run through Nexus

Requires the generic Nexus 0.1.2 application infrastructure extension (see Nexus
`docs/application-infrastructure.md`). No direct public module port is used.

```sh
docker compose build
python scripts/manifest.py
```

Review/install `manifest.local.json` through Nexus, then enable Mnemosyne.
Open `http://localhost:12333/app/modules/mnemosyne`. Nexus authenticates every
request; module APIs also authenticate the gateway. There is no demo login.

## Development and tests

```sh
python -m venv .venv
.venv/bin/pip install -r requirements-dev.lock
.venv/bin/python -m pytest -q
.venv/bin/ruff check backend tests scripts
npm ci
npm test
npm run check
# With local Nexus and Mnemosyne running, plus installed Playwright Chromium:
node scripts/browser_qa.cjs
```

Production dependencies are pinned in `requirements.lock`. The application uses
FastAPI and migrated SQLite, matching Nexus deployment conventions. `/data` is a
broker-managed durable volume. An image rebuild never initializes example data.
Theme values live at the top of `frontend/style.css`; resource accents are separate.

## Typography

Roboto is the interface typeface. The Nexus module sandbox does not allow a module
to deliver fonts, so Roboto is used when installed on the viewer's system and falls
back to the system sans-serif. Greater Theory is an optional poster face for the
fixed `MNEMOSYNE` / `AUREATE EMPYREAN` marks only; it is never bundled, and the app
uses it only when a locally installed copy is detected.

## Persistence and portability

Workspace IDs and resource IDs are stable UUIDs. Every domain request is qualified
by Workspace and validates related resources in the same Workspace. Collections
cannot contain cycles. Optimistic revisions reject stale edits rather than silently
replacing another tab's work. Normal Notes also represent Daily Notes.

Workspace export contains documented JSON records, Markdown content, relationships
and attachment blob IDs. It does not contain blob bytes: back up the Nexus data
volume and the module data volume for full recovery. Stop Mnemosyne before copying
its complete volume; restore into an empty replacement volume with UID/GID 10001.
Never copy a live SQLite database without its WAL. Schema versions reject downgrades.

References use `nexus:v1:mnemosyne:<kind>:<uuid>`. Markdown links use
`[title](nexus:v1:mnemosyne:note:<uuid>)`. Adding these indexes a link; links are
retained until explicitly removed in Links & backlinks. Foreign references remain
visible if their module is absent or permission is denied. Exact foreign read and
resolve scopes must be reviewed in the installation manifest; defaults grant none.
Sharing a link's readers explicitly also grants those modules minimal resolution of
its source title. No resolver assumes knowledge of an ID means permission.

## Trash

Trash is scoped to each Workspace. Moving an item there is reversible, with an Undo
shortcut. Restore preserves its original Workspace and surviving relationships.
Individual and selected permanent deletion, and Empty Trash, require confirmation.
Deleting a Project or Collection detaches surviving organizational relationships;
it does not delete their Tasks, Notes or child Collections. Incoming canonical
references remain unresolved rather than being silently removed. Shared blobs are
not purged by Mnemosyne.

The Trash screen configures retention per Workspace: Never, 7, 14, 30, 60 or 90 days.
The default is 30 days from `trashed_at`, independent of last edit/creation time.
Restoring clears that timestamp; re-trashing starts a new period. Cleanup runs at
startup and approximately every minute, including for archived Workspaces. Never
disables automatic deletion. Shortening retention warns about already-expired items.
The migration gives previously trashed items a fresh retention period, because the
old schema did not record when deletion happened.

The authenticated API provides `GET/PUT /api/w/{wid}/trash/policy` (`days`: integer
or null), and `POST /api/w/{wid}/trash` (`action`: restore/delete/empty, `ids` for
selected items, `confirmed: true` for deletion). Individual `DELETE` requests now
require `?confirmed=true`. Batch actions validate all IDs before mutating anything.

## V1 limits

Single installation owner; Workspaces are logical isolation, not separate users.
Markdown source with rendered preview, not a proprietary block editor. Attachments
are limited to 1 MiB each. Four fixed board columns. Root-page reload selects the first active Workspace;
resource deep links retain their Workspace. Retained
shared blobs have no automatic garbage collection. Module events/references retry
from a durable outbox; repeated events can occur after an interrupted acknowledgement.
Full version history, reminders, recurrence, Canvas, external connectors, advanced
embeds, templates and offline synchronization remain deferred by architecture.

## Localization

Nexus owns the locale preference. Mnemosyne inherits it for presentation and uses
`Intl` for dates, relative times, numbers and plural rules. Every interface string
except the fixed brand marks goes through the message catalog; English messages
live in `frontend/locales/en.json`. Messages may contain `{placeholders}`; plural messages
come as a one/other pair of keys.
Community text catalogs can be placed in the persistent volume at
`/data/locales/<language-tag>.json`, mapping the same English message keys to plain
text. Exact locale, base language and English form the fallback chain. Catalogs
are data, never executable code; user-authored titles/content are not translated.
