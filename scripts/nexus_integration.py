"""Prove Mnemosyne's Nexus 0.1.3 contract against a disposable Nexus installation.

Requires Docker access, httpx, built Nexus images (`docker compose build` in the Nexus
repository) and a built `mnemosyne:1.1.0` image. Creates a uniquely named Compose project on
loopback, installs Mnemosyne, and exercises outgoing-reference reconciliation and the backup
v1 lifecycle (export, validate, restore, reconcile, finalize) through owner APIs and the
authenticated gateway. Removes only its own stack and the module volume it created.

Usage: python scripts/nexus_integration.py [path-to-empyrean-nexus]
"""

import json
import os
import secrets
import subprocess
import sys
import time
import uuid
from pathlib import Path

import httpx

MODULE = "mnemosyne"


def main():
    nexus_repo = Path(sys.argv[1] if len(sys.argv) > 1 else "../empyrean-nexus").resolve()
    manifest = json.loads(Path("manifest.json").read_text())
    manifest["container"]["image"] = subprocess.check_output(
        ["docker", "image", "inspect", "mnemosyne:" + manifest["version"], "--format", "{{.Id}}"],
        text=True,
    ).strip()
    installation = "nexus-test-" + uuid.uuid4().hex[:10]
    port = os.getenv("NEXUS_TEST_PORT", "12335")
    origin = "http://127.0.0.1:" + port
    env = {
        **os.environ,
        "NEXUS_INSTALLATION": installation,
        "NEXUS_BIND": "127.0.0.1",
        "NEXUS_ALLOWED_ORIGINS": "",
        "NEXUS_PORT": port,
        "NEXUS_PUBLIC_ORIGIN": origin,
        "NEXUS_ALLOW_EXAMPLE": "0",
    }

    def compose(*args, capture=False):
        return subprocess.run(
            ["docker", "compose", "-p", installation, *args],
            cwd=nexus_repo,
            env=env,
            check=True,
            text=True,
            capture_output=capture,
        )

    def check(response, status=200):
        assert response.status_code == status, (
            f"{response.request.method} {response.request.url}: "
            f"{response.status_code} {response.text[:500]}"
        )
        return response.json()

    client = httpx.Client(base_url=origin, timeout=130, trust_env=False)

    def app(method, path, body=None, status=200):
        return check(client.request(method, f"/modules/{MODULE}/api" + path, json=body), status)

    def synced():
        for _ in range(40):
            if app("POST", "/sync")["pending"] == 0:
                return
            time.sleep(0.5)
        raise AssertionError("Mnemosyne outbox did not drain")

    def healthy():
        for _ in range(40):
            if check(client.post(f"/api/v1/modules/{MODULE}/health"))["status"] == "healthy":
                return
            time.sleep(0.5)
        raise AssertionError("Mnemosyne did not become healthy")

    installed = False
    try:
        compose("up", "-d", "--wait")
        claim = compose("exec", "-T", "nexus", "cat", "/data/setup-token", capture=True)
        result = check(
            client.post(
                "/api/v1/setup",
                json={
                    "username": "integration-owner",
                    "password": secrets.token_urlsafe(24),
                    "installation_name": "Disposable Mnemosyne contract test",
                    "claim_token": claim.stdout.strip(),
                },
            ),
            201,
        )
        client.headers["X-Nexus-CSRF"] = result["csrf"]
        check(client.post("/api/v1/modules/validate", json=manifest))
        check(
            client.post(
                "/api/v1/modules", json={"manifest": manifest, "grants": manifest["capabilities"]}
            ),
            201,
        )
        installed = True
        check(client.post(f"/api/v1/modules/{MODULE}/enable"))
        healthy()
        assert client.get(f"/app/modules/{MODULE}").status_code == 200

        # Domain data with an internal edge, published to the Nexus index.
        wid = app("POST", "/workspaces", {"title": "Integration"}, 201)["id"]

        def create(title, **values):
            body = {"kind": "note", "title": title, "status": "open", **values}
            return app("POST", f"/w/{wid}/resources", body, 201)

        target = create("Target")
        source = create("Source", content=f"[Target]({target['reference']})")
        synced()
        incoming = app("GET", f"/w/{wid}/resources/{target['id']}/references?direction=incoming")
        assert [e["source"] for e in incoming["references"]] == [source["reference"]]

        # Enumeration matches what the module already published: reconciliation is a no-op.
        summary = check(client.post(f"/api/v1/modules/{MODULE}/references/reconcile"))
        assert summary["added"] == summary["removed"] == 0 and summary["unchanged"] == 1, summary

        backup = check(client.post(f"/api/v1/modules/{MODULE}/backups"), 201)
        assert backup["module_format"] == "mnemosyne-sqlite", backup
        assert backup["restorable_by"] == ">=1.1.0,<2", backup

        # Diverge: rename, add a note with a second edge, permanently delete the source.
        app(
            "PUT",
            f"/w/{wid}/resources/{target['id']}",
            {"kind": "note", "title": "Renamed", "status": "open", "revision": target["revision"]},
        )
        later = create("Later", content=f"[Target]({target['reference']})")
        current = app("GET", f"/w/{wid}/resources/{source['id']}")
        fields = {"kind", "title", "content", "status", "revision"}
        app(
            "PUT",
            f"/w/{wid}/resources/{source['id']}",
            {**{k: current[k] for k in fields}, "trashed": True},
        )
        app("POST", f"/w/{wid}/trash", {"action": "empty", "confirmed": True})
        synced()
        incoming = app("GET", f"/w/{wid}/resources/{target['id']}/references?direction=incoming")
        assert [e["source"] for e in incoming["references"]] == [later["reference"]]

        # Restore: Nexus validates, replaces data, rebuilds the index from enumeration, finalizes.
        assert (
            client.post(
                f"/api/v1/modules/{MODULE}/backups/{backup['id']}/restore", json={}
            ).status_code
            == 422
        )
        check(
            client.post(
                f"/api/v1/modules/{MODULE}/backups/{backup['id']}/restore",
                json={"confirm_replace": True},
            )
        )
        job = check(client.get(f"/api/v1/modules/{MODULE}/restores"))[0]
        assert job["state"] == "completed", job
        healthy()
        titles = {r["id"]: r["title"] for r in app("GET", f"/w/{wid}/resources")}
        assert titles == {target["id"]: "Target", source["id"]: "Source"}, titles
        incoming = app("GET", f"/w/{wid}/resources/{target['id']}/references?direction=incoming")
        assert [e["source"] for e in incoming["references"]] == [source["reference"]]
        synced()  # Re-published edges are upserts of what reconciliation already indexed.
        summary = check(client.post(f"/api/v1/modules/{MODULE}/references/reconcile"))
        assert summary["added"] == summary["removed"] == 0, summary

        # Unlinking after restore uses the refreshed Nexus reference ID.
        link = app("GET", f"/w/{wid}/resources/{source['id']}")["links"][0]
        app("DELETE", f"/w/{wid}/resources/{source['id']}/links/{link['id']}")
        synced()
        incoming = app("GET", f"/w/{wid}/resources/{target['id']}/references?direction=incoming")
        assert incoming["references"] == [], incoming

        check(client.post(f"/api/v1/modules/{MODULE}/disable"))
        check(client.delete(f"/api/v1/modules/{MODULE}"))
        installed = False
        print(
            "PASS: install, enable, health, application route, gateway API, reference publish, "
            "no-op reconciliation, backup export, divergence, confirmed restore with validate/"
            "reconcile/finalize, identity-preserving data, rebuilt index, post-restore unlink, "
            "disable, uninstall"
        )
    except Exception:
        compose("logs", "--tail", "60")
        raise
    finally:
        if installed:
            try:
                client.delete(f"/api/v1/modules/{MODULE}")
            except httpx.HTTPError:
                pass
        client.close()
        compose("down", "-v")
        # Uninstall deliberately retains module data; this disposable test removes its own.
        subprocess.run(
            ["docker", "volume", "rm", "-f", f"{installation}-data-{MODULE}"],
            check=False,
            capture_output=True,
        )


if __name__ == "__main__":
    main()
