const catalogs = /*CATALOGS*/ {};
let activeLocale = "en";
function t(key) {
  return (
    catalogs[activeLocale]?.[key] ??
    catalogs[activeLocale.split("-")[0]]?.[key] ??
    catalogs.en?.[key] ??
    key
  );
}
("use strict");
const $ = (s) => document.querySelector(s),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let serial = 0;
const pending = new Map();
window.addEventListener("message", (e) => {
  if (e.source !== parent || e.data?.channel !== "empyrean-v1") return;
  const p = pending.get(e.data.id);
  if (p) {
    clearTimeout(p.timer);
    pending.delete(e.data.id);
    e.data.error ? p.reject(Error(e.data.error)) : p.resolve(e.data.result);
  }
});
function bridge(action, data = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++serial),
      timer = setTimeout(() => {
        pending.delete(id);
        reject(
          Error(
            t(
              "Nexus did not respond. Your unsaved text is still in the editor.",
            ),
          ),
        );
      }, 15000);
    pending.set(id, { resolve, reject, timer });
    parent.postMessage({ channel: "empyrean-v1", id, action, ...data }, "*");
  });
}
const api = (path, method = "GET", body) =>
  bridge("request", { path, method, ...(body === undefined ? {} : { body }) });
const state = {
  workspaces: [],
  wid: null,
  view: "today",
  resources: [],
  selected: null,
  context: { applications: [], locale: "en" },
  query: "",
  filter: null,
};
let dirty = false,
  saveTimer,
  saveFlight = null,
  previewMode = false,
  renderVersion = 0;
