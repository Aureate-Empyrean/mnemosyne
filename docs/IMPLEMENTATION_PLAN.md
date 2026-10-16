# Mnemosyne V1 implementation checkpoint

Canonical source: ../architecture, especially modules/mnemosyne.md V1 boundary,
application boundary, references, storage and design tokens. Nexus baseline e225da1.

## Scope
Workspaces; Markdown Notes with autosave, metadata, collections, links, attachments
and trash; Tasks and derived date views; Projects with independent board columns;
hierarchical Collections; unique Daily Notes; scoped search; Nexus interoperability.
Deferred features remain deferred as listed in the canonical architecture.

## Implementation decisions
- Python/FastAPI and SQLite migrations, matching Nexus conventions. One database,
  workspace-qualified queries and validated same-workspace relationships.
- Plain Markdown is authoritative content. Editor plus sanitized rendered preview.
- Full application in an opaque-origin sandbox, with a constrained parent message
  bridge to its own API. No Nexus management chrome or owner credentials in module.
- Generic opt-in Nexus extensions for durable /data volume, shared blobs and
  full application bridge. Existing manifests/data remain valid and unchanged.
- Workspace timezone controls calendar-date views; date-only deadlines stay dates.
- Explicit reference sharing, no automatic foreign resource disclosure.

## Checkpoints
- [x] Architecture and existing Nexus inspected; identified missing infrastructure.
- [x] Backend, migrations and isolation tests (13 passing).
- [x] Application UI and generic shared infrastructure extensions implemented.
- [x] Nexus regression tests, deployment, browser QA and final diff review
  (see Deployment verification, Handoff and `QA_HANDOFF.md`).
- [x] Commits using existing Git identity.

Staging note: temporary storage was cleared between sessions. Nexus extension has
been reconstructed in ignored `.work/nexus` and is being reverified before apply.

## Deployment verification

- Nexus upgraded to 0.1.2 with an additive schema migration and retained volumes.
- Private consistent backup: `/data/backups/pre-mnemosyne-v1.sqlite3` in Nexus.
- Existing users, settings, Example Module manifest/token/registration verified
  equal to the backup. Example Module still responds through Nexus.
- Mnemosyne installed and healthy at `/app/modules/mnemosyne` through port 12333.
- Live smoke verified shared blobs, actual Nexus backlinks, API isolation,
  collections, tasks/date views, unique Daily Notes, export and disable/enable persistence.
- Test-created Workspaces removed; no seed/demo content.
- Real Playwright QA found sandbox-native form submission blocked. Fixed with
  explicit validated button actions without enabling forms in the sandbox.
- Outbox migration 2 adds per-entry retry backoff so unavailable references cannot
  block unrelated events. Local content remains authoritative during Nexus outages.

## Handoff

Further QA handed to the user at their explicit request to conserve quota.
15 backend tests passed; Nexus 88 tests passed; DOM UI tests passed.
Real browser verified full-page shell, Workspace creation, Markdown autosave,
preview and reload persistence. Native-form sandbox issue fixed and deployed.
Browser scenario stopped at task Priority selection: its exact accessible-label
locator did not match; project/task transition timing also needs manual review.
Board, remaining browser flows and mobile visual QA are not certified complete.
Local application: http://localhost:12333/app/modules/mnemosyne

## Resumed focused QA

User requested continuing QA while conserving the remaining quota. Completed the
focused Playwright scenario with four screenshots and zero console errors.
Accessible select labels fixed and deployed; test synchronization/cleanup hardened.
See `docs/QA_HANDOFF.md` for exact coverage and remaining product/visual findings.
The active Workspace reload behavior, loading states, cramped mobile header and
project-board prominence are explicitly recorded for tomorrow rather than hidden
behind a broad "complete" claim.

## Nexus 0.1.3 contract — Mnemosyne 1.1.0, 2026-10-16

Manifest moves to Entity References v2 with enumeration and backup v1, and requires
Nexus `>=0.1.3,<0.2.0`. Resource IDs were already canonical UUIDs; no data migration.

- Outgoing-reference enumeration, cursor-paged by link ID, resolver-authenticated.
- Permanent deletion now queues removal of the source's published Nexus edges (they were
  previously orphaned in the index). A reference Nexus no longer has (404 on DELETE)
  completes instead of retrying forever.
- Backup v1 export/validate/restore/finalize. Artifacts stream through the data volume,
  not the 16 MiB `/tmp`. Validation checks identity headers, format, SQLite integrity,
  foreign keys, required tables and schema range. Restore clears the stale outbox and
  re-publishes every edge so later unlinks use current Nexus reference IDs. A
  `purge-suspended` marker in `/data` keeps purges off across restarts until finalize.
  Finalize defers already-expired Trash with a new `purge_after` column (schema 5);
  `trashed_at`, the deletion time users see, is never rewritten.
- Schema 4 remembers the last opened Workspace, so a reload reopens it.

Verified on the final commit: 26 backend tests (5 new), 11 DOM tests, Ruff, Prettier. New
`scripts/nexus_integration.py` passed against a disposable Nexus 0.1.3 stack: install,
gateway, reference publish, no-op reconciliation, backup, divergence, confirmed restore
(validate/reconcile/finalize), identical UUIDs and titles, rebuilt index, post-restore
unlink, uninstall. Its stack and module volume were removed.

Known limit: Nexus answers 422 when an edge targets a module that is not registered
(for example a link to a future Meridian person). That outbox entry keeps retrying, so the
sync indicator never reaches zero; restore re-queues it. Owner reconciliation does index
such edges, because enumeration accepts absent modules. Needs a decision on how
Mnemosyne should mark edges Nexus refuses.

Not done here: no live installation exists on this host any more (no Docker volumes),
so nothing was deployed or migrated. Real-browser QA of the 1.1.0 build is still open.

## Shared design tokens — 2026-10-16

Architecture ADR 0008. `frontend/aureate-tokens.css` is the canonical token file, vendored
unchanged; `style.css` keeps only the violet accent family, display face, priority
colors and layout sizes, and uses the shared motion names. Roboto (OFL, `frontend/fonts`)
is embedded as a data URI so the sandboxed app renders the same face as Nexus; this needs
Nexus 0.1.4 (`font-src data:`). On 0.1.3 the system font fallback is used.
Danger/warning colors and the shadow now follow the shared values.
