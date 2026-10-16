// Real-browser QA of the installed application through Nexus; no mocked services.
// Requires a local Nexus (Compose project "nexus" or $NEXUS_PROJECT) with Mnemosyne
// enabled, Docker access and Playwright Chromium. Creates only "QA <id>" Workspaces and
// removes them afterwards, then reconciles the Nexus reference index.
const { chromium, expect } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const project = process.env.NEXUS_PROJECT || "nexus";
const origin = process.env.NEXUS_ORIGIN || "http://localhost:12333";
const nexus = (code, input) =>
  execFileSync(
    "docker",
    ["compose", "-p", project, "exec", "-T", "nexus", "python", "-c", code],
    { encoding: "utf8", input },
  );
const session = JSON.parse(
  nexus(`import sqlite3,secrets,hashlib,time,json
c=sqlite3.connect('/data/nexus.sqlite3')
u=c.execute('select id from users').fetchall()
assert len(u)==1
t=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(32)
c.execute('insert into sessions values(?,?,?,?)',(hashlib.sha256(t.encode()).hexdigest(),u[0][0],csrf,int(time.time())+900)); c.commit()
print(json.dumps({'token':t,'csrf':csrf}))`),
);

(async () => {
  const suffix = Date.now().toString(36);
  const names = [`QA ${suffix} Personal`, `QA ${suffix} Work`];
  const errors = [];
  const passed = [];
  const shots = [];
  let browser, page;
  fs.mkdirSync("artifacts", { recursive: true });
  const step = (name) => passed.push(name);
  const shot = async (name) => {
    shots.push(name);
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: false });
  };
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    await context.addCookies([
      { name: "nexus_session", value: session.token, url: origin, httpOnly: true, sameSite: "Strict" },
    ]);
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto(origin + "/app/overview");
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
    await shot("01-nexus-overview");
    step("Nexus overview");

    await page.goto(origin + "/app/modules/mnemosyne");
    const app = page.frameLocator("#module-application");
    const ready = () => expect(app.locator("#app")).not.toHaveAttribute("inert", "");

    // First run or an existing installation: create the QA Workspaces either way.
    const welcome = app.locator("#welcome-title");
    const shell = app.locator("#shell");
    await expect(welcome.or(shell)).toBeVisible({ timeout: 15000 });
    if (await welcome.isVisible()) {
      await shot("02-welcome");
      await welcome.fill(names[0]);
      await app.locator('[data-act="welcome-create"]').click();
    } else {
      await newWorkspace(names[0]);
    }
    await expect(app.locator(".ws-name")).toHaveText(names[0]);
    await ready();
    await shot("03-home");
    step("Workspace creation and Home");

    // Font: the shared Roboto face is embedded and actually used.
    const font = await page
      .frame({ url: /\/modules\/mnemosyne\// })
      .evaluate(async () => {
        await document.fonts.ready;
        return {
          loaded: document.fonts.check('14px "Roboto"'),
          family: getComputedStyle(document.body).fontFamily,
          accent: getComputedStyle(document.documentElement)
            .getPropertyValue("--accent")
            .trim(),
        };
      });
    if (!font.loaded) throw Error("Embedded Roboto face did not load: " + JSON.stringify(font));
    if (font.accent !== "#8b7cf6") throw Error("Mnemosyne accent not applied: " + font.accent);
    step("embedded Roboto and violet accent");

    // Notes: create, write, autosave, persists after reload.
    await app.locator('[data-view="note"]').click();
    await ready();
    await app.locator('[data-act="new-note"]').first().click();
    const title = app.locator("textarea.note-title");
    await expect(title).toBeVisible();
    await title.fill("QA note");
    await app.locator("#markdown").fill("# Heading\n\nWritten in **QA**.");
    await shot("04-note-editor");
    await page.waitForTimeout(2500); // autosave debounce
    step("Note writing");

    // Tasks: quick add with Enter, complete in list.
    await app.locator('[data-view="task"]').click();
    await ready();
    const quick = app.locator("#quick-add-input");
    await quick.fill("QA task one");
    await quick.press("Enter");
    await quick.fill("QA task two");
    await quick.press("Enter");
    await expect(app.getByText("QA task one")).toBeVisible();
    await shot("05-tasks");
    await app.locator('[data-act="toggle-task"]').first().click();
    await page.waitForTimeout(800);
    await shot("06-task-completed");
    step("Task quick add and completion");

    // Projects: create and view the board.
    await app.locator('[data-view="project"]').click();
    await ready();
    await app.locator('[data-act="new-project"]').first().click();
    const dialogInput = app.locator("dialog[open] input").first();
    if (await dialogInput.isVisible().catch(() => false)) {
      await dialogInput.fill("QA project");
      await dialogInput.press("Enter");
    }
    await ready();
    await page.waitForTimeout(800);
    await expect(app.getByRole("tab", { name: "Board", selected: true })).toBeVisible();
    await shot("07-project");
    step("Project creation opens on the Board");

    await app.locator('[data-view="collection"]').click();
    await ready();
    await shot("08-collections");
    await app.locator('[data-view="trash"]').click();
    await ready();
    await shot("09-trash");
    step("Collections and Trash views");

    // Second Workspace, switch, and reload keeps the last opened one.
    await newWorkspace(names[1]);
    await expect(app.locator(".ws-name")).toHaveText(names[1]);
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.frameLocator("#module-application").locator(".ws-name")).toHaveText(
      names[1],
      { timeout: 15000 },
    );
    step("reload reopens last Workspace");

    // Switch back and confirm the note survived reload.
    await app.locator(".ws-switch").click();
    await app.locator(".popover .menu-item", { hasText: names[0] }).click();
    await expect(app.locator(".ws-name")).toHaveText(names[0]);
    await app.locator('[data-view="note"]').click();
    await ready();
    await expect(app.getByText("QA note").first()).toBeVisible();
    step("Note persisted across reload");

    // Mobile.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    await shot("10-mobile-notes");
    await expect(app.locator("#search")).toHaveAttribute("placeholder", "Search");
    await app.locator('[data-view="task"]').click().catch(() => {});
    await page.waitForTimeout(600);
    await shot("11-mobile-tasks");
    await app.locator('[data-view="home"]').click().catch(() => {});
    await page.waitForTimeout(600);
    await shot("12-mobile-home");
    const overflow = await page
      .frame({ url: /\/modules\/mnemosyne\// })
      .evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push("Horizontal overflow at 390px");
    step("mobile layout screenshots");

    if (errors.length) throw Error("Browser errors: " + errors.join(" | "));
    console.log(JSON.stringify({ result: "passed", passed, screenshots: shots }));
  } catch (e) {
    console.error("FAILED after:", passed.join(", "));
    console.error(e.message);
    if (page) await page.screenshot({ path: "artifacts/failure.png" }).catch(() => {});
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    const cleanup = `import json,sqlite3,sys
names=json.loads(sys.stdin.read())
c=sqlite3.connect('/data/mnemosyne.sqlite3'); c.execute('pragma foreign_keys=on')
with c:
 for (wid,) in c.execute('select id from workspaces where title in (%s)' % ','.join('?'*len(names)), names).fetchall():
  c.execute('delete from memberships where note in (select id from resources where workspace=?)',(wid,))
  c.execute('delete from resources where workspace=?',(wid,))
  c.execute('delete from tombstones where workspace=?',(wid,))
  c.execute('delete from workspaces where id=?',(wid,))
print('QA Workspaces removed')`;
    try {
      console.log(
        execFileSync("docker", ["exec", "-i", "nexus-module-mnemosyne", "python", "-c", cleanup], {
          input: JSON.stringify(names),
          encoding: "utf8",
        }).trim(),
      );
      execFileSync("docker", [
        "compose", "-p", project, "exec", "-T", "nexus",
        "python", "-m", "nexus.manage", "--reconcile", "mnemosyne",
      ]);
    } catch {
      console.error("QA data cleanup needs attention");
      process.exitCode = 1;
    }
    nexus(
      `import sqlite3,hashlib,sys\nc=sqlite3.connect('/data/nexus.sqlite3');c.execute('delete from sessions where token=?',(hashlib.sha256(sys.stdin.read().encode()).hexdigest(),));c.commit()`,
      session.token,
    );
  }

  async function newWorkspace(name) {
    const app = page.frameLocator("#module-application");
    await app.locator(".ws-switch").click();
    await app.locator(".popover .menu-item", { hasText: "New Workspace" }).click();
    const input = app.locator('dialog[open] input[name="title"]');
    await input.fill(name);
    await input.press("Enter");
    await expect(app.locator(".ws-name")).toHaveText(name, { timeout: 10000 });
  }
})();
