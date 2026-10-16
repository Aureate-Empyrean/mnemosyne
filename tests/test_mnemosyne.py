import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient
from mnemosyne.app import create_app

KEY = "test-gateway-key-with-at-least-32-chars"


class SharedServices:
    def __init__(self):
        self.calls = []
        self.blobs = {}
        self.fail = False
        self.gone = False

    def request(self, method, path, body=None):
        if self.fail:
            raise httpx.ConnectError("offline")
        self.calls.append((method, path, body))
        if method == "DELETE" and self.gone:
            request = httpx.Request(method, "http://nexus" + path)
            raise httpx.HTTPStatusError(
                "gone", request=request, response=httpx.Response(404, request=request)
            )
        if path == "/blobs":
            self.blobs["blob"] = body["content"]
            return {"id": "blob"}
        if path.startswith("/blobs/"):
            return {"content": self.blobs["blob"]}
        if path == "/references":
            return {"reference": {"id": "remote-id"}}
        if path.startswith("/references?"):
            return {"references": [], "has_more": False, "next_cursor": 0}
        return {}


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("NEXUS_RESOLVER_KEY", KEY)
    nexus = SharedServices()
    app = create_app(tmp_path, nexus)
    with TestClient(app, headers={"X-Nexus-Gateway-Key": KEY}) as c:
        a = c.post("/api/workspaces", json={"title": "Personal"}).json()["id"]
        b = c.post("/api/workspaces", json={"title": "Work"}).json()["id"]
        yield c, app, nexus, a, b, tmp_path


