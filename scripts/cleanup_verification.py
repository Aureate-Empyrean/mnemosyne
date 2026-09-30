"""Run inside Mnemosyne with this run's verification Workspace IDs on stdin."""

import json
import sqlite3
import sys

ids = json.load(sys.stdin)
conn = sqlite3.connect("/data/mnemosyne.sqlite3")
conn.execute("PRAGMA foreign_keys=ON")
with conn:
    for wid in ids:
        row = conn.execute("SELECT title FROM workspaces WHERE id=?", (wid,)).fetchone()
        assert row and row[0].startswith(
            ("QA ", "Personal verification ", "Work verification ", "Completed verification ")
        )
        conn.execute(
            "DELETE FROM outbox WHERE link_id IN (SELECT l.id FROM links l JOIN resources r ON l.source=r.id WHERE r.workspace=?)",
            (wid,),
        )
        conn.execute("DELETE FROM resources WHERE workspace=?", (wid,))
        conn.execute("DELETE FROM tombstones WHERE workspace=?", (wid,))
        conn.execute("DELETE FROM workspaces WHERE id=?", (wid,))
print("Removed only the recorded verification Workspaces.")
