import base64
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import bleach
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from markdown_it import MarkdownIt
from pydantic import BaseModel, ConfigDict, Field
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from mnemosyne.db import MIGRATIONS, Database

ROOT = Path(__file__).resolve().parents[2]
REF = re.compile(
    r"^nexus:v1:([a-z][a-z0-9-]{0,47}):([a-z][a-z0-9-]{0,47}):([a-zA-Z0-9][a-zA-Z0-9._~-]{0,127})$"
)
MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\((nexus:v1:[^)\s]+)\)")
KINDS = {"note", "task", "project", "collection"}
VERSION = "1.1.0"
# Backup artifact: a consistent SQLite snapshot. Older schemas migrate forward on restore.
BACKUP_FORMAT = "mnemosyne-sqlite"
BACKUP_FORMAT_VERSION = 1
BACKUP_HEADER = "X-Empyrean-Backup-"
MAX_ARTIFACT = 256 * 1024 * 1024


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return str(uuid.uuid4())


def identity(r):
    return f"nexus:v1:mnemosyne:{r['kind']}:{r['id']}"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Workspace(Strict):
    title: str = Field(min_length=1, max_length=100)
    timezone: str = "Europe/Bratislava"
    archived: bool = False


class Resource(Strict):
    kind: str
    title: str = Field(default="Untitled", min_length=1, max_length=200)
    content: str = Field(default="", max_length=40000)
    status: str = "open"
    priority: str = "none"
    start_date: date | None = None
    due_date: date | None = None
    parent: str | None = None
    project: str | None = None
    related_note: str | None = None
    board_column: str = "Backlog"
    icon: str = Field(default="", max_length=8)
    accent: str = Field(default="", pattern=r"^(#[a-fA-F0-9]{6})?$")
    pinned: bool = False
    trashed: bool = False
    tags: list[str] = Field(default_factory=list, max_length=30)
    checklist: list[dict] = Field(default_factory=list, max_length=100)
    collections: list[str] = Field(default_factory=list, max_length=100)
    revision: int | None = None


class TrashPolicy(Strict):
    days: int | None = 30


class TrashAction(Strict):
    action: str
    ids: list[str] = Field(default_factory=list, max_length=1000)
    confirmed: bool = False


class Link(Strict):
    target: str
    readers: list[str] = Field(default_factory=list, max_length=32)


class Attachment(Strict):
    name: str = Field(min_length=1, max_length=200)
    media_type: str = Field(default="application/octet-stream", max_length=100)
    content: str = Field(max_length=1400000)


class Nexus:
    def request(self, method, path, body=None):
        with httpx.Client(timeout=4, trust_env=False) as client:
            response = client.request(
                method,
                os.environ["NEXUS_URL"] + "/api/v1/module" + path,
                headers={"Authorization": "Bearer " + os.environ["NEXUS_TOKEN"]},
                json=body,
            )
            response.raise_for_status()
            return response.json()