const fields = [
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
];
const glyph = { note: "▤", task: "☑", project: "◇", collection: "▦" };
const views = {
  today: ["☀", t("Today")],
  inbox: ["↓", t("Inbox")],
  upcoming: ["↗", t("Upcoming")],
  overdue: ["◷", t("Overdue")],
  note: ["▤", t("Notes")],
  task: ["☑", t("All Tasks")],
  project: ["◇", t("Projects")],
  collection: ["▦", t("Collections")],
  trash: ["⌫", t("Trash")],
};
function toast(text, error = false) {
  $("#toast").textContent = text;
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  setTimeout(() => ($("#toast").hidden = true), 6500);
}
function guard(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      toast(e.message, true);
    }
  };
}
function button(id, fn) {
  const el = $("#" + id);
  if (el) el.onclick = guard(fn);
}
function ws() {
  return state.workspaces.find((w) => w.id === state.wid);
}
function wp(path) {
  return "/api/w/" + state.wid + path;
}
function day() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ws()?.timezone || "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function displayDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(state.context.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value + "T12:00:00"));
}
function activateForm(form) {
  if (!form) return;
  const handler = form.onsubmit;
  const action = form.querySelector(
    'button[type="submit"], button:not([type]), button[data-submit]',
  );
  if (!action || !handler) return;
  action.type = "button";
  action.dataset.submit = "true";
  const submit = async () => {
    if (action.disabled || !form.reportValidity()) return;
    action.disabled = true;
    try {
      await handler({ target: form, preventDefault() {} });
    } finally {
      action.disabled = false;
    }
  };
  action.onclick = submit;
  form.onsubmit = (event) => event.preventDefault();
  form.onkeydown = (event) => {
    if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
      event.preventDefault();
      submit();
    }
  };
}
function modal(title, html, onSubmit) {
  const d = $("#dialog");
  d.innerHTML = `<form method="dialog"><div class="row between"><h2>${esc(title)}</h2><button type="button" id="close-modal" class="quiet" aria-label="${esc(t("Close"))}">×</button></div>${html}<div class="row end"><button type="button" id="cancel-modal">${esc(t("Cancel"))}</button><button class="primary" type="submit">${esc(t("Save"))}</button></div></form>`;
  d.showModal();
  $("#close-modal").onclick = $("#cancel-modal").onclick = () => d.close();
  d.querySelector("form").onsubmit = guard(async (e) => {
    e.preventDefault();
    await onSubmit(new FormData(e.target));
    d.close();
  });
  activateForm(d.querySelector("form"));
}
async function confirmAction(title, text, fn) {
  modal(title, `<p>${esc(text)}</p>`, fn);
}
function resourceRow(r) {
  return `<button class="resource-row" data-open="${r.id}" style="${r.accent ? "border-left:3px solid " + esc(r.accent) : ""}"><span class="resource-icon">${esc(r.icon || glyph[r.kind])}</span><span class="grow"><strong>${esc(r.title)}${r.pinned ? " · ★" : ""}</strong><small>${esc(r.kind)}${r.tags.length ? " · " + esc(r.tags.join(" · ")) : ""}${r.due_date ? " · " + esc(displayDate(r.due_date)) : ""}</small></span>${r.kind === "task" ? `<span class="badge ${esc(r.priority)}">${esc(r.priority === "none" ? r.status : r.priority)}</span>` : ""}${r.kind === "project" ? `<span class="badge">${esc(r.status)}</span>` : ""}</button>`;
}
function wireRows() {
  document
    .querySelectorAll("[data-open]")
    .forEach((el) => (el.onclick = guard(() => openResource(el.dataset.open))));
}
function empty(title, description) {
  return `<div class="empty"><div class="empty-icon">✧</div><h2>${esc(title)}</h2><p>${esc(description)}</p></div>`;
}
function shell() {
  const workspace = ws();
  $("#app").innerHTML =
    `<div class="layout"><aside class="sidebar"><div class="brand"><span class="mark">✧</span><div>${esc(t("Mnemosyne"))}<small>${esc(t("Aureate Empyrean"))}</small></div></div><div class="workspace-control"><label for="workspace-select">${esc(t("WORKSPACE"))}</label><div class="row"><select id="workspace-select" aria-label="${esc(t("Active Workspace"))}">${state.workspaces
      .filter((w) => !w.archived || w.id === state.wid)
      .map(
        (w) =>
          `<option value="${w.id}" ${w.id === state.wid ? "selected" : ""}>${esc(w.title)}${w.archived ? " · Archived" : ""}</option>`,
      )
      .join(
        "",
      )}</select><button id="workspace-settings" class="quiet" aria-label="${esc(t("Manage Workspaces"))}">⋯</button></div></div><nav aria-label="${esc(t("Mnemosyne navigation"))}">${Object.entries(
      views,
    )
      .map(
        ([key, [symbol, label]], i) =>
          `${i === 4 ? '<div class="nav-label">Your knowledge</div>' : ""}<button data-view="${key}" class="${state.view === key && !state.selected ? "active" : ""}"><span class="nav-symbol">${symbol}</span>${esc(t(label))}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><button id="daily" class="quiet">◫ &nbsp; Daily Note</button><button id="sync-retry" class="quiet small">${esc(t("Nexus sync"))}</button><button id="switch-app" class="quiet">⇄ &nbsp; Applications</button><small>${esc(t("Knowledge, with a place to belong."))}</small></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">${esc(workspace?.title || t("Your knowledge"))}<span>/</span>${esc(state.selected?.kind || views[state.view]?.[1] || state.view)}</div><input id="search" class="search" type="search" aria-label="${esc(t("Search active Workspace"))}" placeholder="${esc(t("Search this Workspace…"))}" value="${esc(state.query)}"></header><div class="content" id="content"></div></main></div>`;
  $("#workspace-select").onchange = guard(async (e) => {
    await save();
    state.wid = e.target.value;
    state.selected = null;
    state.filter = null;
    state.query = "";
    await reload();
  });
  button("workspace-settings", manageWorkspaces);
  const syncStatus = () =>
    api("/api/sync").then((result) => {
      const el = $("#sync-retry");
      if (el)
        el.textContent = result.pending
          ? t("Nexus sync") + " · " + result.pending + " " + t("pending")
          : t("Nexus synced");
    });
  button("sync-retry", async () => {
    await api("/api/sync", "POST");
    await syncStatus();
  });
  syncStatus().catch(() => {});
  button("daily", async () => {
    await save();
    const r = await api(wp("/daily/" + day()), "POST");
    await openResource(r.id);
  });
  button("switch-app", () => {
    const d = $("#dialog");
    d.innerHTML = `<h2>${esc(t("Applications"))}</h2><div class="list"><button data-app="nexus">${esc(t("Nexus · Control center"))}</button>${state.context.applications.map((a) => `<button data-app="${esc(a.id)}">${esc(a.name)}</button>`).join("")}</div><p><button id="close-apps">${esc(t("Close"))}</button></p>`;
    d.showModal();
    button("close-apps", () => d.close());
    d.querySelectorAll("[data-app]").forEach(
      (b) =>
        (b.onclick = guard(async () => {
          await save();
          bridge("navigate", { module: b.dataset.app }).catch(() => {});
        })),
    );
  });
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        await save();
        state.view = b.dataset.view;
        state.selected = null;
        state.filter = null;
        state.query = "";
        await reload();
      })),
  );
  $("#search").onkeydown = guard(async (e) => {
    if (e.key === t("Enter")) {
      await save();
      state.query = e.target.value;
      state.selected = null;
      state.filter = null;
      await reload();
    }
  });
}
async function reload() {
  const epoch = ++renderVersion;
  const resources = state.wid ? await api(wp("/resources")) : [];
  if (epoch !== renderVersion) return;
  state.resources = resources;
  shell();
  if (!state.wid) return welcome();
  if (state.selected) return renderEditor();
  await renderList();
}
function welcome() {
  $("#content").innerHTML =
    `<div class="welcome"><div class="eyebrow">${esc(t("A place for what matters"))}</div><h1>${esc(t("Your knowledge."))}<br>${esc(t("Your own space."))}</h1><p class="subtitle">${esc(t("Bring notes, tasks and projects together without mixing the different parts of your life. Start with a Workspace."))}</p><p><button id="first-workspace" class="primary">${esc(t("Create a Workspace"))}</button></p></div>`;
  button("first-workspace", () => workspaceForm());
}
function workspaceForm(existing) {
  modal(
    existing ? t("Edit Workspace") : t("Create Workspace"),
    `<label>${esc(t("Name"))}<input name="title" required maxlength="100" value="${esc(existing?.title || "")}"></label><label>${esc(t("Timezone"))}<input name="timezone" required value="${esc(existing?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)}"></label>${existing ? `<label><input type="checkbox" name="archived" ${existing.archived ? "checked" : ""}> Archived (read-only)</label>` : ""}`,
    async (f) => {
      await save();
      const body = {
        title: f.get("title"),
        timezone: f.get("timezone"),
        archived: f.has("archived"),
      };
      const r = await api(
        "/api/workspaces" + (existing ? "/" + existing.id : ""),
        existing ? "PUT" : "POST",
        body,
      );
      state.workspaces = await api("/api/workspaces");
      state.wid = r.id;
      state.selected = null;
      await reload();
    },
  );
}
async function manageWorkspaces() {
  await save();
  state.selected = null;
  shell();
  $("#content").innerHTML =
    `<div class="page-heading"><div><div class="eyebrow">${esc(t("Separate spaces, clear focus"))}</div><h1>${esc(t("Workspaces"))}</h1><p class="subtitle">${esc(t("Each Workspace keeps its own knowledge and work."))}</p></div><button id="add-workspace" class="primary">${esc(t("New Workspace"))}</button></div>${state.workspaces.map((w) => `<div class="panel workspace-card"><span class="resource-icon">◇</span><div class="grow"><h2>${esc(w.title)}</h2><span class="muted small">${esc(w.timezone)}${w.archived ? " · Archived" : ""}</span></div><button data-workspace="${w.id}">${esc(t("Open"))}</button><button data-edit-ws="${w.id}">${esc(t("Edit"))}</button></div>`).join("")}`;
  button("add-workspace", () => workspaceForm());
  document
    .querySelectorAll("[data-edit-ws]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          workspaceForm(
            state.workspaces.find((w) => w.id === b.dataset.editWs),
          )),
    );
  document.querySelectorAll("[data-workspace]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        state.wid = b.dataset.workspace;
        await reload();
      })),
  );
}
async function renderList() {
  let title = state.query ? t("Search results") : views[state.view][1];
  let params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  else if (["note", "task", "project", "collection"].includes(state.view))
    params.set("kind", state.view);
  else params.set("view", state.view);
  if (state.filter) {
    params.set("collection", state.filter.id);
    title = state.filter.title;
  }
  let rows = await api(wp("/resources?" + params.toString()));
  if (state.view === "project" && !state.query && !state.showArchived)
    rows = rows.filter((r) => r.status !== "archived");
  const kind = ["note", "project", "collection"].includes(state.view)
    ? state.view
    : "task";
  $("#content").innerHTML =
    `<div class="page-heading"><div><div class="eyebrow">${esc(ws().archived ? t("Archived Workspace") : ws().title)}</div><h1>${esc(title)}</h1><p class="subtitle">${state.view === "today" && !state.query ? esc(displayDate(day())) + " · Make room for what matters." : rows.length + " " + (rows.length === 1 ? "resource" : "resources") + " in this Workspace"}</p></div><div class="row">${state.view === "project" ? `<button id="toggle-archived" class="quiet">${state.showArchived ? t("Hide archived") : t("Show archived")}</button>` : ""}<button id="export" class="quiet">${esc(t("Export"))}</button>${!ws().archived && state.view !== "trash" ? `<button id="new" class="primary">+ New ${kind}</button>` : ""}</div></div>${!ws().archived && ["today", "inbox", "task"].includes(state.view) && !state.query ? '<form id="capture" class="capture"><select name="kind" aria-label="Capture type"><option value="task">Task</option><option value="note">Note</option></select><input name="title" aria-label="Quick capture" placeholder="Capture a thought or something to do…" required maxlength="200"><button type="submit">Add</button></form>' : ""}<div class="list">${rows.length ? rows.map(resourceRow).join("") : empty(state.query ? t("Nothing found") : state.view === "today" ? "A little space to focus" : t("Nothing here yet"), state.query ? t("Try another title, tag or phrase. Search stays within this Workspace.") : state.view === "today" ? t("Tasks starting or due today will appear here. Capture something, or open your Daily Note.") : t("Create your first ") + kind + " when you’re ready.")}</div>`;
  button("toggle-archived", async () => {
    state.showArchived = !state.showArchived;
    await renderList();
  });
  button("new", () => create(kind));
  button("export", async () =>
    download(
      "mnemosyne-" + ws().title + ".json",
      JSON.stringify(await api(wp("/export")), null, 2),
      "application/json",
    ),
  );
  if ($("#capture"))
    $("#capture").onsubmit = guard(async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      await create(f.get("kind"), f.get("title"));
    });
  activateForm($("#capture"));
  wireRows();
}
async function create(kind, title = t("Untitled")) {
  await save();
  const r = await api(wp("/resources"), "POST", {
    kind,
    title,
    status: kind === "project" ? "active" : "open",
  });
  await openResource(r.id);
}
async function openResource(id) {
  await save();
  state.selected = await api(wp("/resources/" + id));
  state.query = "";
  previewMode = false;
  await reload();
}
function options(kind, selected, omit) {
  return (
    `<option value="">${esc(t("None"))}</option>` +
    state.resources
      .filter((r) => r.kind === kind && r.id !== omit)
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${esc(r.title)}</option>`,
      )
      .join("")
  );
}
function selectField(key, label, values, selected) {
  return `<label>${esc(label)}<select aria-label="${esc(label)}" data-field="${key}">${values.map((v) => `<option value="${v}" ${v === selected ? "selected" : ""}>${v.replaceAll("-", " ")}</option>`).join("")}</select></label>`;
}
function renderEditor() {
  const r = state.selected,
    readOnly = !!ws().archived;
  $("#content").innerHTML =
    `<div class="row between" style="margin-bottom:25px"><button id="back" class="quiet">← ${views[state.view]?.[1] || t("Back")}</button><div class="row"><span id="save-state" class="save-state">${esc(t("Saved"))}</span><button id="save-now">${esc(t("Save"))}</button><button id="trash" class="quiet ${r.trashed ? "" : "danger"}">${r.trashed ? t("Restore") : t("Move to Trash")}</button>${r.trashed ? '<button id="delete" class="danger">Delete permanently</button>' : ""}</div></div><div class="editor-layout"><section class="editor-main"><div class="eyebrow">${esc(r.daily_date ? t("Daily Note · ") + displayDate(r.daily_date) : r.kind)}</div><input class="title-input" data-field="title" aria-label="${esc(t("Title"))}" value="${esc(r.title)}" maxlength="200"><div class="toolbar"><button data-insert="# ">${esc(t("H1"))}</button><button data-insert="## ">${esc(t("H2"))}</button><button data-wrap="**">${esc(t("Bold"))}</button><button data-wrap="*">${esc(t("Italic"))}</button><button data-insert="- ">${esc(t("List"))}</button><button data-insert="- [ ] ">${esc(t("Checklist"))}</button><button data-insert="> ">${esc(t("Quote"))}</button><button id="insert-code">${esc(t("Code"))}</button><button id="insert-table">${esc(t("Table"))}</button><button id="insert-link">${esc(t("Note link"))}</button><button id="preview-toggle">${esc(t("Preview"))}</button></div><textarea id="markdown" class="markdown-input" data-field="content" aria-label="${esc(t("Markdown content"))}" placeholder="${esc(t("Start writing…"))}" maxlength="40000">${esc(r.content)}</textarea><article id="preview" class="preview" hidden></article>${r.kind === "task" ? `<section><h3>${esc(t("Checklist"))}</h3><div id="checklist"></div><form id="add-check" class="row"><input id="check-text" aria-label="${esc(t("New checklist item"))}" placeholder="${esc(t("Add a step…"))}" maxlength="500"><button>${esc(t("Add"))}</button></form></section>` : ""}${r.kind === "project" ? '<section><div class="row between section-heading"><h2>Project board</h2><button id="project-task">+ Task</button></div><p class="muted small">Columns organize work. Task lifecycle is independent.</p><div class="board" id="board"></div><h2 class="section-heading">Related Notes</h2><div id="project-notes" class="list"></div></section>' : ""}${r.kind === "collection" ? '<section><h2>Notes in this Collection</h2><div id="collection-notes" class="list"></div><h2 class="section-heading">Child Collections</h2><div id="collection-children" class="list"></div></section>' : ""}<section><h2 class="section-heading">${esc(t("Attachments"))}</h2><div id="attachments"></div><label>${esc(t("Add a file · up to 1 MiB"))}<input id="file" type="file"></label><p class="small muted">${esc(t("Files live in Nexus shared storage."))}</p></section><section><h2 class="section-heading">${esc(t("Links & backlinks"))}</h2><div id="links"></div><button id="add-reference">+ Link a resource</button><button id="index-backlinks" class="quiet">${esc(t("Refresh Nexus backlinks"))}</button><div id="external-backlinks"></div><h3>${esc(t("Notes and resources linking here"))}</h3><div class="list">${r.backlinks?.map(resourceRow).join("") || '<p class="muted small">No backlinks in this Workspace.</p>'}</div></section></section><aside class="properties"><h3>${esc(t("Properties"))}</h3>${r.kind === "task" ? selectField("status", t("Lifecycle"), ["open", "completed", "cancelled"], r.status) + selectField("priority", t("Priority"), ["none", "low", "medium", "high", "urgent"], r.priority) : ""}${r.kind === "project" ? selectField("status", t("Lifecycle"), ["active", "on-hold", "completed", "archived"], r.status) : ""}${["task", "project"].includes(r.kind) ? `<label>${esc(t("Start date"))}<input type="date" data-field="start_date" value="${r.start_date || ""}"></label><label>${esc(t("Deadline"))}<input type="date" data-field="due_date" value="${r.due_date || ""}"></label>${r.completed_at ? `<p class="small muted">Completed ${esc(new Date(r.completed_at).toLocaleString(state.context.locale))}</p>` : ""}` : ""}${["note", "task"].includes(r.kind) ? `<label>${esc(t("Project"))}<select aria-label="${esc(t("Project"))}" data-field="project">${options("project", r.project)}</select></label>` : ""}${r.kind === "task" ? `<label>${esc(t("Related Note"))}<select aria-label="${esc(t("Related Note"))}" data-field="related_note">${options("note", r.related_note)}</select></label>` + selectField("board_column", t("Board column"), ["Backlog", "In progress", "Review", "Done"], r.board_column) : ""}${r.kind === "collection" ? `<label>${esc(t("Parent Collection"))}<select aria-label="${esc(t("Parent Collection"))}" data-field="parent">${options("collection", r.parent, r.id)}</select></label>` : ""}<label>${esc(t("Tags (comma separated)"))}<input data-field="tags" value="${esc(r.tags.join(", "))}"></label><div class="row"><label>${esc(t("Icon"))}<input data-field="icon" value="${esc(r.icon)}" maxlength="8"></label><label>${esc(t("Accent"))}<input type="color" data-field="accent" value="${r.accent || "#8b7cf6"}"></label></div><button id="reset-accent" class="quiet small">${esc(t("Reset resource accent"))}</button><label><input type="checkbox" data-field="pinned" ${r.pinned ? "checked" : ""}> Pinned / favorite</label>${
      r.kind === "note"
        ? `<h3>${esc(t("Collections"))}</h3><div class="checks">${
            state.resources
              .filter((x) => x.kind === "collection")
              .map(
                (c) =>
                  `<label><input data-collection="${c.id}" type="checkbox" ${r.collections.includes(c.id) ? "checked" : ""}>${esc(c.title)}</label>`,
              )
              .join("") ||
            '<p class="muted small">Create a Collection to organize Notes.</p>'
          }</div>`
        : ""
    }<details><summary>${esc(t("Resource identity"))}</summary><p class="ref">${esc(r.reference)}</p></details><p class="small muted">Updated ${esc(new Date(r.updated_at).toLocaleString(state.context.locale))}</p></aside></div>`;
  button("back", async () => {
    await save();
    state.selected = null;
    await reload();
  });
  button("save-now", () => save());
  button("trash", async () => {
    state.selected.trashed = !state.selected.trashed;
    markDirty();
    await save();
    state.selected = null;
    await reload();
  });
  button("delete", () =>
    confirmAction(
      t("Permanently delete?"),
      t(
        "The resource cannot be restored. Incoming references will remain unresolved.",
      ),
      async () => {
        await api(wp("/resources/" + r.id), "DELETE");
        dirty = false;
        state.selected = null;
        await reload();
      },
    ),
  );
  document.querySelectorAll("[data-field]").forEach(
    (el) =>
      (el.oninput = () => {
        const key = el.dataset.field;
        state.selected[key] =
          key === "tags"
            ? el.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : el.type === "checkbox"
              ? el.checked
              : [
                    "parent",
                    "project",
                    "related_note",
                    "start_date",
                    "due_date",
                  ].includes(key)
                ? el.value || null
                : el.value;
        markDirty();
      }),
  );
  document.querySelectorAll("[data-collection]").forEach(
    (el) =>
      (el.onchange = () => {
        state.selected.collections = [
          ...document.querySelectorAll("[data-collection]:checked"),
        ].map((c) => c.dataset.collection);
        markDirty();
      }),
  );
  button("reset-accent", () => {
    state.selected.accent = "";
    markDirty();
  });
  function insert(text, wrap = "") {
    const area = $("#markdown"),
      start = area.selectionStart,
      end = area.selectionEnd;
    area.setRangeText(
      text + area.value.slice(start, end) + wrap,
      start,
      end,
      "end",
    );
    state.selected.content = area.value;
    area.focus();
    markDirty();
  }
  document
    .querySelectorAll("[data-insert]")
    .forEach((b) => (b.onclick = () => insert(b.dataset.insert)));
  document
    .querySelectorAll("[data-wrap]")
    .forEach((b) => (b.onclick = () => insert(b.dataset.wrap, b.dataset.wrap)));
  button("insert-code", () => insert("```\n", "\n```"));
  button("insert-table", () =>
    insert("| Heading | Heading |\n| --- | --- |\n| Cell | Cell |\n"),
  );
  button("insert-link", () =>
    modal(
      t("Link a Note"),
      `<label>${esc(t("Note"))}<select name="note">${options("note", null, r.id)}</select></label>`,
      async (f) => {
        const note = state.resources.find((x) => x.id === f.get("note"));
        if (note)
          insert(
            "[" +
              note.title.replace(/[\[\]]/g, "") +
              "](" +
              note.reference +
              ")",
          );
      },
    ),
  );
  button("preview-toggle", async () => {
    previewMode = !previewMode;
    $("#markdown").hidden = previewMode;
    $("#preview").hidden = !previewMode;
    $("#preview-toggle").textContent = previewMode
      ? t("Edit Markdown")
      : t("Preview");
    if (previewMode) {
      const result = await api("/api/preview", "POST", {
        content: state.selected.content,
      });
      $("#preview").innerHTML = result.html;
      $("#preview")
        .querySelectorAll("a")
        .forEach(
          (a) =>
            (a.onclick = guard(async (e) => {
              e.preventDefault();
              const target = a.getAttribute("href");
              if (target?.startsWith("nexus:v1:mnemosyne:")) {
                const rid = target.split(":").at(-1);
                await openResource(rid);
              } else if (target && /^(https?:|mailto:)/.test(target)) {
                await bridge("external", { url: target });
              }
            })),
        );
    }
  });
  if (r.kind === "task") renderChecklist();
  if (r.kind === "project") renderBoard();
  if (r.kind === "collection") {
    const notes = state.resources.filter((n) => n.collections.includes(r.id));
    $("#collection-notes").innerHTML =
      notes.map(resourceRow).join("") ||
      '<p class="muted">No Notes assigned yet.</p>';
    $("#collection-children").innerHTML =
      state.resources
        .filter((n) => n.parent === r.id)
        .map(resourceRow)
        .join("") || '<p class="muted">No child Collections.</p>';
  }
  renderAttachments();
  renderLinks();
  button("add-reference", () =>
    modal(
      t("Link a resource"),
      `<label>${esc(t("Canonical reference"))}<input name="target" required placeholder="${esc(t("nexus:v1:module:type:id"))}"></label><label>${esc(t("Share backlink with module IDs (optional, comma separated)"))}<input name="readers"></label><p class="small muted">${esc(t("Sharing also permits these modules to resolve this resource’s title. Leave empty to keep the relationship private."))}</p>`,
      async (f) => {
        await save();
        await api(wp("/resources/" + r.id + "/links"), "POST", {
          target: f.get("target"),
          readers: f
            .get("readers")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        });
        await openResource(r.id);
      },
    ),
  );
  button("index-backlinks", async () => {
    await save();
    const data = await api(wp("/resources/" + r.id + "/references"));
    $("#external-backlinks").innerHTML =
      data.references
        .map((e) => `<p class="ref">${esc(e.source)}</p>`)
        .join("") || '<p class="muted small">No visible Nexus backlinks.</p>';
    if (data.has_more)
      $("#external-backlinks").insertAdjacentHTML(
        "beforeend",
        '<p class="muted small">Showing the first 100 references.</p>',
      );
  });
  $("#file").onchange = guard(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1048576) throw Error(t("Attachment limit is 1 MiB."));
    await save();
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await api(wp("/resources/" + r.id + "/attachments"), "POST", {
      name: file.name,
      media_type: file.type || "application/octet-stream",
      content,
    });
    await openResource(r.id);
  });
  wireRows();
  if (readOnly)
    document
      .querySelectorAll(
        "[data-field],[data-collection],#file,#save-now,#trash,#delete,.toolbar button,#add-reference,#reset-accent,#add-check button",
      )
      .forEach((x) => (x.disabled = true));
}
function markDirty() {
  dirty = true;
  const el = $("#save-state");
  if (el) el.textContent = t("Unsaved");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () =>
      save().catch((e) => {
        const el = $("#save-state");
        if (el) el.textContent = t("Not saved");
        toast(e.message, true);
      }),
    700,
  );
}
async function save() {
  clearTimeout(saveTimer);
  if (saveFlight) {
    await saveFlight;
    if (dirty) return save();
    return;
  }
  if (!dirty || !state.selected) return;
  const current = state.selected,
    body = Object.fromEntries(
      fields
        .filter((k) => current[k] !== undefined)
        .map((k) => [k, current[k]]),
    );
  dirty = false;
  const el = $("#save-state");
  if (el) el.textContent = t("Saving…");
  saveFlight = api(wp("/resources/" + current.id), "PUT", body)
    .then((result) => {
      current.revision = result.revision;
      current.updated_at = result.updated_at;
      current.completed_at = result.completed_at;
      if (el) el.textContent = dirty ? t("Unsaved") : t("Saved");
    })
    .catch((e) => {
      dirty = true;
      if (el) el.textContent = t("Not saved");
      throw e;
    })
    .finally(() => (saveFlight = null));
  await saveFlight;
}
function renderChecklist() {
  const r = state.selected;
  $("#checklist").innerHTML = r.checklist
    .map(
      (c, i) =>
        `<div class="check-item"><input type="checkbox" data-check="${i}" ${c.done ? "checked" : ""} aria-label="Complete ${esc(c.text)}"><input type="text" data-check-text="${i}" value="${esc(c.text)}" maxlength="500" aria-label="${esc(t("Checklist item"))}"><button data-remove-check="${i}" aria-label="${esc(t("Remove checklist item"))}">×</button></div>`,
    )
    .join("");
  document.querySelectorAll("[data-check]").forEach(
    (x) =>
      (x.onchange = () => {
        r.checklist[+x.dataset.check].done = x.checked;
        markDirty();
      }),
  );
  document.querySelectorAll("[data-check-text]").forEach(
    (x) =>
      (x.oninput = () => {
        r.checklist[+x.dataset.checkText].text = x.value;
        markDirty();
      }),
  );
  document.querySelectorAll("[data-remove-check]").forEach(
    (x) =>
      (x.onclick = () => {
        r.checklist.splice(+x.dataset.removeCheck, 1);
        renderChecklist();
        markDirty();
      }),
  );
  $("#add-check").onsubmit = (e) => {
    e.preventDefault();
    const text = $("#check-text").value.trim();
    if (text) {
      r.checklist.push({ text, done: false });
      $("#check-text").value = "";
      renderChecklist();
      markDirty();
    }
  };
  activateForm($("#add-check"));
}
function renderBoard() {
  const r = state.selected,
    tasks = state.resources.filter(
      (t) => t.kind === "task" && t.project === r.id,
    );
  $("#board").innerHTML = ["Backlog", "In progress", "Review", "Done"]
    .map(
      (c) =>
        `<div class="column"><h3>${c} <span class="muted">${tasks.filter((t) => t.board_column === c).length}</span></h3>${tasks
          .filter((t) => t.board_column === c)
          .map(resourceRow)
          .join("")}</div>`,
    )
    .join("");
  $("#project-notes").innerHTML =
    state.resources
      .filter((t) => t.kind === "note" && t.project === r.id)
      .map(resourceRow)
      .join("") ||
    '<p class="muted small">Assign Notes to this Project from their properties.</p>';
  button("project-task", async () => {
    await save();
    const task = await api(wp("/resources"), "POST", {
      kind: "task",
      title: t("Untitled task"),
      project: r.id,
    });
    await openResource(task.id);
  });
}
function renderAttachments() {
  const r = state.selected;
  $("#attachments").innerHTML =
    r.attachments
      ?.map(
        (a) =>
          `<div class="attachment"><button data-file="${a.id}">↧ ${esc(a.name)} <span class="muted small">${(a.size / 1024).toFixed(1)} KiB</span></button>${/^image\/(png|jpeg|gif|webp)$/.test(a.media_type) ? `<button data-image="${a.id}">${esc(t("Preview"))}</button>` : ""}<button data-remove-file="${a.id}" aria-label="${esc(t("Remove attachment"))}">×</button></div>`,
      )
      .join("") || '<p class="muted small">No attachments.</p>';
  document.querySelectorAll("[data-file]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        const a = await api(
          wp("/resources/" + r.id + "/attachments/" + b.dataset.file),
        );
        const bytes = Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0));
        download(a.name, bytes, "application/octet-stream");
      })),
  );
  document.querySelectorAll("[data-image]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        const a = await api(
          wp("/resources/" + r.id + "/attachments/" + b.dataset.image),
        );
        const img = document.createElement("img");
        img.src = "data:" + a.media_type + ";base64," + a.content;
        img.alt = a.name;
        img.style.cssText =
          "display:block;max-width:100%;max-height:400px;margin:16px 0";
        b.closest(".attachment").after(img);
        b.remove();
      })),
  );
  document.querySelectorAll("[data-remove-file]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        await api(
          wp("/resources/" + r.id + "/attachments/" + b.dataset.removeFile),
          "DELETE",
        );
        await openResource(r.id);
      })),
  );
}
function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function renderLinks() {
  const r = state.selected;
  $("#links").innerHTML =
    r.links
      ?.map(
        (l) =>
          `<div class="attachment"><button data-resolve="${esc(l.target)}" class="ref">${esc(l.target)}</button><button data-unlink="${l.id}" aria-label="${esc(t("Remove reference"))}">×</button></div>`,
      )
      .join("") || '<p class="muted small">No linked resources.</p>';
  document.querySelectorAll("[data-resolve]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        const result = await api(wp("/resolve"), "POST", {
          target: b.dataset.resolve,
        });
        if (
          result.availability === "available" &&
          b.dataset.resolve.startsWith("nexus:v1:mnemosyne:")
        )
          await openResource(b.dataset.resolve.split(":").at(-1));
        else {
          b.textContent =
            (result.label || b.dataset.resolve) + " · " + result.availability;
        }
      })),
  );
  document.querySelectorAll("[data-unlink]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        await save();
        await api(
          wp("/resources/" + r.id + "/links/" + b.dataset.unlink),
          "DELETE",
        );
        await openResource(r.id);
      })),
  );
}
window.addEventListener("beforeunload", (e) => {
  if (dirty || saveFlight) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    guard(save)();
  }
});
guard(async () => {
  state.context = await bridge("context");
  activeLocale = state.context.locale || "en";
  document.documentElement.lang = activeLocale;
  state.workspaces = await api("/api/workspaces");
  const deep = location.pathname.match(/\/w\/([^/]+)\/r\/([^/]+)/);
  state.wid =
    deep?.[1] ||
    state.workspaces.find((w) => !w.archived)?.id ||
    state.workspaces[0]?.id ||
    null;
  if (deep) state.selected = await api(wp("/resources/" + deep[2]));
  await reload();
})();
