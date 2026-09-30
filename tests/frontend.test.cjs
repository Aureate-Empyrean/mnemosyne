const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const source = fs.readFileSync("frontend/app.js", "utf8");
const tick = () => new Promise((r) => setTimeout(r, 20));
async function settle() {
  await tick();
  await tick();
  await tick();
}
function setup() {
  const dom = new JSDOM(
    '<div id="app"></div><div id="toast" hidden></div><dialog id="dialog"></dialog>',
    { url: "http://localhost/modules/mnemosyne/", runScripts: "outside-only" },
  );
  const w = dom.window,
    calls = [];
  const base = {
    workspace: "w1",
    content: "Original",
    status: "open",
    priority: "none",
    tags: [],
    checklist: [],
    collections: [],
    revision: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    attachments: [],
    links: [],
    backlinks: [],
    parent: null,
  };
  const resources = [
    {
      ...base,
      id: "note1",
      kind: "note",
      title: "First note",
      reference: "nexus:v1:mnemosyne:note:note1",
    },
    { ...base, id: "note2", kind: "note", title: "Second note" },
    {
      ...base,
      id: "task1",
      kind: "task",
      title: "Do this",
      board_column: "Review",
    },
    {
      ...base,
      id: "trash1",
      kind: "note",
      title: "Recover me",
      trashed: 1,
      trashed_at: new Date().toISOString(),
    },
  ];
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  let policy = { days: 30 };
  w.parent.postMessage = (msg) => {
    calls.push(msg);
    let result, error;
    try {
      if (msg.action === "context")
        result = { applications: [], locale: "en-GB" };
      else if (msg.path === "/api/workspaces")
        result = [
          { id: "w1", title: "Personal", timezone: "Europe/Bratislava" },
          { id: "w2", title: "Work", timezone: "Europe/Bratislava" },
        ];
      else if (msg.path === "/api/preview") result = { html: "<p>Preview</p>" };
      else if (msg.path.endsWith("/trash/policy")) {
        if (msg.method === "PUT") policy = msg.body;
        result = policy;
      } else if (msg.path.endsWith("/trash")) {
        if (msg.body.action === "restore")
          resources
            .filter((r) => msg.body.ids.includes(r.id))
            .forEach((r) => {
              r.trashed = 0;
              r.trashed_at = null;
            });
        else
          for (let i = resources.length - 1; i >= 0; i--)
            if (
              resources[i].trashed &&
              (msg.body.action === "empty" ||
                msg.body.ids.includes(resources[i].id))
            )
              resources.splice(i, 1);
        result = {};
      } else if (msg.path.includes("/resources/")) {
        const id = msg.path.split("/").at(-1);
        const r = resources.find((r) => r.id === id);
        if (!r) throw Error("Not found");
        if (msg.method === "PUT") {
          assert.equal(msg.body.revision, r.revision);
          Object.assign(r, msg.body, { revision: r.revision + 1 });
        }
        result = { ...r };
      } else if (msg.path.includes("/resources")) {
        if (msg.method === "POST") {
          result = { ...base, ...msg.body, id: "created" + resources.length };
          resources.push(result);
        } else
          result = resources.filter(
            (r) =>
              r.workspace === msg.path.split("/")[3] &&
              !!r.trashed === msg.path.includes("view=trash"),
          );
      } else result = {};
    } catch (e) {
      error = e.message;
    }
    setTimeout(
      () =>
        w.dispatchEvent(
          new w.MessageEvent("message", {
            source: w,
            data: { channel: "empyrean-v1", id: msg.id, result, error },
          }),
        ),
      0,
    );
  };
  w.eval(source);
  return { dom, w, calls, resources, $: (s) => w.document.querySelector(s) };
}
async function ready() {
  const x = setup();
  await settle();
  return x;
}
async function view(x, name) {
  x.$(`[data-view="${name}"]`).click();
  await settle();
}
test("five primary destinations and workspace-scoped search", async () => {
  const x = await ready();
  try {
    assert.equal(x.w.document.querySelectorAll("nav [data-view]").length, 5);
    assert.equal(x.$("h1").textContent, "Home");
    const select = x.$("#workspace-select");
    select.value = "w2";
    select.dispatchEvent(new x.w.Event("change"));
    await settle();
    assert(x.calls.some((c) => c.path === "/api/w/w2/resources"));
    const search = x.$("#search");
    search.value = "private";
    search.dispatchEvent(new x.w.KeyboardEvent("keydown", { key: "Enter" }));
    await settle();
    assert(x.calls.some((c) => c.path === "/api/w/w2/resources?q=private"));
  } finally {
    x.dom.window.close();
  }
});
test("Notes keeps browsing beside writing and saves before switching notes", async () => {
  const x = await ready();
  try {
    await view(x, "note");
    assert(x.$("#note-list") && x.$("#markdown"));
    assert.equal(
      x.w.document.querySelectorAll("#note-list [data-open]").length,
      2,
    );
    const area = x.$("#markdown");
    area.value = "# Updated";
    area.dispatchEvent(new x.w.Event("input"));
    x.$('#note-list [data-open="note2"]').click();
    await settle();
    assert.equal(x.resources[0].content, "# Updated");
    assert.equal(x.resources[0].revision, 2);
    assert.match(x.$('#note-list [data-open="note1"]').textContent, /Updated/);
    assert.equal(x.$('[data-field="title"]').value, "Second note");
    assert(!x.$(".secondary").open);
  } finally {
    x.dom.window.close();
  }
});
test("new Note focuses writing and has metadata collapsed", async () => {
  const x = await ready();
  try {
    await view(x, "note");
    x.$("#new").click();
    await settle();
    assert.equal(x.w.document.activeElement.id, "markdown");
    assert.equal(x.resources.at(-1).kind, "note");
    assert(!x.$(".secondary").open);
  } finally {
    x.dom.window.close();
  }
});
test("task completion acts in the list and preserves board column", async () => {
  const x = await ready();
  try {
    await view(x, "task");
    x.$('[data-task-view="all"]').click();
    await settle();
    const checkbox = x.$('[data-complete="task1"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new x.w.Event("change"));
    await settle();
    assert.equal(x.resources.find((r) => r.id === "task1").status, "completed");
    assert.equal(
      x.resources.find((r) => r.id === "task1").board_column,
      "Review",
    );
    assert(!x.$("#detail"));
    x.$('[data-task-view="completed"]').click();
    await settle();
    assert(x.$('[data-complete="task1"]'));
  } finally {
    x.dom.window.close();
  }
});
test("title and Enter creates a Task without a detail form", async () => {
  const x = await ready();
  try {
    await view(x, "task");
    const title = x.$('#capture input[name="title"]');
    title.value = "Quick task";
    title.dispatchEvent(
      new x.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await settle();
    assert.equal(x.resources.at(-1).title, "Quick task");
    assert.equal(x.resources.at(-1).kind, "task");
    assert(!x.$("#detail"));
    assert.equal(x.w.document.activeElement.name, "title");
  } finally {
    x.dom.window.close();
  }
});
test("Trash restores immediately but permanent deletion requires explicit confirmation", async () => {
  const x = await ready();
  try {
    await view(x, "trash");
    assert.match(x.$(".trash-row").textContent, /Deleted/);
    x.$('[data-delete="trash1"]').click();
    await settle();
    assert(x.$("#dialog").open);
    assert(
      !x.calls.some((c) => c.path?.endsWith("/trash") && c.method === "POST"),
    );
    x.$("#cancel-modal").click();
    assert(x.resources.some((r) => r.id === "trash1"));
    x.$('[data-restore="trash1"]').click();
    await settle();
    assert.equal(x.resources.find((r) => r.id === "trash1").trashed, 0);
  } finally {
    x.dom.window.close();
  }
});
test("Empty Trash sends confirmed operation only after confirmation", async () => {
  const x = await ready();
  try {
    await view(x, "trash");
    x.$("#empty-trash").click();
    await settle();
    assert(x.$("#dialog").open);
    x.$("#dialog [data-submit]").click();
    await settle();
    const action = x.calls.find(
      (c) => c.path?.endsWith("/trash") && c.method === "POST",
    );
    assert.deepEqual(JSON.parse(JSON.stringify(action.body)), {
      action: "empty",
      ids: [],
      confirmed: true,
    });
    assert(!x.resources.some((r) => r.id === "trash1"));
  } finally {
    x.dom.window.close();
  }
});
test("preview uses sanitizer API and ignores untrusted message sources", async () => {
  const x = await ready();
  try {
    await view(x, "note");
    x.$("#preview-toggle").click();
    await settle();
    assert.equal(x.$("#preview").textContent, "Preview");
    x.w.dispatchEvent(
      new x.w.MessageEvent("message", {
        source: {},
        data: { channel: "empyrean-v1", id: "forged", result: "intrusion" },
      }),
    );
    assert(!x.w.document.body.textContent.includes("intrusion"));
  } finally {
    x.dom.window.close();
  }
});
