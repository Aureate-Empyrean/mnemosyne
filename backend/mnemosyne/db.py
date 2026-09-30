import sqlite3
from contextlib import contextmanager
from pathlib import Path

MIGRATIONS = [
    """
CREATE TABLE workspaces(id TEXT PRIMARY KEY, title TEXT NOT NULL, timezone TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE resources(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id),
 kind TEXT NOT NULL CHECK(kind IN ('note','task','project','collection')), title TEXT NOT NULL,
 content TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'none',
 start_date TEXT, due_date TEXT, completed_at TEXT, daily_date TEXT,
 parent TEXT, project TEXT, related_note TEXT, board_column TEXT NOT NULL DEFAULT 'Backlog',
 icon TEXT NOT NULL DEFAULT '', accent TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0,
 trashed INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]', checklist TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace,daily_date));
CREATE INDEX scoped_resources ON resources(workspace,kind,trashed);
CREATE TABLE memberships(note TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 collection TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE, PRIMARY KEY(note,collection));
CREATE TABLE links(id TEXT PRIMARY KEY, source TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 target TEXT NOT NULL, readers TEXT NOT NULL DEFAULT '[]', remote_id TEXT,
 UNIQUE(source,target));
CREATE TABLE attachments(id TEXT PRIMARY KEY, resource TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 blob TEXT NOT NULL, name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL);
CREATE TABLE tombstones(id TEXT PRIMARY KEY, kind TEXT NOT NULL, workspace TEXT NOT NULL);
CREATE TABLE outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL,
 path TEXT NOT NULL, body TEXT, link_id TEXT);
""",
    """ALTER TABLE outbox ADD COLUMN next_attempt REAL NOT NULL DEFAULT 0;
    ALTER TABLE outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;""",
    """ALTER TABLE resources ADD COLUMN trashed_at TEXT;
    ALTER TABLE workspaces ADD COLUMN trash_retention_days INTEGER DEFAULT 30
      CHECK(trash_retention_days IS NULL OR trash_retention_days IN (7,14,30,60,90));
    UPDATE resources SET trashed_at=strftime('%Y-%m-%dT%H:%M:%f+00:00','now') WHERE trashed=1;
    CREATE INDEX trash_expiry ON resources(workspace,trashed,trashed_at);""",
]


class Database:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > len(MIGRATIONS):
                raise RuntimeError("Database is newer than this application")
            for i in range(version, len(MIGRATIONS)):
                db.executescript(
                    "BEGIN IMMEDIATE;\n" + MIGRATIONS[i] + f"\nPRAGMA user_version={i + 1}; COMMIT;"
                )

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()
