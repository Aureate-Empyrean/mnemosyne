"""Run inside the local Nexus container after installing Mnemosyne.

Uses the installation's real authenticated gateway and shared services. Only creates
explicitly named verification Workspaces; cleanup IDs are written for the operator.
"""

import base64
import json
import time
import uuid
from datetime import date
from pathlib import Path

from nexus.manage import owner_client

FIELDS = {
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


def run():
    with owner_client() as c:
        initial_modules = {m["id"]: m["state"] for m in c.get("/api/v1/modules").json()}

        def req(method, path, body=None):
            response = c.request(method, "/modules/mnemosyne/api" + path, json=body)
            response.raise_for_status()
            return response.json()

        suffix = uuid.uuid4().hex[:8]
        workspaces = []
        for title in ["Personal verification", "Work verification"]:
            workspaces.append(req("POST", "/workspaces", {"title": title + " " + suffix})["id"])
        a, b = workspaces
        Path("/tmp/mnemosyne-smoke-workspaces.json").write_text(json.dumps(workspaces))
        root = "/w/" + a

        def create(kind, **values):
            return req(
                "POST",
                root + "/resources",
                {
                    "kind": kind,
                    "title": "Verification " + kind,
                    "status": "active" if kind == "project" else "open",
                    **values,
                },
            )

        def update(r, **values):
            return req(
                "PUT",
                root + "/resources/" + r["id"],
                {**{k: v for k, v in r.items() if k in FIELDS}, **values},
            )

        project = create("project")
        parent = create("collection")
        child = create("collection", parent=parent["id"])
        target = create("note", title="Reference target")
        note = create(
            "note",
            content="# Verified\n\n[Target](" + target["reference"] + ")",
            collections=[parent["id"], child["id"]],
            project=project["id"],
        )
        task = create(
            "task",
            priority="high",
            due_date=str(date.today()),
            project=project["id"],
            related_note=note["id"],
            checklist=[{"text": "Verify persistence", "done": False}],
        )
        assert req("GET", root + "/resources?view=today")[0]["id"] == task["id"]
        task = update(task, board_column="Done")
        assert task["status"] == "open"
        task = update(task, status="completed")
        assert task["completed_at"]
        assert not req("GET", root + "/resources?view=today")
        day = req("POST", root + "/daily/2026-09-30")
        assert req("POST", root + "/daily/2026-09-30")["id"] == day["id"]
        assert not req("GET", "/w/" + b + "/resources?q=Verified")
        denied = c.get("/modules/mnemosyne/api/w/" + b + "/resources/" + note["id"])
        assert denied.status_code == 404
        attachment = req(
            "POST",
            root + "/resources/" + note["id"] + "/attachments",
            {
                "name": "verification.txt",
                "content": base64.b64encode(b"shared storage verified").decode(),
            },
        )
        file = req("GET", root + "/resources/" + note["id"] + "/attachments/" + attachment["id"])
        assert base64.b64decode(file["content"]) == b"shared storage verified"
        for _ in range(20):
            if req("GET", "/sync")["pending"] == 0:
                break
            time.sleep(1)
        edges = req("GET", root + "/resources/" + target["id"] + "/references")["references"]
        assert any(e["source"] == note["reference"] for e in edges)
        exported = req("GET", root + "/export")
        assert len(exported["resources"]) == 7
        page = c.get("/modules/mnemosyne/")
        assert (
            page.status_code == 200 and "Mnemosyne" in page.text and "/*CATALOGS*/" not in page.text
        )
        assert "sandbox allow-scripts" in page.headers["content-security-policy"]
        version = tuple(int(x) for x in c.get("/api/v1/system").json()["version"].split("."))
        assert version >= (0, 1, 3)
        if initial_modules.get("empyrean-example") == "enabled":
            assert c.get("/modules/empyrean-example/").status_code == 200
        c.post("/api/v1/modules/mnemosyne/disable").raise_for_status()
        c.post("/api/v1/modules/mnemosyne/enable").raise_for_status()
        for _ in range(15):
            if c.post("/api/v1/modules/mnemosyne/health").json()["status"] == "healthy":
                break
            time.sleep(1)
        assert req("GET", root + "/resources/" + note["id"])["content"].startswith("# Verified")
        assert (
            base64.b64decode(
                req("GET", root + "/resources/" + note["id"] + "/attachments/" + attachment["id"])[
                    "content"
                ]
            )
            == b"shared storage verified"
        )
        assert {m["id"]: m["state"] for m in c.get("/api/v1/modules").json()} == initial_modules
        # Remove only this run's relationships and records through the actual API.
        links = req("GET", root + "/resources/" + note["id"])["links"]
        for link in links:
            req("DELETE", root + "/resources/" + note["id"] + "/links/" + link["id"])
        for r in [task, note, day, target, child, parent, project]:
            current = req("GET", root + "/resources/" + r["id"])
            current = update(
                current,
                project=None,
                related_note=None,
                parent=None,
                collections=[],
                content="",
                trashed=True,
            )
            req("DELETE", root + "/resources/" + current["id"] + "?confirmed=true")
        for wid in workspaces:
            req(
                "PUT",
                "/workspaces/" + wid,
                {"title": "Completed verification " + suffix, "archived": True},
            )
        print(
            json.dumps(
                {
                    "result": "passed",
                    "checks": [
                        "gateway authentication",
                        "workspace isolation",
                        "task lifecycle/date views",
                        "daily uniqueness",
                        "hierarchical collections",
                        "shared attachment roundtrip",
                        "real Nexus backlinks",
                        "workspace export",
                        "disable/enable persistence",
                        "existing Nexus and unchanged module states",
                    ],
                    "cleanup_workspaces": workspaces,
                }
            )
        )


if __name__ == "__main__":
    run()