def create_app(data_dir=None, nexus=None, clock=None):
    clock = clock or (lambda: datetime.now(timezone.utc))
    db = Database(Path(data_dir or os.getenv("MNEMOSYNE_DATA", "/data")) / "mnemosyne.sqlite3")
    nexus = nexus or Nexus()
    stop = threading.Event()
    sync_lock = threading.Lock()

    suspended = db.path.parent / "purge-suspended"

    def retry(entry):
        with db.connect() as conn:
            conn.execute(
                "UPDATE outbox SET attempts=attempts+1,next_attempt=? WHERE id=?",
                (time.time() + min(300, 2 ** min(entry["attempts"] + 1, 8)), entry["id"]),
            )

    def flush(force=False):
        if not sync_lock.acquire(blocking=False):
            return
        try:
            with db.connect() as conn:
                entries = conn.execute(
                    "SELECT * FROM outbox WHERE next_attempt<=? ORDER BY id LIMIT 40",
                    (float("inf") if force else time.time(),),
                ).fetchall()
            for entry in entries:
                try:
                    result = nexus.request(
                        entry["method"],
                        entry["path"],
                        json.loads(entry["body"]) if entry["body"] else None,
                    )
                except httpx.HTTPStatusError as exc:
                    if entry["method"] == "DELETE" and exc.response.status_code == 404:
                        result = {}
                    else:
                        retry(entry)
                        continue
                except (httpx.HTTPError, KeyError, OSError):
                    retry(entry)
                    continue
                with db.connect() as conn:
                    if entry["link_id"] and result.get("reference"):
                        conn.execute(
                            "UPDATE links SET remote_id=? WHERE id=?",
                            (result["reference"]["id"], entry["link_id"]),
                        )
                    conn.execute("DELETE FROM outbox WHERE id=?", (entry["id"],))
        finally:
            sync_lock.release()

    def worker():
        last_cleanup = 0.0
        while not stop.wait(3):
            if time.monotonic() - last_cleanup >= 60:
                cleanup_trash()
                last_cleanup = time.monotonic()
            flush()

    @asynccontextmanager
    async def lifespan(app):
        cleanup_trash()
        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        yield
        stop.set()
        thread.join(timeout=5)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.db = db
    app.state.flush = flush

    @app.middleware("http")
    async def trusted_gateway(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            key = os.getenv("NEXUS_RESOLVER_KEY", "")
            if not key or not secrets.compare_digest(
                request.headers.get("x-nexus-gateway-key", ""), key
            ):
                return JSONResponse({"detail": "Nexus gateway required"}, status_code=403)
        return await call_next(request)

    def workspace(conn, wid, writable=False):
        row = conn.execute("SELECT * FROM workspaces WHERE id=?", (wid,)).fetchone()
        if not row:
            raise HTTPException(404, "Workspace not found")
        if writable and row["archived"]:
            raise HTTPException(409, "Restore this Workspace before editing")
        return row

    def resource(conn, wid, rid, kind=None):
        workspace(conn, wid)
        row = conn.execute(
            "SELECT * FROM resources WHERE workspace=? AND id=?", (wid, rid)
        ).fetchone()
        if not row or (kind and row["kind"] != kind):
            raise HTTPException(404, "Resource not found in this Workspace")
        return row

    def encode(conn, row):
        value = dict(row)
        for key in ("tags", "checklist"):
            value[key] = json.loads(value[key])
        value["collections"] = [
            r[0]
            for r in conn.execute("SELECT collection FROM memberships WHERE note=?", (row["id"],))
        ]
        value["reference"] = identity(row)
        return value

    def queue(conn, method, path, body=None, link_id=None):
        conn.execute(
            "INSERT INTO outbox(method,path,body,link_id) VALUES(?,?,?,?)",
            (method, path, json.dumps(body) if body is not None else None, link_id),
        )

    def activity(conn, rid, operation):
        queue(
            conn,
            "POST",
            "/events",
            {
                "type": "mnemosyne.resource.changed",
                "payload": {"resource_id": rid, "operation": operation},
            },
        )

    def validate(conn, wid, body, rid=None):
        if body.kind not in KINDS:
            raise HTTPException(422, "Unknown resource type")
        allowed = {
            "task": {"open", "completed", "cancelled"},
            "project": {"active", "on-hold", "completed", "archived"},
            "note": {"open"},
            "collection": {"open"},
        }
        if body.status not in allowed[body.kind] or body.priority not in {
            "none",
            "low",
            "medium",
            "high",
            "urgent",
        }:
            raise HTTPException(422, "Invalid lifecycle or priority")
        if body.board_column not in {"Backlog", "In progress", "Review", "Done"}:
            raise HTTPException(422, "Unknown board column")
        if any(len(t) > 50 or not t.strip() for t in body.tags):
            raise HTTPException(422, "Tags must be 1–50 characters")
        for item in body.checklist:
            if (
                set(item) != {"text", "done"}
                or not isinstance(item["text"], str)
                or len(item["text"]) > 500
                or not isinstance(item["done"], bool)
            ):
                raise HTTPException(422, "Checklist items require text and done")
        for key, kind in [
            ("project", "project"),
            ("related_note", "note"),
            ("parent", "collection"),
        ]:
            target = getattr(body, key)
            if target:
                r = resource(conn, wid, target, kind)
                previous = resource(conn, wid, rid) if rid else None
                if r["trashed"] and (not previous or previous[key] != target):
                    raise HTTPException(422, "Cannot link a trashed resource")
        if body.parent:
            if body.kind != "collection":
                raise HTTPException(422, "Only Collections have a parent")
            current = body.parent
            while current:
                if current == rid:
                    raise HTTPException(422, "Collection hierarchy cannot contain a cycle")
                current = resource(conn, wid, current, "collection")["parent"]
        if body.collections and body.kind != "note":
            raise HTTPException(422, "Collections organize Notes")
        for cid in body.collections:
            resource(conn, wid, cid, "collection")
        for ref in MARKDOWN_LINK.findall(body.content):
            check_target(conn, wid, ref)

    def check_target(conn, wid, target):
        match = REF.fullmatch(target)
        if not match:
            raise HTTPException(422, "Invalid canonical resource reference")
        if match[1] == "mnemosyne":
            local = conn.execute(
                "SELECT 1 FROM resources WHERE id=? AND workspace=? AND kind=?",
                (match[3], wid, match[2]),
            ).fetchone()
            deleted = conn.execute(
                "SELECT 1 FROM tombstones WHERE id=? AND workspace=? AND kind=?",
                (match[3], wid, match[2]),
            ).fetchone()
            if not local and not deleted:
                raise HTTPException(404, "Resource not found in this Workspace")
        return match

    def add_link(conn, wid, source, target, readers):
        check_target(conn, wid, target)
        if any(not re.fullmatch(r"[a-z][a-z0-9-]{0,47}", x) for x in readers):
            raise HTTPException(422, "Invalid reader module")
        old = conn.execute(
            "SELECT * FROM links WHERE source=? AND target=?", (source["id"], target)
        ).fetchone()
        lid = old["id"] if old else uid()
        conn.execute(
            "INSERT INTO links(id,source,target,readers) VALUES(?,?,?,?) ON CONFLICT(source,target) DO UPDATE SET readers=excluded.readers",
            (lid, source["id"], target, json.dumps(readers)),
        )
        conn.execute("DELETE FROM outbox WHERE link_id=?", (lid,))
        queue(
            conn,
            "POST",
            "/references",
            {
                "source": identity(source),
                "target": target,
                "relation": "mnemosyne.related",
                "readers": readers,
            },
            lid,
        )
        return lid

    def save(conn, wid, body, rid=None, daily=None):
        if not conn.in_transaction:
            conn.execute("BEGIN IMMEDIATE")
        workspace(conn, wid, True)
        old = resource(conn, wid, rid) if rid else None
        if old and (body.kind != old["kind"] or body.revision != old["revision"]):
            raise HTTPException(
                409, "Resource changed. Reload before saving to avoid overwriting edits."
            )
        validate(conn, wid, body, rid)
        rid = rid or uid()
        values = body.model_dump(mode="json", exclude={"collections", "revision"})
        values["tags"] = json.dumps(list(dict.fromkeys(body.tags)))
        values["checklist"] = json.dumps(body.checklist)
        values.update(
            trashed_at=(old["trashed_at"] if old and old["trashed"] else clock().isoformat())
            if body.trashed
            else None,
            updated_at=now(),
            revision=old["revision"] + 1 if old else 1,
            completed_at=(old["completed_at"] if old and old["completed_at"] else now())
            if body.status == "completed"
            else None,
        )
        if old:
            conn.execute(
                "UPDATE resources SET "
                + ",".join(k + "=?" for k in values)
                + " WHERE id=? AND workspace=?",
                (*values.values(), rid, wid),
            )
        else:
            values.update(id=rid, workspace=wid, created_at=now(), daily_date=daily)
            conn.execute(
                "INSERT INTO resources("
                + ",".join(values)
                + ") VALUES("
                + ",".join("?" for _ in values)
                + ")",
                tuple(values.values()),
            )
        conn.execute("DELETE FROM memberships WHERE note=?", (rid,))
        conn.executemany(
            "INSERT INTO memberships(note,collection) VALUES(?,?)",
            [(rid, c) for c in set(body.collections)],
        )
        row = resource(conn, wid, rid)
        for target in set(MARKDOWN_LINK.findall(body.content)):
            if not conn.execute(
                "SELECT 1 FROM links WHERE source=? AND target=?", (rid, target)
            ).fetchone():
                add_link(conn, wid, row, target, [])
        if not old or any(old[k] != values[k] for k in ("title", "status", "trashed", "project")):
            activity(conn, rid, "created" if not old else "updated")
        return encode(conn, row)

    @app.get("/health")
    def health():
        with db.connect() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "version": VERSION}

    @app.get("/api/workspaces")
    def workspaces():
        with db.connect() as conn:
            return [dict(r) for r in conn.execute("SELECT * FROM workspaces ORDER BY created_at")]

    @app.post("/api/workspaces", status_code=201)
    def create_workspace(body: Workspace):
        try:
            ZoneInfo(body.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(422, "Unknown timezone")
        wid = uid()
        with db.connect() as conn:
            conn.execute(
                "INSERT INTO workspaces(id,title,timezone,archived,created_at) VALUES(?,?,?,?,?)",
                (wid, body.title, body.timezone, body.archived, now()),
            )
        return {"id": wid}

    @app.put("/api/workspaces/{wid}")
    def update_workspace(wid: str, body: Workspace):
        try:
            ZoneInfo(body.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(422, "Unknown timezone")
        with db.connect() as conn:
            workspace(conn, wid)
            conn.execute(
                "UPDATE workspaces SET title=?,timezone=?,archived=? WHERE id=?",
                (body.title, body.timezone, body.archived, wid),
            )
        return {"id": wid}

    @app.post("/api/workspaces/{wid}/open")
    def open_workspace(wid: str):
        with db.connect() as conn:
            workspace(conn, wid)
            conn.execute("UPDATE workspaces SET opened_at=? WHERE id=?", (now(), wid))
        return {"id": wid}

    @app.get("/api/w/{wid}/resources")
    def listing(
        wid: str,
        q: str = "",
        kind: str = "",
        view: str = "",
        project: str = "",
        collection: str = "",
    ):
        with db.connect() as conn:
            ws = workspace(conn, wid)
            today = datetime.now(ZoneInfo(ws["timezone"])).date().isoformat()
            sql = "SELECT * FROM resources WHERE workspace=? AND trashed=?"
            args = [wid, int(view == "trash")]
            for key, value in [("kind", kind), ("project", project)]:
                if value:
                    sql += f" AND {key}=?"
                    args.append(value)
            if collection:
                resource(conn, wid, collection, "collection")
                sql += " AND id IN (SELECT note FROM memberships WHERE collection=?)"
                args.append(collection)
            if q:
                sql += " AND (instr(lower(title),lower(?))>0 OR instr(lower(content),lower(?))>0 OR instr(lower(tags),lower(?))>0)"
                args += [q, q, q]
            if view == "completed":
                sql += " AND kind='task' AND status='completed'"
            if view in {"today", "upcoming", "overdue", "inbox"}:
                sql += " AND kind='task' AND status='open'"
                if view == "inbox":
                    sql += " AND project IS NULL"
                elif view == "today":
                    sql += " AND (due_date=? OR start_date=?)"
                    args += [today, today]
                elif view == "upcoming":
                    sql += " AND (due_date>? OR start_date>?)"
                    args += [today, today]
                else:
                    sql += " AND due_date<?"
                    args.append(today)
            return [
                encode(conn, r)
                for r in conn.execute(sql + " ORDER BY pinned DESC,updated_at DESC", args)
            ]

    @app.post("/api/w/{wid}/resources", status_code=201)
    def create_resource(wid: str, body: Resource):
        with db.connect() as conn:
            return save(conn, wid, body)

    @app.get("/api/w/{wid}/resources/{rid}")
    def read_resource(wid: str, rid: str):
        with db.connect() as conn:
            row = resource(conn, wid, rid)
            result = encode(conn, row)
            result["attachments"] = [
                dict(r) for r in conn.execute("SELECT * FROM attachments WHERE resource=?", (rid,))
            ]
            result["links"] = [
                dict(r) for r in conn.execute("SELECT * FROM links WHERE source=?", (rid,))
            ]
            result["backlinks"] = [
                encode(conn, r)
                for r in conn.execute(
                    "SELECT r.* FROM resources r JOIN links l ON l.source=r.id WHERE r.workspace=? AND l.target=? AND r.trashed=0",
                    (wid, identity(row)),
                )
            ]
            return result

    @app.put("/api/w/{wid}/resources/{rid}")
    def update_resource(wid: str, rid: str, body: Resource):
        with db.connect() as conn:
            return save(conn, wid, body, rid)

    def permanently_delete(conn, wid, row):
        rid = row["id"]
        if not row["trashed"]:
            raise HTTPException(409, "Move resource to Trash first")
        # Keep surviving work and references; detach only organizational relationships.
        conn.execute(
            "UPDATE resources SET revision=revision+1, updated_at=? WHERE workspace=? "
            "AND id IN (SELECT note FROM memberships WHERE collection=?)",
            (now(), wid, rid),
        )
        for key in ("parent", "project", "related_note"):
            conn.execute(
                f"UPDATE resources SET {key}=NULL, revision=revision+1, updated_at=? "
                f"WHERE workspace=? AND {key}=?",
                (now(), wid, rid),
            )
        conn.execute(
            "DELETE FROM outbox WHERE link_id IN (SELECT id FROM links WHERE source=?)", (rid,)
        )
        # The source is gone, so its edges leave the Nexus index too.
        for link in conn.execute(
            "SELECT remote_id FROM links WHERE source=? AND remote_id IS NOT NULL", (rid,)
        ).fetchall():
            queue(conn, "DELETE", "/references/" + link["remote_id"])
        conn.execute("INSERT INTO tombstones VALUES(?,?,?)", (rid, row["kind"], wid))
        conn.execute("DELETE FROM resources WHERE id=? AND workspace=?", (rid, wid))
        activity(conn, rid, "deleted")

    def cleanup_trash():
        if suspended.exists():
            return 0  # A restore is awaiting finalize; restored timestamps must not purge.
        deleted = 0
        instant = clock()
        with db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            for ws in conn.execute(
                "SELECT * FROM workspaces WHERE trash_retention_days IS NOT NULL"
            ).fetchall():
                cutoff = instant - timedelta(days=ws["trash_retention_days"])
                rows = conn.execute(
                    "SELECT * FROM resources WHERE workspace=? AND trashed=1 AND trashed_at IS NOT NULL",
                    (ws["id"],),
                ).fetchall()
                for row in rows:
                    if datetime.fromisoformat(row["trashed_at"]) <= cutoff:
                        permanently_delete(conn, ws["id"], row)
                        deleted += 1
        return deleted

    app.state.cleanup_trash = cleanup_trash

    @app.get("/api/w/{wid}/trash/policy")
    def trash_policy(wid: str):
        with db.connect() as conn:
            return {"days": workspace(conn, wid)["trash_retention_days"]}

    @app.put("/api/w/{wid}/trash/policy")
    def set_trash_policy(wid: str, body: TrashPolicy):
        if body.days not in (None, 7, 14, 30, 60, 90):
            raise HTTPException(422, "Choose Never, 7, 14, 30, 60 or 90 days")
        with db.connect() as conn:
            workspace(conn, wid, True)
            conn.execute(
                "UPDATE workspaces SET trash_retention_days=? WHERE id=?", (body.days, wid)
            )
        return {"days": body.days}

    @app.post("/api/w/{wid}/trash")
    def trash_action(wid: str, body: TrashAction):
        if body.action not in ("restore", "delete", "empty"):
            raise HTTPException(422, "Unknown Trash action")
        if body.action != "restore" and not body.confirmed:
            raise HTTPException(422, "Explicit confirmation required")
        if body.action != "empty" and not body.ids:
            raise HTTPException(422, "Select items first")
        with db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            workspace(conn, wid, True)
            rows = (
                conn.execute(
                    "SELECT * FROM resources WHERE workspace=? AND trashed=1", (wid,)
                ).fetchall()
                if body.action == "empty"
                else [resource(conn, wid, rid) for rid in set(body.ids)]
            )
            if any(not row["trashed"] for row in rows):
                raise HTTPException(409, "Only items in Trash can be restored or deleted")
            for row in rows:
                if body.action == "restore":
                    conn.execute(
                        "UPDATE resources SET trashed=0,trashed_at=NULL,revision=revision+1,updated_at=? WHERE workspace=? AND id=?",
                        (now(), wid, row["id"]),
                    )
                    activity(conn, row["id"], "restored")
                else:
                    permanently_delete(conn, wid, row)
        return {"affected": len(rows)}

    @app.delete("/api/w/{wid}/resources/{rid}")
    def delete_resource(wid: str, rid: str, confirmed: bool = False):
        trash_action(wid, TrashAction(action="delete", ids=[rid], confirmed=confirmed))
        return {"deleted": True}

    @app.post("/api/w/{wid}/daily/{day}")
    def daily(wid: str, day: date):
        with db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            workspace(conn, wid)
            row = conn.execute(
                "SELECT * FROM resources WHERE workspace=? AND daily_date=?", (wid, day.isoformat())
            ).fetchone()
            if row:
                return encode(conn, row)
            return save(
                conn, wid, Resource(kind="note", title=day.isoformat()), daily=day.isoformat()
            )

    @app.post("/api/w/{wid}/resources/{rid}/links")
    def link(wid: str, rid: str, body: Link):
        with db.connect() as conn:
            workspace(conn, wid, True)
            lid = add_link(conn, wid, resource(conn, wid, rid), body.target, body.readers)
        return {"id": lid}

    @app.delete("/api/w/{wid}/resources/{rid}/links/{lid}")
    def unlink(wid: str, rid: str, lid: str):
        flush(force=True)
        with sync_lock, db.connect() as conn:
            workspace(conn, wid, True)
            resource(conn, wid, rid)
            row = conn.execute("SELECT * FROM links WHERE id=? AND source=?", (lid, rid)).fetchone()
            if not row:
                raise HTTPException(404, "Link not found")
            if row["remote_id"]:
                queue(conn, "DELETE", "/references/" + row["remote_id"])
            conn.execute("DELETE FROM outbox WHERE link_id=?", (lid,))
            conn.execute("DELETE FROM links WHERE id=?", (lid,))
        return {"deleted": True}

    @app.get("/api/w/{wid}/resources/{rid}/references")
    def references(wid: str, rid: str, direction: str = "incoming", after: int = 0):
        with db.connect() as conn:
            row = resource(conn, wid, rid)
            ref = identity(row)
        if direction not in {"incoming", "outgoing"}:
            raise HTTPException(422, "Invalid direction")
        try:
            result = nexus.request(
                "GET", f"/references?resource={ref}&direction={direction}&after={after}&limit=100"
            )
        except httpx.HTTPError:
            raise HTTPException(502, "Nexus reference index unavailable")
        with db.connect() as conn:
            filtered = []
            for edge in result["references"]:
                other = edge["source"] if direction == "incoming" else edge["target"]
                match = REF.fullmatch(other)
                if match and match[1] == "mnemosyne":
                    local = conn.execute(
                        "SELECT 1 FROM resources WHERE id=? AND workspace=?", (match[3], wid)
                    ).fetchone()
                    if not local:
                        continue
                filtered.append(edge)
            result["references"] = filtered
        return result

    @app.post("/api/w/{wid}/resolve")
    def resolve(wid: str, body: Link):
        with db.connect() as conn:
            workspace(conn, wid)
            match = check_target(conn, wid, body.target)
            if match[1] == "mnemosyne":
                if conn.execute(
                    "SELECT 1 FROM tombstones WHERE id=? AND workspace=?", (match[3], wid)
                ).fetchone():
                    return {"resource": body.target, "availability": "deleted"}
                r = resource(conn, wid, match[3], match[2])
                return {
                    "resource": body.target,
                    "label": r["title"],
                    "availability": "deleted" if r["trashed"] else "available",
                }
        try:
            return nexus.request("POST", "/resources/resolve", {"resource": body.target})
        except httpx.HTTPError:
            return {"resource": body.target, "availability": "unavailable_or_not_granted"}

    def require_resolver(request):
        key = os.getenv("NEXUS_RESOLVER_KEY", "")
        if not key or not secrets.compare_digest(
            request.headers.get("x-nexus-resolver-key", ""), key
        ):
            raise HTTPException(403, "Resolver authentication required")

    @app.post("/empyrean/v1/resources/resolve")
    def protocol_resolve(body: dict, request: Request):
        require_resolver(request)
        match = REF.fullmatch(body.get("resource", ""))
        if not match or match[1] != "mnemosyne":
            raise HTTPException(404, "Not found")
        with db.connect() as conn:
            row = conn.execute(
                "SELECT * FROM resources WHERE id=? AND kind=?", (match[3], match[2])
            ).fetchone()
            if not row:
                raise HTTPException(
                    410
                    if conn.execute("SELECT 1 FROM tombstones WHERE id=?", (match[3],)).fetchone()
                    else 404,
                    "Unavailable",
                )
            # Resolver requests carry no Workspace; only explicitly shared sources disclose metadata.
            grants = conn.execute(
                "SELECT readers FROM links WHERE source=?", (row["id"],)
            ).fetchall()
            if not any(body.get("requester") in json.loads(g[0]) for g in grants):
                raise HTTPException(403, "Resource has not been shared with requester")
            if row["trashed"]:
                raise HTTPException(410, "Deleted")
            return {
                "resource": body["resource"],
                "label": row["title"],
                "open_path": f"/w/{row['workspace']}/r/{row['id']}",
            }

    @app.get("/empyrean/v1/references/outgoing")
    def outgoing(request: Request, limit: int = 200, cursor: str = ""):
        """Complete authoritative set of edges this module publishes to the Nexus index."""
        require_resolver(request)
        limit = max(1, min(limit, 200))
        with db.connect() as conn:
            rows = conn.execute(
                "SELECT l.id,l.target,l.readers,r.id AS rid,r.kind FROM links l "
                "JOIN resources r ON r.id=l.source WHERE l.id>? ORDER BY l.id LIMIT ?",
                (cursor, limit + 1),
            ).fetchall()
        page = rows[:limit]
        return {
            "references": [
                {
                    "source": identity({"kind": r["kind"], "id": r["rid"]}),
                    "target": r["target"],
                    "relation": "mnemosyne.related",
                    "metadata": {},
                    "readers": json.loads(r["readers"]),
                }
                for r in page
            ],
            "next_cursor": page[-1]["id"] if len(rows) > limit else None,
        }

    async def receive_artifact(request):
        """Stream an artifact into the data volume; /tmp is too small for real backups."""
        path = db.path.parent / f"restore-{uid()}.part"
        size = 0
        try:
            with open(path, "wb") as out:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > MAX_ARTIFACT:
                        raise HTTPException(413, "Backup artifact exceeds 256 MiB")
                    out.write(chunk)
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return path

    def check_artifact(request, path):
        """Raises unless the artifact is a Mnemosyne snapshot this version can migrate."""
        headers = {
            k[len(BACKUP_HEADER) :].lower(): v
            for k, v in request.headers.items()
            if k.lower().startswith(BACKUP_HEADER.lower())
        }
        if headers.get("module") != "mnemosyne" or headers.get("format") != BACKUP_FORMAT:
            raise ValueError("Not a Mnemosyne backup")
        if headers.get("format-version") != str(BACKUP_FORMAT_VERSION):
            raise ValueError("Unsupported backup format version")
        try:
            snapshot = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        except sqlite3.Error as exc:
            raise ValueError("Backup is not a readable database") from exc
        try:
            if snapshot.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Backup database is damaged")
            if snapshot.execute("PRAGMA foreign_key_check").fetchone():
                raise ValueError("Backup database has broken relationships")
            schema = snapshot.execute("PRAGMA user_version").fetchone()[0]
            if not 1 <= schema <= len(MIGRATIONS):
                raise ValueError("Backup schema is not supported by this version")
            tables = {
                r[0] for r in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
            if not {"workspaces", "resources", "links", "attachments"} <= tables:
                raise ValueError("Backup is missing Mnemosyne data")
        except sqlite3.Error as exc:
            raise ValueError("Backup is not a readable database") from exc
        finally:
            snapshot.close()

    @app.post("/empyrean/v1/backup/export")
    def backup_export(request: Request):
        require_resolver(request)
        path = db.path.parent / f"export-{uid()}.part"
        try:
            target = sqlite3.connect(path)
            with db.connect() as conn:
                conn.backup(target)  # consistent snapshot, safe while the app is running
            target.execute("PRAGMA journal_mode=DELETE")  # one self-contained file
            target.close()
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return FileResponse(
            path,
            media_type="application/octet-stream",
            background=BackgroundTask(path.unlink, missing_ok=True),
            headers={
                BACKUP_HEADER + "Module": "mnemosyne",
                BACKUP_HEADER + "Module-Version": VERSION,
                BACKUP_HEADER + "Format": BACKUP_FORMAT,
                BACKUP_HEADER + "Format-Version": str(BACKUP_FORMAT_VERSION),
                BACKUP_HEADER + "Created-At": clock().isoformat(),
                BACKUP_HEADER + "Restorable-By": f">={VERSION},<2",
            },
        )

    @app.post("/empyrean/v1/backup/validate")
    async def backup_validate(request: Request):
        require_resolver(request)
        path = await receive_artifact(request)
        try:
            await run_in_threadpool(check_artifact, request, path)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        finally:
            path.unlink(missing_ok=True)
        return {"valid": True}

    def replace_data(path):
        # Suspend purges first and durably: a crash before finalize must not purge restored Trash.
        suspended.write_text(clock().isoformat())
        with sync_lock:
            snapshot = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            try:
                with db.connect() as conn:
                    snapshot.backup(conn)
            finally:
                snapshot.close()
            db.migrate()
            with db.connect() as conn:
                # Pending calls describe the pre-restore state. Re-publish every edge instead;
                # Nexus upserts them and returns current reference IDs for later unlinking.
                conn.execute("DELETE FROM outbox")
                for link in conn.execute(
                    "SELECT l.*,r.kind FROM links l JOIN resources r ON r.id=l.source"
                ).fetchall():
                    queue(
                        conn,
                        "POST",
                        "/references",
                        {
                            "source": identity({"kind": link["kind"], "id": link["source"]}),
                            "target": link["target"],
                            "relation": "mnemosyne.related",
                            "readers": json.loads(link["readers"]),
                        },
                        link["id"],
                    )

    @app.post("/empyrean/v1/backup/restore")
    async def backup_restore(request: Request):
        require_resolver(request)
        path = await receive_artifact(request)
        try:
            try:
                await run_in_threadpool(check_artifact, request, path)
            except ValueError as exc:
                raise HTTPException(422, str(exc))
            await run_in_threadpool(replace_data, path)
        finally:
            path.unlink(missing_ok=True)
        return {"restored": True}

    @app.post("/empyrean/v1/backup/finalize")
    def backup_finalize(request: Request):
        require_resolver(request)
        instant = clock()
        with db.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            # Trash that expired while it sat in the backup gets a fresh retention period.
            for ws in conn.execute(
                "SELECT * FROM workspaces WHERE trash_retention_days IS NOT NULL"
            ).fetchall():
                cutoff = instant - timedelta(days=ws["trash_retention_days"])
                for row in conn.execute(
                    "SELECT id,trashed_at FROM resources WHERE workspace=? AND trashed=1 "
                    "AND trashed_at IS NOT NULL",
                    (ws["id"],),
                ).fetchall():
                    if datetime.fromisoformat(row["trashed_at"]) <= cutoff:
                        conn.execute(
                            "UPDATE resources SET trashed_at=? WHERE id=?",
                            (instant.isoformat(), row["id"]),
                        )
        suspended.unlink(missing_ok=True)
        return {"finalized": True}

    @app.post("/api/w/{wid}/resources/{rid}/attachments")
    def attach(wid: str, rid: str, body: Attachment):
        with db.connect() as conn:
            workspace(conn, wid, True)
            resource(conn, wid, rid)
        try:
            raw = base64.b64decode(body.content, validate=True)
        except ValueError:
            raise HTTPException(422, "Invalid file encoding")
        if len(raw) > 1024 * 1024:
            raise HTTPException(413, "Attachment limit is 1 MiB")
        try:
            blob = nexus.request("POST", "/blobs", {"content": body.content})
        except httpx.HTTPError:
            raise HTTPException(502, "Shared storage unavailable")
        aid = uid()
        with db.connect() as conn:
            resource(conn, wid, rid)
            conn.execute(
                "INSERT INTO attachments VALUES(?,?,?,?,?,?)",
                (aid, rid, blob["id"], body.name, body.media_type, len(raw)),
            )
        return {"id": aid}

    @app.get("/api/w/{wid}/resources/{rid}/attachments/{aid}")
    def attachment(wid: str, rid: str, aid: str):
        with db.connect() as conn:
            resource(conn, wid, rid)
            row = conn.execute(
                "SELECT * FROM attachments WHERE id=? AND resource=?", (aid, rid)
            ).fetchone()
            if not row:
                raise HTTPException(404, "Attachment not found")
        try:
            return {**dict(row), **nexus.request("GET", "/blobs/" + row["blob"])}
        except httpx.HTTPError:
            raise HTTPException(502, "Shared storage unavailable")

    @app.delete("/api/w/{wid}/resources/{rid}/attachments/{aid}")
    def detach(wid: str, rid: str, aid: str):
        with db.connect() as conn:
            workspace(conn, wid, True)
            resource(conn, wid, rid)
            conn.execute("DELETE FROM attachments WHERE resource=? AND id=?", (rid, aid))
        return {"deleted": True}

    @app.post("/api/preview")
    def preview(body: dict):
        content = body.get("content", "")
        if not isinstance(content, str) or len(content) > 40000:
            raise HTTPException(422, "Invalid content")
        rendered = MarkdownIt("commonmark", {"html": False}).enable("table").render(content)
        return {
            "html": bleach.clean(
                rendered,
                tags={
                    "p",
                    "br",
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                    "h5",
                    "h6",
                    "em",
                    "strong",
                    "s",
                    "blockquote",
                    "pre",
                    "code",
                    "ul",
                    "ol",
                    "li",
                    "hr",
                    "a",
                    "table",
                    "thead",
                    "tbody",
                    "tr",
                    "th",
                    "td",
                },
                attributes={"a": ["href", "title"], "code": ["class"]},
                protocols={"http", "https", "mailto", "nexus"},
            )
        }

    @app.get("/api/w/{wid}/export")
    def export(wid: str):
        with db.connect() as conn:
            ws = workspace(conn, wid)
            rows = conn.execute("SELECT * FROM resources WHERE workspace=?", (wid,)).fetchall()
            return {
                "format": "mnemosyne-workspace",
                "version": 1,
                "workspace": dict(ws),
                "resources": [encode(conn, r) for r in rows],
                "links": [
                    dict(r)
                    for r in conn.execute(
                        "SELECT l.* FROM links l JOIN resources r ON r.id=l.source WHERE r.workspace=?",
                        (wid,),
                    )
                ],
                "attachments": [
                    dict(r)
                    for r in conn.execute(
                        "SELECT a.* FROM attachments a JOIN resources r ON r.id=a.resource WHERE r.workspace=?",
                        (wid,),
                    )
                ],
            }

    @app.post("/api/sync")
    def retry_sync():
        flush(force=True)
        return sync_status()

    @app.get("/api/sync")
    def sync_status():
        with db.connect() as conn:
            return {"pending": conn.execute("SELECT count(*) FROM outbox").fetchone()[0]}

    @app.get("/{path:path}", response_class=HTMLResponse)
    def ui(path: str):
        catalogs = {}
        for directory in (ROOT / "frontend/locales", db.path.parent / "locales"):
            if directory.exists():
                for file in directory.glob("*.json"):
                    if not re.fullmatch(r"[a-z]{2,3}(-[A-Za-z0-9]{2,8})?", file.stem):
                        continue
                    try:
                        messages = json.loads(file.read_text())
                    except (ValueError, OSError):
                        continue
                    if isinstance(messages, dict) and all(
                        isinstance(v, str) for v in messages.values()
                    ):
                        catalogs[file.stem] = {**catalogs.get(file.stem, {}), **messages}
        script = (
            (ROOT / "frontend/app.js")
            .read_text()
            .replace("/*CATALOGS*/ {}", json.dumps(catalogs).replace("<", "\\u003c"))
        )
        html = (ROOT / "frontend/index.html").read_text()
        return html.replace("/*STYLE*/", (ROOT / "frontend/style.css").read_text()).replace(
            "/*SCRIPT*/", script
        )

    return app
