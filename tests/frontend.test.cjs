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
function setup(options = {}) {
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
  const mock = { conflict: false };
  w.parent.postMessage = (msg) => {
    calls.push(msg);
    let result, error;
    try {
      if (msg.action === "context")
        result = { applications: [], locale: "en-GB" };
      else if (msg.path === "/api/workspaces")
        result = options.workspaces || [
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
          if (mock.conflict)
            throw Error(
              "Resource changed. Reload before saving to avoid overwriting edits.",
            );
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
  return {
    dom,
    w,
    calls,
    resources,
    mock,
    $: (s) => w.document.querySelector(s),
    $$: (s) => [...w.document.querySelectorAll(s)],
  };
}
async function ready(options) {
  const x = setup(options);
  await settle();
  return x;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function view(x, name) {
  x.$(`[data-view="${name}"]`).click();
  await settle();
}
test("five primary destinations and workspace-scoped search", async () => {
  const x = await ready();
  try {
    assert.equal(x.w.document.querySelectorAll("nav [data-view]").length, 5);
    assert.equal(x.$("h1").textContent, "Home");
    x.$(".ws-switch").click();
    await settle();
    const work = x
      .$$(".popover .menu-item")
      .find((b) => b.textContent.includes("Work"));
    work.click();
    await settle();
    assert(x.calls.some((c) => c.path === "/api/w/w2/resources"));
    assert(
      x.calls.some(
        (c) => c.path === "/api/workspaces/w2/open" && c.method === "POST",
      ),
    );
    const search = x.$("#search");
    search.value = "private";
    search.dispatchEvent(new x.w.Event("input", { bubbles: true }));
    await pause(300);
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
    assert.equal(x.$$("#note-list [data-open-note]").length, 2);
    const area = x.$("#markdown");
    area.value = "# Updated";
    area.dispatchEvent(new x.w.Event("input", { bubbles: true }));
    x.$('#note-list [data-open-note="note2"]').click();
    await settle();
    assert.equal(x.resources[0].content, "# Updated");
    assert.equal(x.resources[0].revision, 2);
    assert.match(
      x.$('#note-list [data-open-note="note1"]').textContent,
      /Updated/,
    );
    assert.equal(x.$('[data-edit="title"]').value, "Second note");
    assert(!x.$("#drawer.open"));
  } finally {
    x.dom.window.close();
  }
});
test("new Note focuses writing and keeps details out of the way", async () => {
  const x = await ready();
  try {
    await view(x, "note");
    x.$('[data-act="new-note"]').click();
    await settle();
    await settle();
    assert.equal(x.w.document.activeElement.id, "markdown");
    assert.equal(x.resources.at(-1).kind, "note");
    assert(!x.$("#drawer.open"));
  } finally {
    x.dom.window.close();
  }
});
test("task completion acts in the list and preserves board column", async () => {
  const x = await ready();
  try {
    await view(x, "task");
    x.$('.tab[data-task-view="all"]').click();
    await settle();
    x.$('[data-complete="task1"]').click();
    await settle();
    assert.equal(x.resources.find((r) => r.id === "task1").status, "completed");
    assert.equal(
      x.resources.find((r) => r.id === "task1").board_column,
      "Review",
    );
    assert(!x.$("#drawer.open"));
    assert(x.$('[data-row="task1"] .undo-inline'), "Undo is offered in place");
    x.$('.tab[data-task-view="completed"]').click();
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
    const title = x.$("#quick-add-input");
    title.focus();
    title.value = "Quick task";
    title.dispatchEvent(
      new x.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await settle();
    await settle();
    assert.equal(x.resources.at(-1).title, "Quick task");
    assert.equal(x.resources.at(-1).kind, "task");
    assert(!x.$("#drawer.open"));
    assert.equal(x.w.document.activeElement.id, "quick-add-input");
    assert.equal(x.$("#quick-add-input").value, "");
  } finally {
    x.dom.window.close();
  }
});
test("Trash restores immediately but permanent deletion requires explicit confirmation", async () => {
  const x = await ready();
  try {
    await view(x, "trash");
    assert.match(x.$(".trash-row").textContent, /Deleted/);
    x.$('[data-act="trash-row-menu"][data-id="trash1"]').click();
    await settle();
    x.$(".popover .menu-item.danger").click();
    await settle();
    assert(x.$("#dialog").open);
    assert.match(x.$("#dialog").textContent, /can't be undone/);
    assert(
      !x.calls.some((c) => c.path?.endsWith("/trash") && c.method === "POST"),
    );
    x.$('#dialog [data-dialog-action="cancel"]').click();
    await pause(200);
    assert(!x.$("#dialog").open);
    assert(x.resources.some((r) => r.id === "trash1"));
    x.$('[data-act="restore"][data-id="trash1"]').click();
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
    x.$('[data-act="empty-trash"]').click();
    await settle();
    assert(x.$("#dialog").open);
    assert(
      !x.calls.some((c) => c.path?.endsWith("/trash") && c.method === "POST"),
    );
    x.$('#dialog [data-dialog-action="confirm"]').click();
    await pause(250);
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
    x.$('[data-act="preview-mode"]').click();
    await settle();
    assert.equal(x.$("#preview").textContent, "Preview");
    assert(x.calls.some((c) => c.path === "/api/preview"));
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
test("a save conflict keeps the text and never navigates away silently", async () => {
  const x = await ready();
  try {
    await view(x, "note");
    x.mock.conflict = true;
    const area = x.$("#markdown");
    area.value = "Unsaved thought";
    area.dispatchEvent(new x.w.Event("input", { bubbles: true }));
    x.$('#note-list [data-open-note="note2"]').click();
    await settle();
    await settle();
    assert(x.$("#dialog").open, "the user is asked what to do");
    x.$('#dialog [data-dialog-action="cancel"]').click();
    await pause(200);
    assert.equal(x.$('[data-edit="title"]').value, "First note");
    assert.equal(x.$("#markdown").value, "Unsaved thought");
    assert.equal(
      x.$(".note-editor .save-status").dataset.state,
      "conflict",
      "the conflict stays visible with recovery actions",
    );
  } finally {
    x.dom.window.close();
  }
});
test("editing Collections keeps memberships of Collections in Trash", async () => {
  const x = await ready();
  try {
    x.resources.push({
      ...x.resources[0],
      id: "c1",
      kind: "collection",
      title: "Research",
      collections: [],
    });
    x.resources[0].collections = ["c1", "gone"];
    await view(x, "note");
    assert.match(x.$(".meta-chips").textContent, /Collection in Trash/);
    x.$('[data-act="note-remove-collection"][data-id="c1"]').click();
    await pause(80);
    await settle();
    assert.deepEqual(x.resources[0].collections, ["gone"]);
  } finally {
    x.dom.window.close();
  }
});
test("reload reopens the last opened active Workspace", async () => {
  const zone = "Europe/Bratislava";
  const x = await ready({
    workspaces: [
      { id: "w1", title: "Personal", timezone: zone, opened_at: null },
      {
        id: "w2",
        title: "Work",
        timezone: zone,
        opened_at: "2026-10-01T08:00:00+00:00",
      },
      {
        id: "w3",
        title: "Old",
        timezone: zone,
        archived: 1,
        opened_at: "2026-10-09T08:00:00+00:00",
      },
    ],
  });
  try {
    assert(x.calls.some((c) => c.path === "/api/w/w2/resources"));
    assert(!x.calls.some((c) => c.path === "/api/w/w1/resources"));
  } finally {
    x.dom.window.close();
  }
});