def make(c, w, kind="note", **values):
    body = {
        "kind": kind,
        "title": kind.title(),
        "status": "active" if kind == "project" else "open",
        **values,
    }
    response = c.post(f"/api/w/{w}/resources", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def update(c, w, r, **values):
    keys = {
        "kind",
        "title",
        "content",
        "status",
        "priority",
        "start_date",
        "due_date",
        "parent",
        "project",
        "related_note",
        "board_column",
        "icon",
        "accent",
        "pinned",
        "trashed",
        "tags",
        "checklist",
        "collections",
        "revision",
    }
    return c.put(
        f"/api/w/{w}/resources/{r['id']}",
        json={**{k: v for k, v in r.items() if k in keys}, **values},
    )


def test_gateway_authentication(env):
    c, *_ = env
    assert c.get("/api/workspaces", headers={"X-Nexus-Gateway-Key": ""}).status_code == 403
    assert c.get("/health").status_code == 200


def test_workspace_isolation_every_relationship(env):
    c, app, nexus, a, b, _ = env
    note = make(c, a, title="Private needle", content="private searchable content")
    project = make(c, a, "project")
    collection = make(c, a, "collection")
    for route in [
        f"/resources/{note['id']}",
        f"/resources/{note['id']}/references",
        f"/resources/{note['id']}/attachments/unknown",
    ]:
        assert c.get(f"/api/w/{b}" + route).status_code == 404
    assert c.get(f"/api/w/{b}/resources?q=private").json() == []
    assert update(c, b, note, title="intrusion").status_code == 404
    for extra in [
        {"project": project["id"]},
        {"related_note": note["id"]},
        {"collections": [collection["id"]]},
        {"content": f"[leak]({note['reference']})"},
    ]:
        assert c.post(f"/api/w/{b}/resources", json={"kind": "note", **extra}).status_code == 404
    local = make(c, b)
    assert (
        c.post(
            f"/api/w/{b}/resources/{local['id']}/links", json={"target": note["reference"]}
        ).status_code
        == 404
    )
    assert c.post(f"/api/w/{b}/resolve", json={"target": note["reference"]}).status_code == 404
    assert c.get(f"/api/w/{b}/export").json()["resources"][0]["id"] == local["id"]


def test_autosave_conflict_and_persistence(env):
    c, app, nexus, a, b, path = env
    note = make(c, a, content="first")
    changed = update(c, a, note, content="second")
    assert changed.status_code == 200
    assert update(c, a, note, content="stale").status_code == 409
    other = create_app(path, nexus)
    with TestClient(other, headers={"X-Nexus-Gateway-Key": KEY}) as client:
        assert client.get(f"/api/w/{a}/resources/{note['id']}").json()["content"] == "second"


def test_daily_notes_are_unique_under_concurrency(env):
    c, app, nexus, a, b, _ = env
    with ThreadPoolExecutor(max_workers=5) as pool:
        rows = list(pool.map(lambda _: c.post(f"/api/w/{a}/daily/2026-09-29").json(), range(8)))
    assert len({r["id"] for r in rows}) == 1
    assert c.post(f"/api/w/{b}/daily/2026-09-29").json()["id"] != rows[0]["id"]


def test_tasks_dates_checklists_and_independent_board(env):
    c, app, nexus, a, b, _ = env
    today = datetime.now(ZoneInfo("Europe/Bratislava")).date()
    task = make(
        c,
        a,
        "task",
        due_date=str(today),
        start_date=str(today - timedelta(days=2)),
        priority="urgent",
        checklist=[{"text": "Step", "done": False}],
        board_column="Done",
    )
    assert task["status"] == "open" and task["completed_at"] is None
    assert c.get(f"/api/w/{a}/resources?view=today").json()[0]["id"] == task["id"]
    done = update(c, a, task, status="completed").json()
    assert done["completed_at"]
    assert not c.get(f"/api/w/{a}/resources?view=today").json()
    reopened = update(c, a, done, status="open", due_date=str(today - timedelta(days=1))).json()
    assert reopened["completed_at"] is None
    assert c.get(f"/api/w/{a}/resources?view=overdue").json()[0]["id"] == task["id"]
    update(c, a, reopened, due_date=str(today + timedelta(days=1)))
    assert len(c.get(f"/api/w/{a}/resources?view=upcoming").json()) == 1
    make(c, a, "task", start_date=str(today + timedelta(days=2)))
    assert len(c.get(f"/api/w/{a}/resources?view=upcoming").json()) == 2
    make(c, a, content="- [ ] Not a task")
    assert len(c.get(f"/api/w/{a}/resources?kind=task").json()) == 2


def test_collection_cycles_multimembership_and_project_archive(env):
    c, app, nexus, a, b, _ = env
    parent = make(c, a, "collection")
    child = make(c, a, "collection", parent=parent["id"])
    assert update(c, a, parent, parent=child["id"]).status_code == 422
    project = make(c, a, "project")
    note = make(c, a, collections=[parent["id"], child["id"]], project=project["id"])
    assert len(c.get(f"/api/w/{a}/resources?collection={child['id']}").json()) == 1
    assert update(c, a, project, status="archived").status_code == 200
    assert c.get(f"/api/w/{a}/resources/{note['id']}").status_code == 200


def test_references_private_retry_and_deleted_target(env):
    c, app, nexus, a, b, _ = env
    target = make(c, a, title="Target")
    source = make(c, a, content=f"[Target]({target['reference']})")
    backlinks = c.get(f"/api/w/{a}/resources/{target['id']}").json()["backlinks"]
    assert backlinks[0]["id"] == source["id"]
    nexus.fail = True
    app.state.flush(force=True)
    assert c.get("/api/sync").json()["pending"] > 0
    nexus.fail = False
    app.state.flush(force=True)
    assert c.get("/api/sync").json()["pending"] == 0
    response = c.post(
        "/empyrean/v1/resources/resolve",
        headers={"X-Nexus-Resolver-Key": KEY},
        json={"resource": source["reference"], "requester": "other"},
    )
    assert response.status_code == 403
    c.post(
        f"/api/w/{a}/resources/{source['id']}/links",
        json={"target": target["reference"], "readers": ["other"]},
    )
    response = c.post(
        "/empyrean/v1/resources/resolve",
        headers={"X-Nexus-Resolver-Key": KEY},
        json={"resource": source["reference"], "requester": "other"},
    )
    assert response.json()["label"] == source["title"]
    assert update(c, a, target, trashed=True).status_code == 200
    assert c.delete(f"/api/w/{a}/resources/{target['id']}?confirmed=true").status_code == 200
    assert (
        c.get(f"/api/w/{a}/resources/{source['id']}").json()["links"][0]["target"]
        == target["reference"]
    )
    assert (
        c.post(
            "/empyrean/v1/resources/resolve",
            headers={"X-Nexus-Resolver-Key": KEY},
            json={"resource": target["reference"], "requester": "other"},
        ).status_code
        == 410
    )


def test_attachments_use_shared_storage_and_scope(env):
    c, app, nexus, a, b, _ = env
    note = make(c, a)
    root = f"/api/w/{a}/resources/{note['id']}/attachments"
    response = c.post(
        root, json={"name": "hello.txt", "content": base64.b64encode(b"hello").decode()}
    )
    assert response.status_code == 200, response.text
    aid = response.json()["id"]
    assert c.get(root + "/" + aid).json()["content"] == base64.b64encode(b"hello").decode()
    assert c.get(f"/api/w/{b}/resources/{note['id']}/attachments/{aid}").status_code == 404
    assert c.post(root, json={"name": "bad", "content": "!"}).status_code == 422
    assert c.delete(root + "/" + aid).status_code == 200


def test_workspace_archive_and_trash_restore(env):
    c, app, nexus, a, b, _ = env
    note = make(c, a)
    trashed = update(c, a, note, trashed=True).json()
    assert c.get(f"/api/w/{a}/resources").json() == []
    assert len(c.get(f"/api/w/{a}/resources?view=trash").json()) == 1
    restored = update(c, a, trashed, trashed=False).json()
    c.put("/api/workspaces/" + a, json={"title": "Personal", "archived": True})
    assert update(c, a, restored, content="cannot write").status_code == 409
    assert c.get(f"/api/w/{a}/resources/{note['id']}").status_code == 200


def test_markdown_preview_is_sanitized_and_supports_tables(env):
    c, *_ = env
    html = c.post(
        "/api/preview",
        json={
            "content": "# Heading\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))"
        },
    ).json()["html"]
    assert "<h1>" in html and "<table>" in html
    assert "<script>" not in html and 'href="javascript:' not in html


def test_concurrent_edits_never_overwrite_each_other(env):
    c, app, nexus, a, b, path = env
    note = make(c, a)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(lambda content: update(c, a, note, content=content).status_code, ["A", "B"])
        )
    assert sorted(results) == [200, 409]


