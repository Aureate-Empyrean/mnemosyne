# Mnemosyne

Workspace-scoped personal knowledge and work, built for Aureate Empyrean.
Canonical architecture lives in `../architecture`; this repository implements its
Mnemosyne V1 subset. Licensed AGPL-3.0-or-later.

## Included

- Create, rename, switch and archive Workspaces with timezone-aware date views.
- Portable Markdown Notes, autosave with conflict detection, sanitized preview,
  tags, icon/accent, pinned favorites, multiple hierarchical Collections, trash
  and restore, explicit permanent deletion, Daily Notes unique per date/Workspace.
- Tasks: Inbox, Today, Upcoming, Overdue, lifecycle, priority, start/deadline,
  completion date, checklist, tags, related Notes and Projects.
- Projects with lifecycle, related Notes/Tasks and a four-column Kanban board;
  board column is independent of task completion.
- Scoped full-content search, explicit resource links, local and Nexus backlinks,
  Module Protocol resolver, retried reference/event outbox and shared attachments.
- Independent full-window application with violet identity and shared neutral tokens.

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
```

Production dependencies are pinned in `requirements.lock`. The application uses
FastAPI and migrated SQLite, matching Nexus deployment conventions. `/data` is a
broker-managed durable volume. An image rebuild never initializes example data.
Theme values live at the top of `frontend/style.css`; resource accents are separate.

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

## V1 limits

Single installation owner; Workspaces are logical isolation, not separate users.
Markdown source with rendered preview, not a proprietary block editor. Attachments
are limited to 1 MiB each. Four fixed board columns. Manual trash purge. Retained
shared blobs have no automatic garbage collection. Module events/references retry
from a durable outbox; repeated events can occur after an interrupted acknowledgement.
Full version history, reminders, recurrence, Canvas, external connectors, advanced
embeds, templates and offline synchronization remain deferred by architecture.

## Localization

Nexus owns the locale preference. Mnemosyne inherits it for presentation and uses
`Intl` for date formatting. English messages live in `frontend/locales/en.json`.
Community text catalogs can be placed in the persistent volume at
`/data/locales/<language-tag>.json`, mapping the same English message keys to plain
text. Exact locale, base language and English form the fallback chain. Catalogs
are data, never executable code; user-authored titles/content are not translated.
