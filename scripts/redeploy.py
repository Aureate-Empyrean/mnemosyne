"""Explicit development redeploy inside Nexus; preserves Mnemosyne's data volume."""

import json
import time
from pathlib import Path

from nexus.manage import owner_client

manifest = json.loads(Path("/tmp/mnemosyne-manifest.json").read_text())
assert manifest["id"] == "mnemosyne"
with owner_client() as c:
    old = c.get("/api/v1/modules/mnemosyne")
    old.raise_for_status()
    assert set(old.json()["manifest"]["capabilities"]) == set(manifest["capabilities"]), (
        "Capability changes require a fresh review"
    )
    if old.json()["manifest"] != manifest:
        c.post("/api/v1/modules/mnemosyne/disable").raise_for_status()
        c.delete("/api/v1/modules/mnemosyne").raise_for_status()
        c.post(
            "/api/v1/modules",
            json={
                "manifest": manifest,
                "grants": manifest["capabilities"],
                "reuse_reference_identity": True,
            },
        ).raise_for_status()
        c.post("/api/v1/modules/mnemosyne/enable").raise_for_status()
    for _ in range(15):
        result = c.post("/api/v1/modules/mnemosyne/health")
        result.raise_for_status()
        if result.json()["status"] == "healthy":
            break
        time.sleep(1)
    assert result.json()["status"] == "healthy"
    print("Mnemosyne redeployed with retained data and unchanged capability grants.")