def test_deleted_reference_stays_editable_and_resolves_deleted(env):
    c, app, nexus, a, b, path = env
    target = make(c, a)
    source = make(c, a, content=f"[target]({target['reference']})")
    update(c, a, target, trashed=True)
    c.delete(f"/api/w/{a}/resources/{target['id']}?confirmed=true")
    assert update(c, a, source, title="Can still edit").status_code == 200
    assert (
        c.post(f"/api/w/{a}/resolve", json={"target": target["reference"]}).json()["availability"]
        == "deleted"
    )
    assert c.post(f"/api/w/{b}/resolve", json={"target": target["reference"]}).status_code == 404


def test_translation_pack_is_text_only_and_falls_back(env):
    c, app, nexus, a, b, path = env
    (path / "locales").mkdir()
    (path / "locales" / "sk.json").write_text(
        '{"Today":"Dnes","Notes":"Poznámky","Save":"</script><script>bad</script>"}'
    )
    response = c.get("/")
    assert response.status_code == 200
    assert "/*CATALOGS*/" not in response.text
    assert "Dnes" in response.text
    assert "</script><script>bad" not in response.text


def test_unavailable_reference_does_not_block_other_outbox_entries(env):
    c, app, nexus, a, b, path = env
    source = make(c, a)
    original = nexus.request

    def partial(method, path, body=None):
        if path == "/references":
            raise httpx.ConnectError("reference owner unavailable")
        return original(method, path, body)

    nexus.request = partial
    c.post(
        f"/api/w/{a}/resources/{source['id']}/links", json={"target": "nexus:v1:missing:item:42"}
    )
    make(c, a, "task")
    app.state.flush(force=True)
    with app.state.db.connect() as db:
        rows = db.execute("SELECT * FROM outbox").fetchall()
        assert len(rows) == 1 and rows[0]["path"] == "/references"
        assert rows[0]["attempts"] == 1
    nexus.request = original
    assert c.post("/api/sync").json()["pending"] == 0


