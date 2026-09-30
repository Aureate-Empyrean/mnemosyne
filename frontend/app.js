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
  view: "home",
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
  home: ["⌂", "Home"],
  note: ["▤", "Notes"],
  task: ["☑", "Tasks"],
  project: ["◇", "Projects"],
  collection: ["▦", "Collections"],
};
function toast(text, error = false) {
  $("#toast").textContent = text;
  $("#toast").classList.toggle("error", error);
  $("#toast").hidden = false;
  setTimeout(() => ($("#toast").hidden = true), 6500);
}
let activeActions = 0,
  nextFocus = null;
function focusInput(selector) {
  if (activeActions) nextFocus = selector;
  else $(selector)?.focus();
}
function guard(fn) {
  return async (...args) => {
    activeActions++;
    $("#app").inert = true;
    try {
      return await fn(...args);
    } catch (e) {
      toast(e.message, true);
    } finally {
      $("#app").inert = --activeActions > 0;
      if (!activeActions && nextFocus) {
        $(nextFocus)?.focus();
        nextFocus = null;
      }
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
  d.querySelector("input")?.focus();
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
  const action = $("#dialog [data-submit]");
  action.textContent = title.startsWith("Empty")
    ? "Empty Trash"
    : title.startsWith("Delete")
      ? "Delete permanently"
      : "Confirm";
  action.classList.add("danger");
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
      )}</select><button id="workspace-settings" class="quiet" aria-label="${esc(t("Manage Workspaces"))}">Manage</button></div></div><nav aria-label="${esc(t("Mnemosyne navigation"))}">${Object.entries(
      views,
    )
      .map(
        ([key, [symbol, label]], i) =>
          `<button data-view="${key}" class="${state.view === key ? "active" : ""}"><span class="nav-symbol">${symbol}</span>${esc(t(label))}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><button id="daily" class="quiet">◫ &nbsp; Daily Note</button><button id="sync-retry" class="quiet small">${esc(t("Nexus sync"))}</button><button id="switch-app" class="quiet">⇄ &nbsp; Applications</button><button data-view="trash" class="quiet">⌫ &nbsp; Trash</button><button id="export" class="quiet small">Export Workspace</button></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">${esc(workspace?.title || t("Your knowledge"))}<span>/</span>${esc(views[state.view]?.[1] || t("Trash"))}</div><input id="search" class="search" type="search" aria-label="${esc(t("Search active Workspace"))}" placeholder="${esc(t("Search this Workspace…"))}" value="${esc(state.query)}"></header><div class="content" id="content"></div></main></div>`;
  $("#workspace-select").onchange = guard(async (e) => {
    await save();
    state.wid = e.target.value;
    state.selected = null;
    state.filter = null;
    state.query = "";
    state.view = "home";
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
  button("daily", openDaily);
  button("export", async () =>
    download(
      "mnemosyne-" + ws().title + ".json",
      JSON.stringify(await api(wp("/export")), null, 2),
      "application/json",
    ),
  );
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
  if (state.view === "note" && !state.selected && !state.query) {
    const first = resources.find((r) => r.kind === "note");
    if (first) state.selected = await api(wp("/resources/" + first.id));
  }
  await renderList();
  if (state.selected && !state.query && state.view !== "trash") renderEditor();
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
      state.view = "home";
      state.query = "";
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
        state.view = "home";
        state.query = "";
        await reload();
      })),
  );
}
function resourceRow(r) {
  const context = state.resources.find((x) => x.id === r.project)?.title;
  const meta =
    r.kind === "task"
      ? [
          r.due_date
            ? `${r.due_date < day() && r.status === "open" ? "Overdue · " : ""}${displayDate(r.due_date)}`
            : "",
          r.priority !== "none" ? r.priority : "",
          context,
          r.status === "cancelled" ? "Cancelled" : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : r.kind === "note"
        ? r.content.replace(/[#*`>\[\]]/g, "").slice(0, 100) || "Empty note"
        : r.status === "open"
          ? ""
          : r.status;
  return `<div class="item-row ${r.id === state.selected?.id ? "selected" : ""} ${r.status === "completed" ? "completed" : ""}">${r.kind === "task" ? `<input type="checkbox" data-complete="${r.id}" aria-label="${esc((r.status === "completed" ? "Reopen " : "Complete ") + r.title)}" ${r.status === "completed" ? "checked" : ""} ${ws()?.archived || r.status === "cancelled" ? "disabled" : ""}>` : ""}<button class="resource-row" data-open="${r.id}" ${r.accent ? `style="border-left:3px solid ${esc(r.accent)}"` : ""}><span class="grow"><strong>${esc(r.icon)} ${esc(r.title)}${r.pinned ? " · ★" : ""}</strong>${meta ? `<small>${esc(meta)}</small>` : ""}</span></button></div>`;
}
function wireRows() {
  document
    .querySelectorAll("[data-open]")
    .forEach((el) => (el.onclick = guard(() => openResource(el.dataset.open))));
  document.querySelectorAll("[data-complete]").forEach(
    (el) =>
      (el.onchange = guard(async () => {
        el.disabled = true;
        try {
          await save();
          const r = await api(wp("/resources/" + el.dataset.complete));
          const changed = await putResource(r, {
            status: el.checked ? "completed" : "open",
          });
          if (state.selected?.id === r.id)
            Object.assign(state.selected, changed);
          await reload();
        } catch (e) {
          el.checked = !el.checked;
          throw e;
        } finally {
          el.disabled = !!ws()?.archived;
        }
      })),
  );
}
function putResource(r, changes) {
  return api(wp("/resources/" + r.id), "PUT", {
    ...Object.fromEntries(
      fields.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]),
    ),
    ...changes,
  });
}
function heading(title, actions = "") {
  return `<div class="page-heading"><h1>${esc(t(title))}</h1><div class="row wrap">${actions}</div></div>`;
}
function newButton(kind, label) {
  return ws().archived
    ? ""
    : `<button id="new" class="primary">+ ${esc(label || "New " + kind)}</button>`;
}
function taskRows(rows) {
  return rows.length
    ? rows.map(resourceRow).join("")
    : '<p class="muted empty-line">No tasks here.</p>';
}
const taskViews = {
  today: "Today",
  inbox: "Inbox",
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
  all: "All Tasks",
};
function taskFilter(rows, view) {
  return rows.filter(
    (r) =>
      r.kind === "task" &&
      (view === "all" ||
        (view === "completed"
          ? r.status === "completed"
          : r.status === "open" &&
            (view === "inbox"
              ? !r.project
              : view === "today"
                ? r.due_date === day() || r.start_date === day()
                : view === "overdue"
                  ? r.due_date && r.due_date < day()
                  : r.due_date > day() || r.start_date > day()))),
  );
}
function captureMarkup(home = false, project = null) {
  if (ws().archived) return "";
  return `<form id="capture" class="capture"><div class="row">${home ? '<select name="kind" aria-label="Capture type"><option value="task">Task</option><option value="note">Note</option></select>' : ""}<input name="title" aria-label="Quick capture" placeholder="${home ? "Capture a thought or task…" : "Add a task…"}" required maxlength="200"><button type="submit">Add</button></div><details class="capture-options"><summary>Deadline, priority, project</summary><div class="field-grid"><label>Deadline<input type="date" name="due_date"></label><label>Priority<select name="priority"><option value="none">None</option><option>low</option><option>medium</option><option>high</option><option>urgent</option></select></label><label>Project<select name="project">${options("project", project)}</select></label></div></details></form>`;
}
function wireCapture() {
  if (!$("#capture")) return;
  $("#capture").onsubmit = guard(async (e) => {
    e.preventDefault();
    await save();
    const f = new FormData(e.target),
      title = f.get("title").trim();
    if (!title) return;
    const kind = f.get("kind") || "task";
    const r = await api(wp("/resources"), "POST", {
      kind,
      title,
      project: f.get("project") || null,
      ...(kind === "task"
        ? {
            due_date: f.get("due_date") || null,
            priority: f.get("priority") || "none",
          }
        : {}),
    });
    if (kind === "note") {
      await openResource(r.id);
      focusInput("#markdown");
    } else {
      await reload();
      focusInput('#capture input[name="title"]');
      toast("Task added");
    }
  });
  activateForm($("#capture"));
}
function collectionTree(parent = null, depth = 0) {
  const collections = state.resources.filter((r) => r.kind === "collection");
  return collections
    .filter(
      (r) =>
        r.parent === parent ||
        (!parent && r.parent && !collections.some((c) => c.id === r.parent)),
    )
    .map(
      (r) =>
        `<div style="--depth:${depth}"><button class="tree-item ${state.selected?.id === r.id ? "active" : ""}" data-open="${r.id}">▦ ${esc(r.title)}</button></div>${collectionTree(r.id, depth + 1)}`,
    )
    .join("");
}
async function renderList() {
  const content = $("#content");
  if (state.query) {
    const rows = await api(
      wp("/resources?q=" + encodeURIComponent(state.query)),
    );
    content.innerHTML =
      heading("Search results") +
      `<p class="muted">${esc(state.query)}</p><div class="list">${rows.length ? rows.map(resourceRow).join("") : empty("Nothing found", "Try another title, tag or phrase. Search stays within this Workspace.")}</div>`;
  } else if (state.view === "trash") {
    return renderTrash();
  } else if (state.view === "home") {
    const overdue = taskFilter(state.resources, "overdue");
    const today = taskFilter(state.resources, "today").filter(
      (r) => !overdue.some((o) => o.id === r.id),
    );
    content.innerHTML =
      heading("Home", '<button id="home-daily">Open Daily Note</button>') +
      captureMarkup(true) +
      `<div class="home-grid"><section>${overdue.length ? '<h2 class="danger">Overdue</h2>' + taskRows(overdue) : ""}<h2 class="section-heading">Today <span class="muted small">${esc(displayDate(day()))}</span></h2>${taskRows(today)}</section><section><h2>Recently edited</h2>${
        [...state.resources]
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .slice(0, 8)
          .map(resourceRow)
          .join("") || '<p class="muted">Your recent work will appear here.</p>'
      }</section></div>`;
    button("home-daily", openDaily);
  } else if (state.view === "note") {
    const notes = state.resources.filter((r) => r.kind === "note");
    content.innerHTML = `<div class="notes-layout"><section class="browse-pane">${heading("Notes", newButton("note"))}<input id="note-filter" type="search" aria-label="Filter Notes" placeholder="Find a note…"><div id="note-list">${notes.map(resourceRow).join("") || '<p class="muted">Create a note to start writing.</p>'}</div></section><section id="detail" class="note-detail">${empty("Start a note", "Choose a note or create one to start writing.")}</section></div>`;
    $("#note-filter").oninput = (e) => {
      $("#note-list").innerHTML = notes
        .filter((n) =>
          (n.title + " " + n.content)
            .toLowerCase()
            .includes(e.target.value.toLowerCase()),
        )
        .map(resourceRow)
        .join("");
      wireRows();
    };
    button("new", () => create("note"));
  } else if (state.view === "task") {
    const view = state.taskView || "today",
      overdue = taskFilter(state.resources, "overdue");
    const rows = taskFilter(state.resources, view).filter(
      (r) => view !== "today" || !overdue.some((o) => o.id === r.id),
    );
    content.innerHTML =
      heading("Tasks") +
      `<div class="tabs" aria-label="Task views">${Object.entries(taskViews)
        .map(
          ([v, label]) =>
            `<button data-task-view="${v}" class="${v === view ? "active" : ""}">${label}</button>`,
        )
        .join(
          "",
        )}</div><div class="tasks-layout ${state.selected ? "with-detail" : ""}"><section>${captureMarkup()}${view === "today" && overdue.length ? '<h2 class="danger">Overdue</h2>' + taskRows(overdue) + '<h2 class="section-heading">Today</h2>' : ""}<div class="list">${taskRows(rows)}</div></section>${state.selected ? '<section id="detail" class="task-detail"></section>' : ""}</div>`;
    document.querySelectorAll("[data-task-view]").forEach(
      (b) =>
        (b.onclick = guard(async () => {
          await save();
          state.taskView = b.dataset.taskView;
          state.selected = null;
          await reload();
        })),
    );
  } else if (state.view === "project") {
    content.innerHTML = state.selected
      ? '<section id="detail"></section>'
      : heading(
          "Projects",
          `<button id="toggle-archived" class="quiet">${state.showArchived ? "Hide archived" : "Show archived"}</button>` +
            newButton("project"),
        ) +
        `<div class="project-list">${
          state.resources
            .filter(
              (r) =>
                r.kind === "project" &&
                (state.showArchived || r.status !== "archived"),
            )
            .map(
              (r) =>
                `<div class="project-summary">${resourceRow(r)}<p class="muted">${esc(r.content.slice(0, 180))}</p><div class="small">${state.resources
                  .filter(
                    (t) =>
                      t.kind === "task" &&
                      t.project === r.id &&
                      t.status === "open",
                  )
                  .slice(0, 3)
                  .map(resourceRow)
                  .join("")}</div></div>`,
            )
            .join("") ||
          '<p class="muted">Create a project to bring related work together.</p>'
        }</div>`;
    button("new", () => createNamed("project"));
    button("toggle-archived", async () => {
      state.showArchived = !state.showArchived;
      await reload();
    });
  } else if (state.view === "collection") {
    content.innerHTML = `<div class="notes-layout"><section class="browse-pane">${heading("Collections", newButton("collection", "New"))}<div class="tree">${collectionTree() || '<p class="muted">Organize Notes in Collections.</p>'}</div></section><section id="detail">${empty("Choose a Collection", "Browse its Notes, or create a Collection to organize them.")}</section></div>`;
    button("new", () => createNamed("collection"));
  }
  wireCapture();
  wireRows();
}
async function openDaily() {
  await save();
  const r = await api(wp("/daily/" + day()), "POST");
  await openResource(r.id);
}
async function createNamed(kind, parent = null) {
  modal(
    "New " + kind,
    '<label>Name<input name="title" required maxlength="200"></label>',
    async (f) => {
      await save();
      const r = await api(wp("/resources"), "POST", {
        kind,
        title: f.get("title"),
        status: kind === "project" ? "active" : "open",
        parent,
      });
      await openResource(r.id);
    },
  );
}
async function renderTrash() {
  const [rows, policy] = await Promise.all([
    api(wp("/resources?view=trash")),
    api(wp("/trash/policy")),
  ]);
  $("#content").innerHTML =
    heading(
      "Trash",
      `<button id="empty-trash" class="danger" ${!rows.length || ws().archived ? "disabled" : ""}>Empty Trash</button>`,
    ) +
    `<div class="trash-policy"><label>Automatically delete after<select id="retention" ${ws().archived ? "disabled" : ""}>${[null, 7, 14, 30, 60, 90].map((days) => `<option value="${days ?? "never"}" ${days === policy.days ? "selected" : ""}>${days === null ? "Never" : days + " days"}</option>`).join("")}</select></label><p class="muted small">Time is measured from when an item enters Trash. ${policy.days === null ? "Automatic deletion is off." : "Expired items are permanently deleted within a minute, including in archived Workspaces."}</p></div><div class="row trash-selection"><label><input type="checkbox" id="select-all"> Select all</label><button id="restore-selected" disabled>Restore selected</button><button id="delete-selected" class="danger" disabled>Delete selected permanently</button></div><div class="list">${rows.map((r) => `<div class="trash-row"><input type="checkbox" data-trash-select="${r.id}" aria-label="Select ${esc(r.title)}"><div class="grow"><strong>${esc(r.title)}</strong><small>${esc(t(r.kind))} · Deleted ${esc(new Date(r.trashed_at).toLocaleString(state.context.locale))}${policy.days ? " · " + Math.max(0, Math.ceil((new Date(r.trashed_at).getTime() + policy.days * 86400000 - Date.now()) / 86400000)) + " days remaining" : ""}</small></div><button data-restore="${r.id}" ${ws().archived ? "disabled" : ""}>Restore</button><button data-delete="${r.id}" class="danger" ${ws().archived ? "disabled" : ""}>Delete permanently</button></div>`).join("") || empty("Trash is empty", "Items you move to Trash can be restored here.")}</div>`;
  const selected = () =>
    [...document.querySelectorAll("[data-trash-select]:checked")].map(
      (e) => e.dataset.trashSelect,
    );
  const update = () => {
    $("#restore-selected").disabled = $("#delete-selected").disabled =
      !selected().length || !!ws().archived;
    $("#select-all").checked =
      !!rows.length && selected().length === rows.length;
    $("#select-all").indeterminate =
      selected().length > 0 && selected().length < rows.length;
  };
  document
    .querySelectorAll("[data-trash-select]")
    .forEach((e) => (e.onchange = update));
  $("#select-all").onchange = (e) => {
    document
      .querySelectorAll("[data-trash-select]")
      .forEach((x) => (x.checked = e.target.checked));
    update();
  };
  const action = async (action, ids = []) => {
    await api(wp("/trash"), "POST", {
      action,
      ids,
      confirmed: action !== "restore",
    });
    await reload();
  };
  const deletion = (ids, empty = false) =>
    confirmAction(
      empty ? "Empty Trash?" : "Delete permanently?",
      "This cannot be undone. " +
        (empty
          ? "Every item in this Workspace’s Trash"
          : "The selected items") +
        " will be permanently deleted. Surviving work is kept; links to deleted items remain unresolved.",
      () => action(empty ? "empty" : "delete", ids),
    );
  document
    .querySelectorAll("[data-restore]")
    .forEach(
      (b) => (b.onclick = guard(() => action("restore", [b.dataset.restore]))),
    );
  document
    .querySelectorAll("[data-delete]")
    .forEach((b) => (b.onclick = () => deletion([b.dataset.delete])));
  button("restore-selected", () => action("restore", selected()));
  button("delete-selected", () => deletion(selected()));
  button("empty-trash", () => deletion([], true));
  $("#retention").onchange = guard(async (e) => {
    const days = e.target.value === "never" ? null : Number(e.target.value);
    const change = async () => {
      await api(wp("/trash/policy"), "PUT", { days });
      await reload();
    };
    if (days !== null && (policy.days === null || days < policy.days)) {
      e.target.value = policy.days ?? "never";
      confirmAction(
        "Change retention?",
        "Items already older than the new retention period will be permanently deleted during the next cleanup.",
        change,
      );
    } else await change();
  });
}
async function create(kind, title = t("Untitled"), extra = {}) {
  await save();
  const r = await api(wp("/resources"), "POST", {
    kind,
    title,
    status: kind === "project" ? "active" : "open",
    ...extra,
  });
  await openResource(r.id);
  if (kind === "note") focusInput("#markdown");
}
async function openResource(id) {
  await save();
  state.selected = await api(wp("/resources/" + id));
  state.view = state.selected.kind;
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
    readOnly = !!ws().archived || !!r.trashed;
  $("#detail").innerHTML = editorMarkup(r);
  button("detail-complete", async () => {
    state.selected.status = $("#detail-complete").checked
      ? "completed"
      : "open";
    markDirty();
    await save();
    await reload();
  });
  button("back", async () => {
    await save();
    state.selected = null;
    await reload();
  });
  button("save-now", () => save());
  button("trash", async () => {
    await save();
    if (r.trashed)
      await api(wp("/trash"), "POST", { action: "restore", ids: [r.id] });
    else await putResource(r, { trashed: true });
    state.selected = null;
    await reload();
    if (!r.trashed) {
      toast("Moved to Trash");
      const undo = document.createElement("button");
      undo.textContent = "Undo";
      const wid = state.wid;
      undo.onclick = guard(async () => {
        await api("/api/w/" + wid + "/trash", "POST", {
          action: "restore",
          ids: [r.id],
        });
        if (wid === state.wid) await openResource(r.id);
        $("#toast").hidden = true;
      });
      $("#toast").append(undo);
    }
  });
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
    button("collection-note", () =>
      create("note", "Untitled", { collections: [r.id] }),
    );
    button("child-collection", () => createNamed("collection", r.id));
    button("add-members", () =>
      modal(
        "Add Notes",
        `<div class="checks">${
          state.resources
            .filter((n) => n.kind === "note" && !n.collections.includes(r.id))
            .map(
              (n) =>
                `<label><input type="checkbox" name="notes" value="${n.id}">${esc(n.title)}</label>`,
            )
            .join("") || "<p>All Notes already belong here.</p>"
        }</div>`,
        async (f) => {
          await save();
          for (const id of f.getAll("notes")) {
            const n = await api(wp("/resources/" + id));
            await putResource(n, { collections: [...n.collections, r.id] });
          }
          await reload();
        },
      ),
    );
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
        "[data-field],[data-collection],#file,#save-now,.toolbar button,#add-reference,#reset-accent,#add-check button,[data-check],[data-check-text],[data-remove-check],[data-remove-file],[data-unlink],#collection-note,#add-members,#child-collection",
      )
      .forEach((x) => (x.disabled = true));
  if (ws().archived) $("#trash").disabled = true;
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
      current.trashed_at = result.trashed_at;
      const listed = state.resources.find((r) => r.id === current.id);
      if (listed) Object.assign(listed, current);
      document.querySelectorAll(`[data-open="${current.id}"]`).forEach((el) => {
        const row = el.closest(".item-row");
        if (row) {
          const template = document.createElement("template");
          template.innerHTML = resourceRow(current);
          row.replaceWith(template.content.firstElementChild);
        }
      });
      wireRows();
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
function editorMarkup(r) {
  const task = r.kind === "task",
    note = r.kind === "note",
    project = r.kind === "project",
    collection = r.kind === "collection";
  const select = (key, label, kind) =>
    `<label>${label}<select aria-label="${label}" data-field="${key}">${options(kind, r[key], r.id)}</select></label>`;
  const tags = `<label>Tags (comma separated)<input data-field="tags" value="${esc(r.tags.join(", "))}"></label>`;
  const description = `<textarea id="markdown" class="markdown-input" data-field="content" aria-label="${note ? "Markdown content" : "Description"}" placeholder="${note ? "Start writing…" : "Add a description…"}" maxlength="40000">${esc(r.content)}</textarea><article id="preview" class="preview" hidden></article>`;
  const toolbar = `<div class="toolbar"><button data-insert="# ">H1</button><button data-insert="## ">H2</button><button data-wrap="**">Bold</button><button data-wrap="*">Italic</button><button data-insert="- ">List</button><button data-insert="- [ ] ">Checklist</button><button data-insert="> ">Quote</button><button id="insert-code">Code</button><button id="insert-table">Table</button><button id="insert-link">Note link</button><button id="preview-toggle">Preview</button></div>`;
  const customization = `<div class="field-grid"><label>Icon<input data-field="icon" value="${esc(r.icon)}" maxlength="8"></label><label>Accent<input type="color" data-field="accent" value="${r.accent || "#8b7cf6"}"></label></div><button id="reset-accent" class="quiet small">Reset resource accent</button><label><input type="checkbox" data-field="pinned" ${r.pinned ? "checked" : ""}> Pinned / favorite</label>`;
  const noteProperties = `${tags}${select("project", "Project", "project")}<h3>Collections</h3><div class="checks">${
    state.resources
      .filter((c) => c.kind === "collection")
      .map(
        (c) =>
          `<label><input data-collection="${c.id}" type="checkbox" ${r.collections.includes(c.id) ? "checked" : ""}>${esc(c.title)}</label>`,
      )
      .join("") || '<p class="muted">No Collections yet.</p>'
  }</div>`;
  const taskProperties = `<div class="field-grid"><label>Deadline<input type="date" data-field="due_date" value="${r.due_date || ""}"></label>${selectField("priority", "Priority", ["none", "low", "medium", "high", "urgent"], r.priority)}${select("project", "Project", "project")}</div>${tags}<h3>Checklist</h3><div id="checklist"></div><form id="add-check" class="row"><input id="check-text" aria-label="New checklist item" placeholder="Add a step…" maxlength="500"><button>Add</button></form>`;
  const secondaryTask = `<div class="field-grid">${selectField("status", "Lifecycle", ["open", "completed", "cancelled"], r.status)}<label>Start date<input type="date" data-field="start_date" value="${r.start_date || ""}"></label>${select("related_note", "Related Note", "note")}${selectField("board_column", "Board column", ["Backlog", "In progress", "Review", "Done"], r.board_column)}</div>${r.completed_at ? `<p class="small muted">Completed ${esc(new Date(r.completed_at).toLocaleString(state.context.locale))}</p>` : ""}`;
  const shared = `<details class="secondary"><summary>Attachments</summary><div id="attachments"></div><label>Add a file · up to 1 MiB<input id="file" type="file"></label></details><details class="secondary"><summary>Links & backlinks</summary><div id="links"></div><div class="row wrap"><button id="add-reference">+ Link a resource</button><button id="index-backlinks" class="quiet">Refresh Nexus backlinks</button></div><div id="external-backlinks"></div><h3>Notes and resources linking here</h3><div class="list">${r.backlinks?.map(resourceRow).join("") || '<p class="muted small">No backlinks in this Workspace.</p>'}</div></details>`;
  const board = `<div class="tabs" aria-label="Project views">${["Board", "Tasks", "Notes", "Overview"].map((v) => `<button data-project-view="${v}" class="${(state.projectView || "Board") === v ? "active" : ""}">${v}</button>`).join("")}</div><div id="project-work"></div>`;
  const organized = `<div class="row wrap collection-actions"><button id="collection-note" ${ws().archived ? "disabled" : ""}>+ New note here</button><button id="add-members" ${ws().archived ? "disabled" : ""}>Add existing Notes</button><button id="child-collection" ${ws().archived ? "disabled" : ""}>+ Child Collection</button></div><div id="collection-children"></div><h2 class="section-heading">Notes</h2><div id="collection-notes"></div>`;
  return `<div class="editor-actions row between">${note ? "<span></span>" : `<button id="back" class="quiet">${task ? "Close" : "← " + (project ? "Projects" : "Collections")}</button>`}<div class="row"><span id="save-state" class="save-state">Saved</span><button id="save-now" class="quiet">Save</button></div></div>${r.trashed ? '<p class="trash-banner">This item is in Trash. Restore it to continue editing.</p>' : ""}<div class="editor-main ${esc(r.kind)}-editor"><div class="eyebrow">${r.daily_date ? "Daily Note · " + esc(displayDate(r.daily_date)) : task ? "Task" : project ? "Project" : collection ? "Collection" : ""}</div><div class="row title-row">${task ? `<input type="checkbox" id="detail-complete" aria-label="Complete task" ${r.status === "completed" ? "checked" : ""} ${ws().archived || r.status === "cancelled" || r.trashed ? "disabled" : ""}>` : ""}<input class="title-input" data-field="title" aria-label="Title" value="${esc(r.title)}" maxlength="200"></div>${project ? selectField("status", "Project status", ["active", "on-hold", "completed", "archived"], r.status) + board : collection ? organized : note ? toolbar + description : description + taskProperties}${project || collection ? `<details class="secondary" ${project && state.projectView === "Overview" ? "open" : ""}><summary>Description & organization</summary>${description}${project ? `<div class="field-grid"><label>Start date<input type="date" data-field="start_date" value="${r.start_date || ""}"></label><label>Deadline<input type="date" data-field="due_date" value="${r.due_date || ""}"></label></div>` : select("parent", "Parent Collection", "collection")}${tags}</details>` : ""}<details class="secondary"><summary>${note ? "Note details" : task ? "More details" : "Appearance"}</summary>${note ? noteProperties : task ? secondaryTask : ""}${customization}<details><summary>Resource identity</summary><p class="ref">${esc(r.reference)}</p></details><p class="small muted">Updated ${esc(new Date(r.updated_at).toLocaleString(state.context.locale))}</p></details>${shared}<div class="row end"><button id="trash" class="quiet danger">${r.trashed ? "Restore" : "Move to Trash"}</button></div></div>`;
}
function renderBoard() {
  const r = state.selected,
    view = state.projectView || "Board";
  const tasks = state.resources.filter(
    (t) => t.kind === "task" && t.project === r.id,
  );
  const notes = state.resources.filter(
    (t) => t.kind === "note" && t.project === r.id,
  );
  $("#project-work").innerHTML =
    view === "Notes"
      ? `<button id="project-note" ${ws().archived ? "disabled" : ""}>+ New project note</button><div class="list section-heading">${notes.map(resourceRow).join("") || '<p class="muted">No project Notes yet.</p>'}</div>`
      : view === "Overview"
        ? `<h2 class="section-heading">Open work</h2>${taskRows(tasks.filter((t) => t.status === "open"))}<h2 class="section-heading">Related Notes</h2>${notes.map(resourceRow).join("") || '<p class="muted">No related Notes.</p>'}`
        : captureMarkup(false, r.id) +
          (view === "Tasks"
            ? taskRows(tasks)
            : `<div class="board">${["Backlog", "In progress", "Review", "Done"]
                .map(
                  (c) =>
                    `<section class="column"><h3>${c}</h3>${tasks
                      .filter((t) => t.board_column === c)
                      .map(
                        (t) =>
                          `<div class="board-card">${resourceRow(t)}<select data-move="${t.id}" aria-label="Move ${esc(t.title)}" ${ws().archived ? "disabled" : ""}>${["Backlog", "In progress", "Review", "Done"].map((v) => `<option ${v === c ? "selected" : ""}>${v}</option>`).join("")}</select></div>`,
                      )
                      .join("")}</section>`,
                )
                .join("")}</div>`);
  document.querySelectorAll("[data-project-view]").forEach(
    (b) =>
      (b.onclick = guard(async () => {
        await save();
        state.projectView = b.dataset.projectView;
        await reload();
      })),
  );
  document.querySelectorAll("[data-move]").forEach(
    (el) =>
      (el.onchange = guard(async () => {
        await save();
        const task = await api(wp("/resources/" + el.dataset.move));
        await putResource(task, { board_column: el.value });
        await reload();
      })),
  );
  button("project-note", () => create("note", "Untitled", { project: r.id }));
  wireCapture();
  wireRows();
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
  if (deep) {
    state.selected = await api(wp("/resources/" + deep[2]));
    state.view = state.selected.kind;
  }
  await reload();
})();
