# QA handoff — 2026-09-30

## Current deployment

http://localhost:12333/app/modules/mnemosyne

The focused Playwright scenario passed against the actual deployed Nexus and
Mnemosyne containers, with no page/console errors. No services were mocked.
This is functional verification, not confirmation that the product or visual
experience matches the user's expectations.

## Verified in a real browser

- Full application boundary: Nexus management chrome is hidden.
- Workspace creation through the strict sandbox.
- Markdown title/content/tags, save, rendered emphasis/tables, reload persistence.
- Project creation; related task creation; priority and checklist editing.
- Board placement remains independent of task lifecycle.
- A second Workspace cannot find the first Workspace's resources through search.
- 390px mobile layout has no document-level horizontal overflow.
- Application switcher returns to the functional Nexus overview.
- Temporary browser owner session revoked; this run's test Workspaces removed.

## Fixes during QA

- Native form submission is blocked by the sandbox before onsubmit. Explicit
  validated button actions now perform saves without relaxing sandbox permissions.
- Select controls now have explicit accessible labels. Their option text no
  longer makes exact label-based access ambiguous. Translated labels are escaped.
- Browser automation waits for the new resource kind and closed Workspace dialog,
  rather than typing into the previous editor while navigation is still pending.
- QA captures created Workspace IDs from successful responses so cleanup does not
  accidentally record the previous active Workspace or touch user-created data.

## Findings to discuss tomorrow

1. Project boards are below a large Markdown description editor. The board should
   be easier to reach; decide the intended project experience before redesigning.
2. On mobile, heading/actions and Workspace names wrap awkwardly. Navigation
   scrolls horizontally; a more deliberate mobile navigation layout is needed.
3. A normal root-page reload chooses the first unarchived Workspace rather than
   retaining the last selection. Data remains scoped, but context persistence
   would improve predictability. The test explicitly reselects its Workspace.
4. Navigating between resources is asynchronous; the old editor remains visible
   briefly. Consider a loading state that prevents editing during transitions.
5. Markdown checkboxes render as literal checklist notation, not interactive
   checkboxes in preview. They remain separate from first-class Tasks.
6. This pass did not exercise every UI control. Attachment/reference endpoints,
   Daily Note concurrency, trash, collection cycles, migrations, conflict handling,
   and disable/re-enable persistence have backend/live API coverage; their entire
   browser workflows are not certified by this particular scenario.

## Evidence

Local artifacts (ignored by Git):
- `artifacts/browser-result.json`: passed, four screenshots, no console errors.
- `artifacts/browser-run.log`: completed scenario and successful cleanup.
- `artifacts/01-welcome.png`: application shell.
- `artifacts/02-note-editor.png`: rendered Markdown Note.
- `artifacts/03-project-board.png`: Project and related Task in In progress.
- `artifacts/04-mobile.png`: scoped search on 390px viewport.

Previously passed: 15 Mnemosyne backend tests, 88 Nexus tests, DOM UI tests,
and live gateway/shared-storage/reference/persistence smoke checks. Tonight's
frontend changes passed the DOM suite and the real-browser scenario. No unrelated
Nexus code changed during this final QA pass.