def test_retry_migration_preserves_existing_database(tmp_path):
    import sqlite3

    from mnemosyne.db import MIGRATIONS, Database

    path = tmp_path / "old.sqlite3"
    with sqlite3.connect(path) as db:
        db.executescript(MIGRATIONS[0] + "PRAGMA user_version=1;")
        db.execute(
            "INSERT INTO workspaces VALUES('original','Existing','Europe/Bratislava',0,'2026-09-29')"
        )
        db.execute("INSERT INTO outbox(method,path,body) VALUES('POST','/events','{}')")
    upgraded = Database(path)
    with upgraded.connect() as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == len(MIGRATIONS)
        assert db.execute("SELECT title FROM workspaces").fetchone()[0] == "Existing"
        assert db.execute("SELECT attempts FROM outbox").fetchone()[0] == 0


def test_trash_timestamp_restore_and_relations(env):
    c, app, nexus, a, b, _ = env
    project = make(c, a, "project")
    note = make(c, a, project=project["id"])
    parent = update(c, a, project, trashed=True).json()
    assert parent["trashed_at"]
    # Existing relationships remain editable when their target is recoverable.
    assert update(c, a, note, content="Still working").status_code == 200
    trashed = update(c, a, parent, title="Changed in Trash").json()
    assert trashed["trashed_at"] == parent["trashed_at"]
    assert (
        c.post(f"/api/w/{a}/trash", json={"action": "restore", "ids": [parent["id"]]}).status_code
        == 200
    )
    restored = c.get(f"/api/w/{a}/resources/{parent['id']}").json()
    assert restored["trashed_at"] is None and not restored["trashed"]
    assert c.get(f"/api/w/{a}/resources/{note['id']}").json()["project"] == parent["id"]


def test_trash_confirmation_batch_atomicity_and_scope(env):
    c, app, nexus, a, b, _ = env
    first = update(c, a, make(c, a), trashed=True).json()
    foreign = update(c, b, make(c, b), trashed=True).json()
    root = f"/api/w/{a}/trash"
    assert c.delete(f"/api/w/{a}/resources/{first['id']}").status_code == 422
    assert c.post(root, json={"action": "empty"}).status_code == 422
    for action in ("restore", "delete"):
        assert (
            c.post(
                root,
                json={"action": action, "ids": [first["id"], foreign["id"]], "confirmed": True},
            ).status_code
            == 404
        )
        assert c.get(f"/api/w/{a}/resources/{first['id']}").json()["trashed"]
    live = make(c, a)
    assert (
        c.post(
            root, json={"action": "delete", "ids": [first["id"], live["id"]], "confirmed": True}
        ).status_code
        == 409
    )
    assert c.post(root, json={"action": "empty", "confirmed": True}).json()["affected"] == 1
    assert c.get(f"/api/w/{a}/resources/{live['id']}").status_code == 200
    assert c.get(f"/api/w/{b}/resources/{foreign['id']}").status_code == 200


