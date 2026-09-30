// Explicit local browser QA against the installed application; no mocked services.
const { chromium, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const compose = [
  "compose",
  "-f",
  path.resolve("../empyrean-nexus/compose.yaml"),
  "exec",
  "-T",
  "nexus",
  "python",
  "-c",
];
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      ...compose,
      `import sqlite3,secrets,hashlib,time,json
c=sqlite3.connect('/data/nexus.sqlite3')
u=c.execute('select id from users').fetchall()
assert len(u)==1
t=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(32)
c.execute('insert into sessions values(?,?,?,?)',(hashlib.sha256(t.encode()).hexdigest(),u[0][0],csrf,int(time.time())+900)); c.commit()
print(json.dumps({'token':t,'csrf':csrf}))`,
    ],
    { encoding: "utf8" },
  ),
);
(async () => {
  let browser, page;
  const errors = [];
  const created = [];
  const suffix = Date.now().toString(36);
  fs.mkdirSync("artifacts", { recursive: true });
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await context.addCookies([
      {
        name: "nexus_session",
        value: session.token,
        url: "http://localhost:12333",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    page = await context.newPage();
    page.on("response", async (response) => {
      if (
        response.request().method() === "POST" &&
        response.url().endsWith("/modules/mnemosyne/api/workspaces") &&
        response.status() === 201
      ) {
        const result = await response.json();
        if (!created.includes(result.id)) created.push(result.id);
      }
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("http://localhost:12333/app/overview");
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    await page.goto("http://localhost:12333/app/modules/mnemosyne");
    const app = page.frameLocator("#module-application");
    const ready = async () =>
      expect(app.locator("#app")).not.toHaveAttribute("inert", "");
    const nav = async (name) => {
      await ready();
      await app.locator(`[data-view="${name}"]`).click();
      if (name === "note")
        await expect(app.locator("#note-list")).toBeVisible();
      else if (name === "collection")
        await expect(app.locator(".tree")).toBeVisible();
      else
        await expect(
          app.getByRole("heading", {
            name: {
              home: "Home",
              task: "Tasks",
              project: "Projects",
              trash: "Trash",
            }[name],
            exact: true,
          }),
        ).toBeVisible();
    };
    const saved = async () => {
      await ready();
      await ready();
      await app.locator("#save-now").click();
      await expect(app.locator("#save-state")).toHaveText("Saved");
    };
    const shot = async (name) =>
      page.screenshot({ path: "artifacts/" + name + ".png", fullPage: true });
    const api = async (path, method = "GET", data) => {
      const response = await context.request.fetch(
        "http://localhost:12333/modules/mnemosyne/api" + path,
        { method, data, headers: { "X-Nexus-CSRF": session.csrf } },
      );
      if (!response.ok())
        throw Error(
          method +
            " " +
            path +
            ": " +
            response.status() +
            " " +
            (await response.text()),
        );
      return response.json();
    };
    const workspace = async (title) => {
      await ready();
      await app.getByRole("button", { name: "Manage Workspaces" }).click();
      await ready();
      await app
        .getByRole("button", { name: "New Workspace", exact: true })
        .click();
      await ready();
      await app.getByLabel("Name", { exact: true }).fill(title);
      await ready();
      await app.locator("dialog [data-submit]").click();
      await expect(app.locator("dialog")).not.toBeVisible();
      await expect(
        app.getByRole("heading", { name: "Home", exact: true }),
      ).toBeVisible();
    };
    const named = async (kind, title) => {
      await ready();
      await app.locator("#new").click();
      await ready();
      await app.getByLabel("Name", { exact: true }).fill(title);
      await ready();
      await app.locator("dialog [data-submit]").click();
      await expect(app.locator("dialog")).not.toBeVisible();
      await expect(app.getByLabel("Title", { exact: true })).toHaveValue(title);
    };
    const note = async (title, content = "Browser QA content") => {
      await nav("note");
      await ready();
      await app.locator("#new").click();
      await expect(app.getByLabel("Title", { exact: true })).toHaveValue(
        "Untitled",
      );
      await expect(app.locator("#markdown")).toBeFocused();
      await ready();
      await app.getByLabel("Title", { exact: true }).fill(title);
      await ready();
      await app.getByLabel("Markdown content").fill(content);
      await saved();
    };
    await expect(app.locator("#workspace-select")).toBeVisible();
    await expect(page.locator(".sidebar")).toBeHidden();
    await workspace("QA Personal " + suffix);
    const wid = created[0];
    await expect(app.locator("nav [data-view]")).toHaveCount(5);
    await note(
      "Browser note A",
      "# Real browser verification\n\nA **Markdown** note, saved through Nexus.\n\n| Topic | Result |\n| --- | --- |\n| Workspace | Isolated |",
    );
    await ready();
    await app.locator("#preview-toggle").click();
    await expect(app.locator("#preview strong")).toHaveText("Markdown");
    await expect(app.locator("#preview table")).toBeVisible();
    await expect(app.locator("#note-list")).toBeVisible();
    await shot("02-notes");
    await note("Browser note B", "Second note for rapid switching");
    await ready();
    await app
      .locator("#note-list")
      .getByRole("button", { name: /Browser note A/ })
      .click();
    await expect(app.getByLabel("Title", { exact: true })).toHaveValue(
      "Browser note A",
    );
    await ready();
    await app.getByLabel("Markdown content").fill("Edited before switching.");
    await ready();
    await app
      .locator("#note-list")
      .getByRole("button", { name: /Browser note B/ })
      .click();
    await expect(app.getByLabel("Title", { exact: true })).toHaveValue(
      "Browser note B",
    );
    await ready();
    await app
      .locator("#note-list")
      .getByRole("button", { name: /Browser note A/ })
      .click();
    await expect(app.getByLabel("Markdown content")).toHaveValue(
      "Edited before switching.",
    );
    await ready();
    await app.getByText("Attachments", { exact: true }).click();
    await ready();
    await app.locator("#file").setInputFiles({
      name: "browser.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("real shared storage"),
    });
    await expect
      .poll(
        async () => (await api("/w/" + wid + "/resources?kind=note")).length,
      )
      .toBe(2);
    // Upload rerenders the editor, then attachment details can be reopened.
    await expect(app.locator("#attachments")).toContainText("browser.txt");
    await ready();
    await app.getByText("Links & backlinks", { exact: true }).click();
    const notes = await api("/w/" + wid + "/resources?kind=note"),
      target = notes.find((n) => n.title === "Browser note B");
    await ready();
    await app.locator("#add-reference").click();
    await ready();
    await app
      .getByLabel("Canonical reference", { exact: true })
      .fill(target.reference);
    await ready();
    await app.locator("dialog [data-submit]").click();
    await expect(app.locator("dialog")).not.toBeVisible();
    await expect(app.locator("#links")).toContainText(target.reference);
    await nav("task");
    await ready();
    await app.locator('[data-task-view="inbox"]').click();
    await expect(app.locator('[data-task-view="inbox"]')).toHaveClass(/active/);
    await ready();
    await ready();
    await app
      .getByLabel("Quick capture", { exact: true })
      .fill("Quick browser task");
    await ready();
    await app.getByLabel("Quick capture", { exact: true }).press("Enter");
    await expect(
      app.getByRole("checkbox", {
        name: "Complete Quick browser task",
        exact: true,
      }),
    ).toBeVisible();
    await ready();
    await app
      .getByRole("checkbox", {
        name: "Complete Quick browser task",
        exact: true,
      })
      .check();
    await ready();
    await app.locator('[data-task-view="completed"]').click();
    await expect(
      app.getByRole("checkbox", {
        name: "Reopen Quick browser task",
        exact: true,
      }),
    ).toBeChecked();
    await ready();
    await app
      .getByRole("checkbox", { name: "Reopen Quick browser task", exact: true })
      .uncheck();
    await ready();
    await app.locator('[data-task-view="all"]').click();
    await ready();
    await app.getByRole("button", { name: /Quick browser task/ }).click();
    await expect(app.getByLabel("Title", { exact: true })).toHaveValue(
      "Quick browser task",
    );
    await ready();
    await app
      .locator("#detail")
      .getByLabel("Deadline", { exact: true })
      .fill("2020-01-01");
    await ready();
    await app
      .locator("#detail")
      .getByLabel("Priority", { exact: true })
      .selectOption("high");
    await ready();
    await app.getByLabel("New checklist item").fill("Check persistence");
    await ready();
    await app.locator("#add-check button").click();
    await saved();
    await ready();
    await app.locator('[data-task-view="today"]').click();
    await expect(
      app.getByRole("heading", { name: "Overdue", exact: true }),
    ).toBeVisible();
    await expect(
      app.getByRole("checkbox", {
        name: "Complete Quick browser task",
        exact: true,
      }),
    ).toBeVisible();
    await shot("03-tasks");
    await nav("home");
    await expect(
      app.getByRole("heading", { name: "Overdue", exact: true }),
    ).toBeVisible();
    await shot("01-home");
    await nav("project");
    await named("project", "Browser project");
    await ready();
    await ready();
    await app.getByLabel("Quick capture", { exact: true }).fill("Board task");
    await ready();
    await app.getByLabel("Quick capture", { exact: true }).press("Enter");
    await expect(
      app.getByRole("checkbox", { name: "Complete Board task", exact: true }),
    ).toBeVisible();
    await ready();
    await app
      .getByLabel("Move Board task", { exact: true })
      .selectOption("In progress");
    await expect(
      app
        .locator(".column")
        .filter({
          has: app.getByRole("heading", { name: "In progress", exact: true }),
        })
        .getByRole("checkbox", { name: "Complete Board task", exact: true }),
    ).toBeVisible();
    const boardTask = (await api("/w/" + wid + "/resources?kind=task")).find(
      (t) => t.title === "Board task",
    );
    if (boardTask.status !== "open")
      throw Error("Board movement changed lifecycle");
    await shot("04-project");
    await ready();
    await app.locator('[data-project-view="Notes"]').click();
    await ready();
    await app.locator("#project-note").click();
    await expect(app.getByLabel("Title", { exact: true })).toHaveValue(
      "Untitled",
    );
    await ready();
    await app.getByLabel("Title", { exact: true }).fill("Project note");
    await saved();
    await nav("collection");
    await named("collection", "Browser collection");
    await ready();
    await app.locator("#add-members").click();
    await ready();
    await app
      .locator("dialog")
      .getByLabel("Browser note A", { exact: true })
      .check();
    await ready();
    await app.locator("dialog [data-submit]").click();
    await expect(app.locator("dialog")).not.toBeVisible();
    await expect(app.locator("#collection-notes")).toContainText(
      "Browser note A",
    );
    await ready();
    await app.locator("#child-collection").click();
    await ready();
    await app.getByLabel("Name", { exact: true }).fill("Child collection");
    await ready();
    await app.locator("dialog [data-submit]").click();
    await expect(app.getByLabel("Title", { exact: true })).toHaveValue(
      "Child collection",
    );
    await ready();
    await app.locator("#add-members").click();
    await ready();
    await app
      .locator("dialog")
      .getByLabel("Browser note A", { exact: true })
      .check();
    await ready();
    await app.locator("dialog [data-submit]").click();
    await expect(app.locator("dialog")).not.toBeVisible();
    await expect(app.locator(".tree")).toContainText("Browser collection");
    await expect(app.locator(".tree")).toContainText("Child collection");
    const noteA = (await api("/w/" + wid + "/resources?kind=note")).find(
      (n) => n.title === "Browser note A",
    );
    if (noteA.collections.length !== 2)
      throw Error("Collection membership duplicated/lost");
    await shot("05-collections");
    await ready();
    await app.locator("#daily").click();
    await expect(app.locator(".eyebrow")).toContainText("Daily Note");
    await ready();
    await app.getByLabel("Markdown content").fill("Daily browser content");
    await saved();
    await ready();
    await app.locator("#daily").click();
    await expect(app.getByLabel("Markdown content")).toHaveValue(
      "Daily browser content",
    );
    if (
      (await api("/w/" + wid + "/resources")).filter((r) => r.daily_date)
        .length !== 1
    )
      throw Error("Duplicate daily Note");
    await ready();
    await app
      .getByRole("searchbox", { name: "Search active Workspace" })
      .fill("Browser note A");
    await ready();
    await app
      .getByRole("searchbox", { name: "Search active Workspace" })
      .press("Enter");
    await expect(
      app.getByRole("heading", { name: "Search results", exact: true }),
    ).toBeVisible();
    await ready();
    await app
      .locator("#content")
      .getByRole("button", { name: /Browser note A/ })
      .click();
    await expect(app.getByLabel("Title", { exact: true })).toHaveValue(
      "Browser note A",
    );
    await ready();
    await app.locator("#trash").click();
    await nav("trash");
    await expect(app.locator(".trash-row")).toContainText("Browser note A");
    await expect(app.locator(".trash-row")).toContainText("Deleted");
    await ready();
    await app.locator("[data-restore]").click();
    await expect(
      app.getByRole("heading", { name: "Trash is empty", exact: true }),
    ).toBeVisible();
    const restored = await api("/w/" + wid + "/resources/" + noteA.id);
    if (
      restored.collections.length !== 2 ||
      restored.attachments.length !== 1 ||
      restored.links.length !== 1
    )
      throw Error("Restore lost relationships");
    await note("Delete individually");
    await ready();
    await app.locator("#trash").click();
    await nav("trash");
    await ready();
    await app.locator("[data-delete]").click();
    await expect(app.locator("dialog")).toBeVisible();
    await ready();
    await app.locator("#cancel-modal").click();
    await expect(app.locator(".trash-row")).toHaveCount(1);
    await ready();
    await app.locator("[data-delete]").click();
    await ready();
    await app.locator("dialog [data-submit]").click();
    await expect(
      app.getByRole("heading", { name: "Trash is empty", exact: true }),
    ).toBeVisible();
    for (const title of ["Batch one", "Batch two"]) {
      await note(title);
      await ready();
      await app.locator("#trash").click();
      await expect(app.locator("#toast")).toContainText("Moved to Trash");
    }
    await nav("trash");
    await ready();
    await app.locator("#select-all").check();
    await ready();
    await app.locator("#restore-selected").click();
    await expect(
      app.getByRole("heading", { name: "Trash is empty", exact: true }),
    ).toBeVisible();
    for (const title of ["Batch one", "Batch two"]) {
      await nav("note");
      await ready();
      await app
        .locator("#note-list")
        .getByRole("button", { name: new RegExp(title) })
        .click();
      await expect(app.getByLabel("Title", { exact: true })).toHaveValue(title);
      await ready();
      await app.locator("#trash").click();
      await expect(app.locator("#toast")).toContainText("Moved to Trash");
    }
    await nav("trash");
    await shot("06-trash");
    await ready();
    await app.locator("#empty-trash").click();
    await ready();
    await app.locator("dialog [data-submit]").click();
    await expect(
      app.getByRole("heading", { name: "Trash is empty", exact: true }),
    ).toBeVisible();
    await ready();
    await app.locator("#retention").selectOption("never");
    await expect(app.locator(".trash-policy")).toContainText(
      "Automatic deletion is off.",
    );
    const expiry = await api("/w/" + wid + "/resources", "POST", {
      kind: "note",
      title: "Retention verification",
      trashed: true,
    });
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "nexus-module-mnemosyne",
        "python",
        "-c",
        `import sqlite3,json,sys\nfrom datetime import datetime,timedelta,timezone\nw,r=json.loads(sys.stdin.read());c=sqlite3.connect('/data/mnemosyne.sqlite3');assert c.execute('select title from workspaces where id=?',(w,)).fetchone()[0].startswith('QA ');c.execute('update resources set trashed_at=? where workspace=? and id=?',((datetime.now(timezone.utc)-timedelta(days=31)).isoformat(),w,r));c.commit()\nfrom mnemosyne.app import create_app\ncreate_app().state.cleanup_trash()`,
      ],
      { input: JSON.stringify([wid, expiry.id]) },
    );
    await nav("trash");
    await expect(app.locator(".trash-row")).toContainText(
      "Retention verification",
    );
    await ready();
    await app.locator("#retention").selectOption("30");
    await ready();
    await app.locator("dialog [data-submit]").click();
    await expect(app.locator("dialog")).not.toBeVisible();
    // Observe the actual background worker, without simulating its deletion.
    await expect
      .poll(
        async () => {
          const rows = await api("/w/" + wid + "/resources?view=trash");
          return rows.some((r) => r.id === expiry.id);
        },
        { timeout: 70000, intervals: [1000, 3000] },
      )
      .toBe(false);
    await nav("trash");
    await expect(
      app.getByRole("heading", { name: "Trash is empty", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(app.locator("#workspace-select")).toBeVisible();
    await ready();
    await app.locator("#workspace-select").selectOption(wid);
    await nav("note");
    await ready();
    await app
      .locator("#note-list")
      .getByRole("button", { name: /Browser note A/ })
      .click();
    await expect(app.getByLabel("Markdown content")).toHaveValue(
      "Edited before switching.",
    );
    await workspace("QA Work " + suffix);
    await ready();
    await app
      .getByRole("searchbox", { name: "Search active Workspace" })
      .fill("Browser note");
    await ready();
    await app
      .getByRole("searchbox", { name: "Search active Workspace" })
      .press("Enter");
    await expect(
      app.getByRole("heading", { name: "Nothing found", exact: true }),
    ).toBeVisible();
    await ready();
    await app.locator("#workspace-select").selectOption(wid);
    await nav("task");
    await ready();
    await app.locator('[data-task-view="all"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("07-mobile-tasks");
    const frame = page
      .frames()
      .find((f) => f.url().includes("/modules/mnemosyne/"));
    if (
      await frame.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Mobile document overflows horizontally");
    await nav("note");
    await shot("08-mobile-notes");
    if (
      await frame.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Mobile Notes overflow");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ready();
    await app.locator("#switch-app").click();
    await ready();
    await app
      .locator("dialog")
      .getByRole("button", { name: "Nexus · Control center", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    if (errors.length)
      throw Error("Browser console errors: " + errors.join("\n"));
    fs.writeFileSync(
      "artifacts/browser-result.json",
      JSON.stringify({ result: "passed", screenshots: 8, errors }),
    );
    console.log(
      JSON.stringify({
        result: "passed",
        screenshots: 8,
        checks: [
          "Home",
          "Notes switching and writing",
          "quick Task creation and completion",
          "Task views",
          "Project board",
          "Collection hierarchy and membership",
          "Daily Note uniqueness",
          "Search and Workspace isolation",
          "shared attachments and references",
          "Trash restore/delete/batch/empty",
          "Never and automatic retention",
          "reload persistence",
          "mobile layout",
          "Nexus switching",
        ],
        workspaces: created,
      }),
    );
  } catch (e) {
    fs.writeFileSync(
      "artifacts/browser-result.json",
      JSON.stringify({ result: "failed", error: e.message, errors }),
    );
    console.error(e.message);
    console.error(errors);
    if (page) {
      await page.screenshot({ path: "artifacts/failure.png", fullPage: true });
      for (const f of page.frames())
        if (f.url().includes("/modules/mnemosyne/"))
          console.error(await f.locator("body").innerText());
    }
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(
      "artifacts/browser-workspaces.json",
      JSON.stringify(created),
    );
    // Only this run's test data is removed. IDs are captured from successful UI creation.
    if (created.length) {
      const cleanup = `import json,sqlite3,sys\nids=json.loads(sys.stdin.read())\nc=sqlite3.connect('/data/mnemosyne.sqlite3')\nc.execute('pragma foreign_keys=on')\nwith c:\n for wid in ids:\n  row=c.execute('select title from workspaces where id=?',(wid,)).fetchone()\n  assert row and row[0].startswith('QA ')\n  c.execute('delete from resources where workspace=?',(wid,))\n  c.execute('delete from tombstones where workspace=?',(wid,))\n  c.execute('delete from workspaces where id=?',(wid,))\nprint('Browser verification data cleaned up')`;
      try {
        console.log(
          execFileSync(
            "docker",
            ["exec", "-i", "nexus-module-mnemosyne", "python", "-c", cleanup],
            { input: JSON.stringify(created), encoding: "utf8" },
          ).trim(),
        );
      } catch (e) {
        console.error("Test data cleanup needs attention");
        process.exitCode = 1;
      }
    }
    if (browser) await browser.close();
    execFileSync(
      "docker",
      [
        ...compose,
        `import sqlite3,hashlib,sys\nc=sqlite3.connect('/data/nexus.sqlite3');c.execute('delete from sessions where token=?',(hashlib.sha256(sys.stdin.read().encode()).hexdigest(),));c.commit()`,
      ],
      { input: session.token },
    );
  }
})();
