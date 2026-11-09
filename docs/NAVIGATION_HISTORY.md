# Navigation History — Mnemosyne local pilot

Implemented in the current local Nexus + Mnemosyne working trees; reviewed against
the source on 2026-11-05. This is not production deployment or an all-module
migration. **Update 2026-11-07:** Nexus 0.1.11 enables the host feature by default
(`NEXUS_NAVIGATION_HISTORY=0` is the kill switch) and is reported deployed, but this
Mnemosyne adapter is released in **1.2.4** and carried by **1.3.0**, which runs on aetest (checked in the real Nexus, 14/14 at 1440/390 px) and **in production since 2026-11-07** ([record](../../DEPLOYMENT_PHASE2_EXODUS_2026-11-07.md)).
The earlier text, written when the flag defaulted off (`NEXUS_NAVIGATION_HISTORY=1`
required), follows. Both the updated host and this module's inline SDK/adapter must be loaded.
Nexus's checked-in Compose file does not forward the flag; `.env` alone is
insufficient. See [activation and rollback](../../empyrean-nexus/docs/navigation-history.md#activation-and-rollback).

## Ownership and packaging

The module discovers support through the existing application bridge's `context`
result (`navigation.versions` includes 1), then starts the shared client. Nexus
writes the browser URL/history, retains the same module iframe and sends restores.
Mnemosyne owns its route codec, rendering, autosave and recovery. Back/Forward and
native Mouse4/5 restore internal views/resources/drawers. Reload/deep links choose
the workspace through normal authentication. Without an advertisement, existing
memory/legacy navigation remains in use. No iframe/CSP or API permission is relaxed.

Sources:

* `frontend/vendor/nexus-navigation.js`: exact dependency-free Nexus SDK copy.
* `frontend/navigation-routes.js`: Mnemosyne-owned parse/serialize codec.
* `frontend/navigation.js`: restoration, request fencing and draft checkpoints.
* `frontend/app.js`: navigation/editor hooks, fallback and save guards.
* `backend/mnemosyne/app.py`: bundles these scripts inline in the HTML response.

No runtime sibling checkout or CDN is needed. From the sibling Nexus repository,
`node scripts/sync-navigation.mjs --check` checks byte identity. The command
without `--check` writes this module's vendor copy; it is not a generic installer.
Other modules need their own adapters and safety tests, not this domain codec.
See the [shared contract/adoption guide](../../empyrean-nexus/docs/navigation-history.md)
for messages, callbacks, limits and migration requirements.

## Route references

An example decoded reference is `/w/<workspace-uuid>/tasks?taskView=all&task=<uuid>`.
Nexus carries it once-encoded in `/app/modules/mnemosyne?nav=1&route=...`.
The older `path` parameter still selects only the iframe HTTP bootstrap path.

| View | Addressable state |
| --- | --- |
| `home` | Workspace; capture text remains private/tab-local |
| `notes` | `note=<uuid>`, `preview=1` |
| `tasks` | `taskView=today|all|inbox|upcoming|completed`; `task=<uuid>` opens the inspector |
| `projects` | `project=<uuid>`, `projectTab=board|overview|tasks|notes` |
| `collections` | `collection=<uuid>`, `collectionNote=<uuid>`, `preview=1` |
| `trash`, `workspaces`, `search` | Workspace + view |
| Resource drawers | `task=<uuid>` or `details=<uuid>` can accompany a view |

Overdue tasks are a group within Today, not a `taskView=overdue` tab. UUIDs are
lowercase canonical strings. Inner fragments are rejected even though the generic
host permits them. Unknown views/options, duplicate keys and invalid identities
report errors. The codec is handwritten, not a published JSON Schema; some
irrelevant option/view combinations can be accepted and dropped by serialization.
Do not depend on those combinations.

Legacy `/w/<workspace>/r/<resource>` paths still resolve the kind and normalize
with replace, including older `?path=` links. A missing/trashed/unavailable target
keeps the address and reports an error rather than silently opening another note.
Initial normalization or selecting the same route does not add a Back step. User
view/resource changes push; repeated search changes replace. Domain mutations
and editor keystrokes do not create history entries.

Search view is linkable; search text stays in this tab's checkpoint rather than
the URL. A link in a clean tab shows an empty search prompt. Scroll, caret,
transient pickers and editor contents are not shareable route state.

## Save and recovery behavior

Click navigation still flushes sessions and shows existing save/conflict choices
on failure. Nexus-triggered traversal cannot be canceled: the module invalidates
obsolete UI work, retains dirty sessions/snapshots and restores the requested
view. Before parent SPA routing/unmount it supplies a final acknowledged
checkpoint. In-flight saves stay bound to their original workspace.

Checkpoints contain private resource text and quick-capture/quick-add inputs in
the trusted **Nexus parent's sessionStorage**. They are scoped to this origin,
browser tab, owner username and bound module; they are not encrypted, server-side
storage, part of a module backup, or a substitute for saving. The opaque child
cannot directly read parent storage and receives only its own snapshot through
the validated bridge.

Retained editor drafts have a Recover draft action in their original workspace;
unsubmitted input is restored into its matching view. Reload compares snapshots
with the saved resource. Differing drafts retain their old revision, so
Retry/Keep mine/Use saved cannot silently bypass optimistic concurrency. Use saved
refreshes the visible editor. Copies are reconciled on saving/discarding;
uninstall removes the module's copy, and sign-out warns before clearing dirty tab
checkpoints. Recover/save them before disabling the feature.

A failed/oversized/quota-limited checkpoint or unresponsive client can leave the
requested browser URL different from the retained recovery editor. Nexus reports
the error rather than forcing reverse history. Full-document close/reload relies
on acknowledged snapshots and the existing unload warning: a crash, cleared tab
storage or a very recent unacknowledged edit is not guaranteed recoverable. The
SDK's promise resolving alone does not prove successful rendering; visible errors
and `onError` remain significant.

## Recorded validation and remaining gates

The [implementation record](../../empyrean-nexus/docs/proposals/navigation-history/PILOT.md)
and [browser evidence](../../empyrean-nexus/docs/proposals/navigation-history/pilot-evidence/chrome-results.json)
record 16 real-app Chrome scenarios: Notes/Tasks/detail traversal, unchanged
Chronos switching, reload/deep links, synthetic Mouse4/5, failed saves, quick
capture, real revision conflicts, workspace identity and sign-out warnings.
The test uses real APIs/HTML/CSP over loopback HTTP with fresh SQLite data; only
container lifecycle uses a disposable process launcher. This is not only the old
synthetic fixture and not a production Docker test.

Recorded module checks: 13 frontend/codec and 30 backend tests passed with Windows
timezone data available. Nexus's [development guide](../../empyrean-nexus/docs/development.md#navigation-history-pilot)
explains the opt-in Playwright regression/dependencies. This documentation sync
does not claim a new run of those tests.

Remaining production gates: other browsers, physical mouse input, BFCache, real
container/image lifecycle, session expiry/relogin, deployment-specific proxy/auth/
CSP checks and live failure combinations such as quotas/timeouts and rapid
traversal under slow APIs. Current status is a flag-gated local pilot, not a release.