def test_permanent_delete_preserves_survivors_references_and_blobs(env):
    c, app, nexus, a, b, _ = env
    project = make(c, a, "project")
    parent = make(c, a, "collection")
    child = make(c, a, "collection", parent=parent["id"])
    note = make(
        c,
        a,
        project=project["id"],
        collections=[parent["id"], child["id"]],
        content=f"[project]({project['reference']})",
    )
    c.post(
        f"/api/w/{a}/resources/{project['id']}/attachments",
        json={"name": "shared.txt", "content": "aGVsbG8="},
    )
    for r in (project, parent):
        update(c, a, r, trashed=True)
    assert (
        c.post(f"/api/w/{a}/trash", json={"action": "empty", "confirmed": True}).json()["affected"]
        == 2
    )
    saved = c.get(f"/api/w/{a}/resources/{note['id']}").json()
    assert saved["project"] is None and saved["collections"] == [child["id"]]
    assert saved["links"][0]["target"] == project["reference"]
    assert saved["revision"] > note["revision"]
    assert c.get(f"/api/w/{a}/resources/{child['id']}").json()["parent"] is None
    assert nexus.blobs["blob"] == "aGVsbG8="
    assert not any(
        method == "DELETE" and path.startswith("/blobs") for method, path, _ in nexus.calls
    )


def test_retention_exact_boundary_never_and_retrash(tmp_path, monkeypatch):
    from datetime import timezone

    monkeypatch.setenv("NEXUS_RESOLVER_KEY", KEY)
    instant = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    app = create_app(tmp_path, SharedServices(), clock=lambda: instant[0])
    with TestClient(app, headers={"X-Nexus-Gateway-Key": KEY}) as c:
        a = c.post("/api/workspaces", json={"title": "A"}).json()["id"]
        b = c.post("/api/workspaces", json={"title": "B"}).json()["id"]
        assert c.get(f"/api/w/{a}/trash/policy").json() == {"days": 30}
        assert c.put(f"/api/w/{b}/trash/policy", json={"days": None}).status_code == 200
        assert c.put(f"/api/w/{a}/trash/policy", json={"days": 1}).status_code == 422
        old = update(c, a, make(c, a), trashed=True).json()
        kept = update(c, b, make(c, b), trashed=True).json()
        retrash = update(c, a, make(c, a), trashed=True).json()
        instant[0] += timedelta(days=29, hours=23, minutes=59, seconds=59)
        assert app.state.cleanup_trash() == 0
        c.post(f"/api/w/{a}/trash", json={"action": "restore", "ids": [retrash["id"]]})
        restored = c.get(f"/api/w/{a}/resources/{retrash['id']}").json()
        fresh = update(c, a, restored, trashed=True).json()
        assert fresh["trashed_at"] != old["trashed_at"]
        # Archived Workspaces retain their declared automatic retention policy.
        c.put("/api/workspaces/" + a, json={"title": "A", "archived": True})
        instant[0] += timedelta(seconds=1)
        assert app.state.cleanup_trash() == 1
        assert c.get(f"/api/w/{a}/resources/{old['id']}").status_code == 404
        assert c.get(f"/api/w/{a}/resources/{fresh['id']}").status_code == 200
        instant[0] += timedelta(days=365)
        assert app.state.cleanup_trash() == 1
        assert c.get(f"/api/w/{b}/resources/{kept['id']}").status_code == 200


def test_trash_migration_grants_existing_items_full_retention(tmp_path):
    import sqlite3
    from datetime import timezone

    from mnemosyne.db import MIGRATIONS, Database

    path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(path) as conn:
        conn.executescript(MIGRATIONS[0] + MIGRATIONS[1] + "PRAGMA user_version=2;")
        conn.execute("INSERT INTO workspaces VALUES('w','Existing','UTC',0,'2000-01-01')")
        conn.execute(
            "INSERT INTO resources(id,workspace,kind,title,status,trashed,created_at,updated_at) VALUES('n','w','note','Preserved','open',1,'2000-01-01','2000-01-01')"
        )
    before = datetime.now(timezone.utc) - timedelta(seconds=1)
    db = Database(path)
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM resources").fetchone()
        assert datetime.fromisoformat(row["trashed_at"]) >= before
        assert row["title"] == "Preserved"
        assert conn.execute("SELECT trash_retention_days FROM workspaces").fetchone()[0] == 30


