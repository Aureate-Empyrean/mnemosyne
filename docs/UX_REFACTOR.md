# Mnemosyne V1 interaction refactor

Source: architecture a499da9. Preserve the SQLite model, resource identities, Nexus gateway/shared services, Workspace boundaries and existing accent tokens.

Acceptance: Home is a working surface; five primary destinations; Notes list/editor; Task quick creation and completion in lists with internal views; Project board/tasks/notes; Collection hierarchy and membership browsing; secondary shared capabilities remain available. Trash has timestamps, selected restore/delete, Empty Trash, confirmed permanent deletion and per-Workspace retention (30 days default, Never supported).

Implementation: additive migration grants existing Trash a fresh retention period at migration, since its historical deletion time was not recorded. Cleanup runs at startup and every minute, using an injectable UTC clock for boundary tests. Organizational relationships detach on permanent deletion, surviving resources and incoming canonical references remain. Shared blobs are not deleted.

Validation and final deployment results will be recorded here after implementation.

## Completed checkpoint

The five primary destinations now use distinct work surfaces. Notes retain a
browsing pane beside writing; Tasks complete directly in lists and quick-create
with Enter; Project Board/Tasks/Notes/Overview make work primary; Collections show a
hierarchy and membership browsing. Shared capabilities remain in secondary panels.
The violet theme tokens and Nexus application boundary are unchanged.

Schema 3 and the complete Trash lifecycle are deployed. Backend, DOM, Nexus and
live service checks passed, followed by real Chromium and visual QA. Original
Workspace/resource rows match the pre-refactor backup and SQLite integrity is OK.
See `QA_HANDOFF.md` for evidence, exact coverage and the remaining V1 limitations.
No Nexus source changes were required. Architecture was rechecked through f762f84;
subsequent commits concern other module ownership and do not alter this refactor.
