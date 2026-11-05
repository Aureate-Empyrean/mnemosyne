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

Requires Nexus 0.1.8 or later within 0.1.x (1.2.3 declares an application icon; 1.2.0–1.2.2 need 0.1.5): the application infrastructure extension
(see Nexus `docs/application-infrastructure.md`), Entity References v2 and backup v1.
No direct public module port is used.

Mnemosyne participates in the Nexus lifecycle contracts (Nexus
`docs/lifecycle-and-recovery.md`):

- **Outgoing-reference enumeration**: `GET /empyrean/v1/references/outgoing` lists every
  edge Mnemosyne publishes, so owners can rebuild the Nexus index from Mnemosyne data.
  Permanently deleting a resource removes its published edges.
- **Backup v1**: the artifact is a consistent SQLite snapshot (`mnemosyne-sqlite`,
  format 1), restorable by any 1.x release at or above the exporting version; older
  schemas migrate forward. Restore preserves resource UUIDs, re-publishes edges and
  suspends automatic Trash purges until Nexus finalizes the restore. Trash that expired
  inside the backup then receives a fresh retention period.

```sh
docker compose build
python scripts/manifest.py
```

Review/install `manifest.local.json` through Nexus, then enable Mnemosyne.
Open `http://localhost:12333/app/modules/mnemosyne`. Nexus authenticates every
request; module APIs also authenticate the gateway. There is no demo login.

## Navigation History pilot (local, default-off)

The current working tree contains the first real module integration for Nexus's
shared navigation-history SDK. With `NEXUS_NAVIGATION_HISTORY=1` in a matching
Nexus process, internal views/resource drawers update the parent URL and native
Back/Forward (including Mouse4/5) restores them. Legacy resource URLs and old-host
memory navigation remain supported; no manifest privilege or sandbox relaxation
is added. The flag is not forwarded by Nexus's checked-in Compose file.

The module keeps autosave/conflict guards and tab-local draft recovery across
supported navigation/reload flows. These private checkpoints are not backups or
an unconditional guarantee against tab/browser failure. Read [navigation and
recovery behavior](docs/NAVIGATION_HISTORY.md) for route coverage, activation,
SDK packaging and limits. Sixteen scenarios were validated against real local
Nexus + Mnemosyne + unchanged Chronos HTTP apps; this is not production deployment
or an all-module migration.

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
# Disposable Nexus installation (built Nexus and mnemosyne:1.2.3 images required):
python scripts/nexus_integration.py ../empyrean-nexus
```

Production dependencies are pinned in `requirements.lock`. The application uses
FastAPI and migrated SQLite, matching Nexus deployment conventions. `/data` is a
broker-managed durable volume. An image rebuild never initializes example data.
Theme values live at the top of `frontend/style.css`; resource accents are separate.

## Design

Mnemosyne 1.2.2 uses token set 2.1 (architecture ADR 0012, ADR 0014) with a "lamplight" composition: a dim violet dusk with one warm amber lamp, a floating glass sidebar and toolbar, and the work on an elevated, nearly opaque sheet so long-form reading and writing stay calm (16 px, 1.75 line height in the editor and reader). Inside the sheet nothing is glass: task lists, recent items and board columns are quiet hairline groups and project headers are open. The drawer, menus, dialogs and toasts float as glass with a specular edge; glass falls back to solid surfaces without `backdrop-filter` or under reduced transparency. One radius scale: controls 9 px, groups 12 px, surfaces 18 px. Presentation only: the API, data, markup and workflows are unchanged. Screenshots (Playwright, 1440 px and 390 px, inside the Nexus sandbox): `docs/screenshots/` (`before-` original, `previous-` 1.2.1, `after-` 1.2.2).

Its application icon (1.2.3) is the header's four-point star on its violet tile, served at `/icon.svg` for Nexus (manifest `icon`).

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

## Task deadlines for Chronos (1.2.0)

Mnemosyne 1.2.0 adds one read-only interface and nothing else: it provides the `dated-items`
projection (architecture ADR 0011, `concepts/projections.md`) at
`POST /empyrean/v1/projections/dated-items`, authenticated with the Nexus resolver key. It
returns non-trashed Tasks with a deadline in active Workspaces as all-day items with status
(open, completed, cancelled) and the Workspace title as presentation context. Nexus forwards
only requesters the owner granted this exact scope; Chronos shows them only after the user opts
in. Tasks, deadlines and reminder intent remain Mnemosyne's; nothing is written. Requires Nexus
0.1.5 (the manifest declares `projections`); data, schema and interface are unchanged.

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