def test_completed_view_and_daily_trash_recovery(env):
    c, app, nexus, a, b, _ = env
    task = make(c, a, "task")
    update(c, a, task, status="completed")
    assert c.get(f"/api/w/{a}/resources?view=completed").json()[0]["id"] == task["id"]
    note = c.post(f"/api/w/{a}/daily/2026-09-30").json()
    update(c, a, note, trashed=True)
    existing = c.post(f"/api/w/{a}/daily/2026-09-30").json()
    assert existing["id"] == note["id"] and existing["trashed"]
    c.post(f"/api/w/{a}/trash", json={"action": "restore", "ids": [note["id"]]})
    assert not c.post(f"/api/w/{a}/daily/2026-09-30").json()["trashed"]


RESOLVER = {"X-Nexus-Resolver-Key": KEY}


def test_outgoing_enumeration_is_authenticated_complete_and_paged(env):
    c, app, nexus, a, b, _ = env
    target = make(c, a, title="Target")
    sources = [make(c, a, content=f"[t]({target['reference']})") for _ in range(3)]
    c.post(
        f"/api/w/{a}/resources/{sources[0]['id']}/links",
        json={"target": "nexus:v1:meridian:person:0b9a3c55-4a43-4d2c-9d7e-8f3a3a1c2b11"},
    )
    url = "/empyrean/v1/references/outgoing"
    assert c.get(url).status_code == 403
    assert c.get(url, headers={"X-Nexus-Resolver-Key": "wrong"}).status_code == 403
    edges, cursor = [], None
    for _ in range(10):
        page = c.get(
            url, params={"limit": 2, **({"cursor": cursor} if cursor else {})}, headers=RESOLVER
        ).json()
        assert len(page["references"]) <= 2
        edges += page["references"]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert len(edges) == 4
    assert len({(e["source"], e["target"]) for e in edges}) == 4
    assert all(e["relation"] == "mnemosyne.related" and e["metadata"] == {} for e in edges)
    assert {e["source"] for e in edges} == {s["reference"] for s in sources}


def test_permanent_delete_removes_published_edges_and_tolerates_missing(env):
    c, app, nexus, a, b, _ = env
    target = make(c, a)
    source = make(c, a, content=f"[t]({target['reference']})")
    app.state.flush(force=True)
    assert c.get(f"/api/w/{a}/resources/{source['id']}").json()["links"][0]["remote_id"]
    update(c, a, source, trashed=True)
    nexus.gone = True  # The index already lost the edge; deletion must still complete.
    c.post(f"/api/w/{a}/trash", json={"action": "empty", "confirmed": True})
    app.state.flush(force=True)
    assert ("DELETE", "/references/remote-id", None) in nexus.calls
    assert c.get("/api/sync").json()["pending"] == 0
    page = c.get("/empyrean/v1/references/outgoing", headers=RESOLVER).json()
    assert page == {"references": [], "next_cursor": None}


def backup_headers(response):
    return {k: v for k, v in response.headers.items() if k.lower().startswith("x-empyrean-backup-")}


