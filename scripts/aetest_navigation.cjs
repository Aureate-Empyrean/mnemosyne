// Read-only check of Mnemosyne's navigation adapter inside the real Nexus on aetest (never
// production): views change the browser address, Back/Forward restore them, a deep link and a
// reload land on the same view. It only switches views; it creates, edits and deletes nothing.
//
//   PLAYWRIGHT_PATH=G:/AureateEmpyrean/mnemosyne/node_modules/playwright node scripts/aetest_navigation.cjs
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const NEXUS = "http://localhost:12334";
let passed = 0;
const check = (ok, what) => {
  if (!ok) {
    console.error(`FAIL ${what}`);
    process.exit(1);
  }
  passed++;
  console.log(`ok   ${what}`);
};

(async () => {
  const browser = await chromium.launch();
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(NEXUS + "/app/modules/mnemosyne");
    // Wait for either the sign-in form or the module frame; isVisible() does not wait.
    await page.locator("#username, #module-application").first().waitFor({ timeout: 30000 });
    if (await page.locator("#username").isVisible()) {
      const owner = JSON.parse(fs.readFileSync(path.join(__dirname, "../../empyrean-nexus/.data/aetest-owner.json"), "utf8"));
      await page.locator("#username").fill(owner.username);
      await page.locator("#password").fill(owner.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    const f = page.frameLocator("#module-application");
    await f.locator('.nav [data-view="task"]').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    const route = () => new URL(page.url()).searchParams.get("route") || "";
    const view = async (name) => {
      const item = f.locator(`.nav [data-view="${name}"]`).first();
      if (!(await item.isVisible())) await f.locator('[data-act="more-menu"], [data-act="menu"]').first().click().catch(() => {});
      await item.click();
      await page.waitForFunction((v) => (new URL(location.href).searchParams.get("route") || "").includes(`/${v}`), name === "task" ? "tasks" : name === "note" ? "notes" : name, { timeout: 10000 });
    };
    const start = route();
    check(page.url().includes("nav=1") && /^\/w\/[0-9a-f-]{36}\//.test(start), `${label}: Nexus carries Mnemosyne's route (${start})`);
    await view("note");
    const notes = route();
    await view("task");
    const tasks = route();
    check(notes.includes("/notes") && tasks.includes("/tasks"), `${label}: Notes and Tasks have their own addresses`);
    await page.goBack();
    await page.waitForFunction((r) => (new URL(location.href).searchParams.get("route") || "") === r, notes, { timeout: 10000 });
    await f.locator('.nav [data-view="note"][aria-current="page"], .nav [data-view="note"].is-active').first().waitFor({ timeout: 10000 }).catch(() => {});
    check(route() === notes, `${label}: Back returns to Notes`);
    await page.goForward();
    await page.waitForFunction((r) => (new URL(location.href).searchParams.get("route") || "") === r, tasks, { timeout: 10000 });
    check(route() === tasks, `${label}: Forward returns to Tasks`);
    await page.reload();
    await f.locator('.nav [data-view="task"]').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    check(route() === tasks, `${label}: reload keeps the Tasks address`);
    const deep = await browser.newPage({ viewport });
    await deep.context().addCookies(await page.context().cookies());
    await deep.goto(page.url());
    await deep.frameLocator("#module-application").locator('.nav [data-view="task"]').first().waitFor({ timeout: 30000 });
    await deep.waitForTimeout(800);
    check((new URL(deep.url()).searchParams.get("route") || "") === tasks, `${label}: a deep link opens Tasks`);
    await deep.close();
    check(errors.length === 0, `${label}: no page errors (${errors.join(" / ")})`);
    await page.close();
  }
  await browser.close();
  console.log(`${passed} checks passed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