def test_backup_roundtrip_preserves_identity_and_suspends_purges(tmp_path, monkeypatch):
    from datetime import timezone

    monkeypatch.setenv("NEXUS_RESOLVER_KEY", KEY)
    instant = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    nexus = SharedServices()
    app = create_app(tmp_path, nexus, clock=lambda: instant[0])
    with TestClient(app, headers={"X-Nexus-Gateway-Key": KEY}) as c:
        a = c.post("/api/workspaces", json={"title": "A"}).json()["id"]
        target = make(c, a, title="Kept")
        source = make(c, a, title="Source", content=f"[t]({target['reference']})")
        trashed = update(c, a, make(c, a, title="Old trash"), trashed=True).json()
        assert c.post("/empyrean/v1/backup/export").status_code == 403
        exported = c.post("/empyrean/v1/backup/export", headers=RESOLVER)
        assert exported.status_code == 200
        headers = backup_headers(exported)
        assert headers["x-empyrean-backup-module"] == "mnemosyne"
        assert headers["x-empyrean-backup-module-version"] == "1.1.0"
        assert headers["x-empyrean-backup-format"] == "mnemosyne-sqlite"
        assert headers["x-empyrean-backup-restorable-by"] == ">=1.1.0,<2"
        assert not list(tmp_path.glob("*.part"))
        artifact = exported.content

        # Diverge after the backup: edit, delete and create.
        update(c, a, source, title="Changed")
        make(c, a, title="Created later")
        c.post(f"/api/w/{a}/trash", json={"action": "empty", "confirmed": True})
        app.state.flush(force=True)

        both = {**RESOLVER, **headers}
        valid = c.post("/empyrean/v1/backup/validate", content=artifact, headers=both)
        assert valid.json() == {"valid": True}
        assert c.get(f"/api/w/{a}/resources/{source['id']}").json()["title"] == "Changed"
        restored = c.post("/empyrean/v1/backup/restore", content=artifact, headers=both)
        assert restored.json() == {"restored": True}
        titles = {r["id"]: r["title"] for r in c.get(f"/api/w/{a}/resources").json()}
        assert titles == {target["id"]: "Kept", source["id"]: "Source"}
        assert c.get(f"/api/w/{a}/resources/{trashed['id']}").json()["trashed"]

        # Edges are re-published from restored data, not replayed from the old outbox.
        nexus.calls.clear()
        app.state.flush(force=True)
        assert [call[0:2] for call in nexus.calls] == [("POST", "/references")]

        # Expired restored Trash is not purged before finalize, and gets a fresh period after.
        instant[0] += timedelta(days=45)
        assert app.state.cleanup_trash() == 0
        assert c.post("/empyrean/v1/backup/finalize", headers=RESOLVER).json() == {
            "finalized": True
        }
        assert app.state.cleanup_trash() == 0
        kept = c.get(f"/api/w/{a}/resources/{trashed['id']}").json()
        assert kept["trashed_at"] == trashed["trashed_at"]  # real deletion time stays visible
        assert kept["purge_after"] == (instant[0] + timedelta(days=30)).isoformat()
        instant[0] += timedelta(days=29)
        assert app.state.cleanup_trash() == 0
        instant[0] += timedelta(days=1)
        assert app.state.cleanup_trash() == 1


def test_backup_validation_rejects_foreign_damaged_and_newer_artifacts(env, tmp_path):
    import sqlite3

    from mnemosyne.db import MIGRATIONS

    c, app, nexus, a, b, path = env
    exported = c.post("/empyrean/v1/backup/export", headers=RESOLVER)
    headers = {**RESOLVER, **backup_headers(exported)}

    def valid(content, **extra):
        response = c.post(
            "/empyrean/v1/backup/validate", content=content, headers={**headers, **extra}
        )
        return response.status_code

    assert valid(exported.content) == 200
    assert valid(b"not a database") == 422
    assert valid(exported.content, **{"X-Empyrean-Backup-Module": "janus"}) == 422
    assert valid(exported.content, **{"X-Empyrean-Backup-Format-Version": "2"}) == 422
    newer = tmp_path / "newer.sqlite3"
    newer.write_bytes(exported.content)
    conn = sqlite3.connect(newer)
    conn.execute(f"PRAGMA user_version={len(MIGRATIONS) + 1}")
    conn.close()
    assert valid(newer.read_bytes()) == 422
    response = c.post("/empyrean/v1/backup/restore", content=b"junk", headers=headers)
    assert response.status_code == 422
    assert len(c.get("/api/workspaces").json()) == 2
    assert not list(path.glob("*.part")) and not (path / "purge-suspended").exists()


def test_last_opened_workspace_is_remembered(env):
    c, app, nexus, a, b, _ = env
    assert all(w["opened_at"] is None for w in c.get("/api/workspaces").json())
    assert c.post(f"/api/workspaces/{b}/open").status_code == 200
    assert c.post("/api/workspaces/missing/open").status_code == 404
    opened = {w["id"]: w["opened_at"] for w in c.get("/api/workspaces").json()}
    assert opened[b] and opened[a] is None
