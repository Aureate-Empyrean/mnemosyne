const catalogs = /*CATALOGS*/ {};

/* ───────────────────────── Localization ───────────────────────── */

let activeLocale = "en";
function t(key, vars) {
  let text =
    catalogs[activeLocale]?.[key] ??
    catalogs[activeLocale.split("-")[0]]?.[key] ??
    catalogs.en?.[key] ??
    key;
  if (vars)
    text = text.replace(/\{(\w+)\}/g, (match, name) =>
      name in vars ? vars[name] : match,
    );
  return text;
}
function plural(count, one, other, vars = {}) {
  let rule = "other";
  try {
    rule = new Intl.PluralRules(activeLocale).select(count);
  } catch {
    rule = count === 1 ? "one" : "other";
  }
  return t(rule === "one" ? one : other, { count, ...vars });
}
function safeLocale(value) {
  try {
    return Intl.getCanonicalLocales(value || "en")[0] || "en";
  } catch {
    return "en";
  }
}

/* ───────────────────────── Small utilities ───────────────────────── */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) =>
  String(value ?? "").replace(
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
const cssq = (value) =>
  window.CSS?.escape
    ? CSS.escape(value)
    : String(value).replace(/["\\\]\[]/g, "\\$&");
const raf = (fn) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(fn)
    : setTimeout(fn, 16);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
const EASE_IN = "cubic-bezier(.4,0,1,1)";
const EASE_SPRING = "cubic-bezier(.34,1.4,.64,1)";

function animate(el, frames, options) {
  if (!el?.animate || reducedMotion()) return Promise.resolve();
  try {
    return el
      .animate(frames, { easing: EASE_OUT, ...options })
      .finished.catch(() => {});
  } catch {
    return Promise.resolve();
  }
}
function enterView(el, direction = 0) {
  return animate(
    el,
    [
      {
        opacity: 0,
        transform: direction
          ? `translateX(${direction * 14}px)`
          : "translateY(6px)",
      },
      { opacity: 1, transform: "none" },
    ],
    { duration: 210 },
  );
}
function collapseOut(el, direction = 0) {
  if (!el) return Promise.resolve();
  if (!el.animate || reducedMotion()) {
    el.remove();
    return Promise.resolve();
  }
  const height = el.offsetHeight;
  el.style.overflow = "hidden";
  return animate(
    el,
    [
      { height: height + "px", opacity: 1, transform: "none" },
      {
        height: "0px",
        opacity: 0,
        paddingTop: "0px",
        paddingBottom: "0px",
        marginTop: "0px",
        marginBottom: "0px",
        transform: direction ? `translateX(${direction * 18}px)` : "none",
      },
    ],
    { duration: 200, easing: EASE_IN },
  ).then(() => el.remove());
}
function expandIn(el) {
  if (!el) return;
  el.classList.add("is-new");
  setTimeout(() => el.classList.remove("is-new"), 900);
  if (!el.animate || reducedMotion()) return;
  const height = el.offsetHeight;
  el.style.overflow = "hidden";
  animate(
    el,
    [
      { height: "0px", opacity: 0 },
      { height: height + "px", opacity: 1 },
    ],
    { duration: 200 },
  ).then(() => (el.style.overflow = ""));
}

/** Re-render a list while animating removed, moved and inserted rows. */
async function morph(container, html, { enter = true } = {}) {
  if (!container) return;
  const template = document.createElement("template");
  template.innerHTML = html;
  const nextIds = new Set(
    $$("[data-row]", template.content).map((el) => el.dataset.row),
  );
  const current = $$("[data-row]", container);
  const leaving = current.filter((el) => !nextIds.has(el.dataset.row));
  await Promise.all(leaving.map((el) => collapseOut(el)));
  const before = new Map(
    $$("[data-row]", container).map((el) => [
      el.dataset.row,
      el.getBoundingClientRect(),
    ]),
  );
  const focused = document.activeElement?.closest?.("[data-row]")?.dataset.row;
  container.innerHTML = html;
  for (const el of $$("[data-row]", container)) {
    const old = before.get(el.dataset.row);
    if (!old) {
      if (enter) expandIn(el);
      continue;
    }
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left,
      dy = old.top - now.top;
    if (dx || dy)
      animate(
        el,
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 220 },
      );
  }
  if (focused) $(`[data-row="${cssq(focused)}"]`, container)?.focus();
}

function autosize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/* ───────────────────────── Icons ───────────────────────── */

const ICONS = {
  home: '<path d="M3.5 9 10 3.5 16.5 9v7a1 1 0 0 1-1 1h-3.5v-5h-4v5H4.5a1 1 0 0 1-1-1z"/>',
  note: '<path d="M5.5 2.75h6L15.25 6.5v10.25a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75z"/><path d="M11.25 3v3.5h3.75M7.5 10h5M7.5 13h3.5"/>',
  task: '<circle cx="10" cy="10" r="7"/><path d="m7 10.2 2.1 2.1L13.2 8"/>',
  project:
    '<path d="M10 2.75 17.25 10 10 17.25 2.75 10z"/><circle cx="10" cy="10" r="2.25"/>',
  collection:
    '<path d="M3 6.5 10 3l7 3.5-7 3.5z"/><path d="m3 10 7 3.5 7-3.5M3 13.5 10 17l7-3.5"/>',
  calendar:
    '<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.75v3.5M13 2.75v3.5"/>',
  sun: '<circle cx="10" cy="10" r="3.25"/><path d="M10 2.5v1.75M10 15.75v1.75M2.5 10h1.75M15.75 10h1.75M4.7 4.7l1.25 1.25M14.05 14.05l1.25 1.25M4.7 15.3l1.25-1.25M14.05 5.95l1.25-1.25"/>',
  trash:
    '<path d="M3.5 5.5h13M8 5.5V3.75h4V5.5M5 5.5l.75 11a1 1 0 0 0 1 .9h6.5a1 1 0 0 0 1-.9l.75-11M8.5 9v5M11.5 9v5"/>',
  search: '<circle cx="8.75" cy="8.75" r="5.25"/><path d="m12.75 12.75 4 4"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  more: '<circle cx="4.75" cy="10" r="1.15" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none"/><circle cx="15.25" cy="10" r="1.15" fill="currentColor" stroke="none"/>',
  chevronRight: '<path d="m8 5 5 5-5 5"/>',
  chevronLeft: '<path d="m12 5-5 5 5 5"/>',
  chevronDown: '<path d="m5 8 5 5 5-5"/>',
  chevronsUpDown:
    '<path d="m6.5 7.5 3.5-3.5 3.5 3.5M6.5 12.5l3.5 3.5 3.5-3.5"/>',
  close: '<path d="m5.5 5.5 9 9M14.5 5.5l-9 9"/>',
  flag: '<path d="M5 17.5V3.5M5 4h9.5l-2 3.5 2 3.5H5"/>',
  link: '<path d="M8.5 11.5a3 3 0 0 0 4.25 0l2.5-2.5a3 3 0 0 0-4.25-4.25l-1 1"/><path d="M11.5 8.5a3 3 0 0 0-4.25 0l-2.5 2.5a3 3 0 0 0 4.25 4.25l1-1"/>',
  paperclip:
    '<path d="m15.5 9.5-5.75 5.75a3.5 3.5 0 0 1-5-5L10.5 4.5a2.3 2.3 0 0 1 3.3 3.3l-5.8 5.8a1.1 1.1 0 0 1-1.6-1.6L11.5 6.9"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.6v.01"/>',
  check: '<path d="m4.5 10.5 3.5 3.5 7.5-8"/>',
  undo: '<path d="M7.5 5 4 8.5 7.5 12"/><path d="M4 8.5h7.5a4.25 4.25 0 0 1 0 8.5H9"/>',
  apps: '<rect x="3.5" y="3.5" width="5" height="5" rx="1.2"/><rect x="11.5" y="3.5" width="5" height="5" rx="1.2"/><rect x="3.5" y="11.5" width="5" height="5" rx="1.2"/><rect x="11.5" y="11.5" width="5" height="5" rx="1.2"/>',
  refresh: '<path d="M16 10a6 6 0 1 1-1.8-4.3M16.25 3.5v3.75H12.5"/>',
  tag: '<path d="M3.5 3.5h6l7 7-6 6-7-7z"/><circle cx="7" cy="7" r="1.1"/>',
  pin: '<path d="M12.25 3.25 16.75 7.75l-2.25.5-3 3 .5 3.25-1.5 1.5-7.5-7.5 1.5-1.5 3.25.5 3-3z"/><path d="M6 14l-3 3"/>',
  play: '<path d="M6.5 4.75v10.5l8.5-5.25z"/>',
  download: '<path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12"/>',
  eye: '<path d="M2.5 10s2.75-5.5 7.5-5.5 7.5 5.5 7.5 5.5-2.75 5.5-7.5 5.5S2.5 10 2.5 10z"/><circle cx="10" cy="10" r="2.25"/>',
  list: '<path d="M8 5.5h8.5M8 10h8.5M8 14.5h8.5"/><circle cx="4.5" cy="5.5" r=".9" fill="currentColor"/><circle cx="4.5" cy="10" r=".9" fill="currentColor"/><circle cx="4.5" cy="14.5" r=".9" fill="currentColor"/>',
  checklist:
    '<rect x="3" y="3.75" width="5" height="5" rx="1.2"/><path d="m3.6 13.5 1.5 1.5 2.4-2.75M10.75 6.25h6M10.75 13.75h6"/>',
  quote:
    '<path d="M4 6.5h4.5v4H6.5c0 2 .75 3 2 3.5M11.5 6.5H16v4h-2c0 2 .75 3 2 3.5"/>',
  code: '<path d="m7 6-4 4 4 4M13 6l4 4-4 4"/>',
  table:
    '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 8.25h14M3 12.25h14M10 4v12"/>',
  archive:
    '<rect x="3" y="4" width="14" height="4" rx="1"/><path d="M4.5 8v7.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8M8 11h4"/>',
  arrowRight: '<path d="M4 10h12M11 5l5 5-5 5"/>',
  folderUp: '<path d="M10 16V5M5.5 9.5 10 5l4.5 4.5"/>',
  x: '<path d="m6 6 8 8M14 6l-8 8"/>',
  minus: '<path d="M5 10h10"/>',
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6.25V10l2.5 1.75"/>',
};
function icon(name, className = "") {
  return `<svg class="i ${className}" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;
}
const CHECK =
  '<svg class="check-svg" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle class="check-ring" cx="10" cy="10" r="8"/><path class="check-mark" d="m6.3 10.4 2.5 2.5 4.9-5.3"/></svg>';
const MARK =
  '<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5c.55 4.9 2.6 6.95 7.5 7.5-4.9.55-6.95 2.6-7.5 7.5-.55-4.9-2.6-6.95-7.5-7.5 4.9-.55 6.95-2.6 7.5-7.5z"/><circle cx="18.6" cy="18.6" r="1.6"/></svg>';

/* ───────────────────────── Nexus bridge ───────────────────────── */

let serial = 0;
const pending = new Map();
window.addEventListener("message", (event) => {
  if (event.source !== parent || event.data?.channel !== "empyrean-v1") return;
  const request = pending.get(event.data.id);
  if (!request) return;
  clearTimeout(request.timer);
  pending.delete(event.data.id);
  event.data.error
    ? request.reject(Error(event.data.error))
    : request.resolve(event.data.result);
});
function bridge(action, data = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++serial);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        Error(
          t("Nexus did not respond. Your unsaved text is still in the editor."),
        ),
      );
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    parent.postMessage({ channel: "empyrean-v1", id, action, ...data }, "*");
  });
}
const api = (path, method = "GET", body) =>
  bridge("request", { path, method, ...(body === undefined ? {} : { body }) });

/* ───────────────────────── State ───────────────────────── */

const FIELDS = [
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
const COLUMNS = ["Backlog", "In progress", "Review", "Done"];
const PRIORITIES = ["none", "low", "medium", "high", "urgent"];
const PROJECT_STATES = ["active", "on-hold", "completed", "archived"];
const RETENTION = [null, 7, 14, 30, 60, 90];
const ACCENTS = [
  "#8B7CF6",
  "#6E9CF7",
  "#4FB8B0",
  "#7CC47F",
  "#E3B26B",
  "#E8956A",
  "#EF8A8A",
  "#E58FC7",
];

const state = {
  context: { applications: [], locale: "en" },
  workspaces: [],
  wid: null,
  resources: [],
  view: "home",
  taskView: "today",
  noteId: null,
  noteContext: null,
  projectId: null,
  projectTab: "overview",
  showClosedProjects: false,
  collectionId: null,
  collectionNoteId: null,
  collapsedNodes: new Set(),
  openDoneColumns: new Set(),
  query: "",
  returnView: null,
  drawer: null,
  preview: false,
  holding: new Map(),
  trashSelection: new Set(),
  draft: {},
  captureKind: "task",
};
const sessions = new Map();
let renderToken = 0;

const ws = () => state.workspaces.find((w) => w.id === state.wid);
const wp = (path) => "/api/w/" + state.wid + path;
const readOnly = () => !!ws()?.archived;
const find = (id) => state.resources.find((r) => r.id === id);
const byKind = (kind) => state.resources.filter((r) => r.kind === kind);
const body = (r) =>
  Object.fromEntries(
    FIELDS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]),
  );

/* ───────────────────────── Dates ───────────────────────── */

function isoInZone(date, timeZone) {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone }).format(
      date,
    );
  } catch {
    return new Intl.DateTimeFormat("en-CA", options).format(date);
  }
}
const today = () => isoInZone(new Date(), ws()?.timezone || "UTC");
function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  const utc = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86400000);
}
function formatDay(iso, options) {
  try {
    return new Intl.DateTimeFormat(activeLocale, {
      timeZone: "UTC",
      ...options,
    }).format(new Date(iso + "T00:00:00Z"));
  } catch {
    return iso;
  }
}
function longDay(iso) {
  return formatDay(iso, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(iso.slice(0, 4) !== today().slice(0, 4) ? { year: "numeric" } : {}),
  });
}
function shortDay(iso) {
  return formatDay(iso, {
    day: "numeric",
    month: "short",
    ...(iso.slice(0, 4) !== today().slice(0, 4) ? { year: "numeric" } : {}),
  });
}
function relativeDay(iso) {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return t("Today");
  if (diff === 1) return t("Tomorrow");
  if (diff === -1) return t("Yesterday");
  if (diff > 1 && diff < 7) return formatDay(iso, { weekday: "long" });
  return shortDay(iso);
}
function relativeTime(timestamp) {
  if (!timestamp) return "";
  const seconds = (new Date(timestamp).getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  let format;
  try {
    format = new Intl.RelativeTimeFormat(activeLocale, { numeric: "auto" });
  } catch {
    format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
  if (abs < 45) return t("just now");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return format.format(Math.round(seconds / 86400), "day");
  return shortDay(isoInZone(new Date(timestamp), ws()?.timezone || "UTC"));
}
function absoluteTime(timestamp) {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat(activeLocale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  } catch {
    return timestamp;
  }
}

/* ───────────────────────── Domain presentation ───────────────────────── */

const PRIORITY_LABEL = () => ({
  none: t("No priority"),
  low: t("Low"),
  medium: t("Medium"),
  high: t("High"),
  urgent: t("Urgent"),
});
const PROJECT_STATE_LABEL = () => ({
  active: t("Active"),
  "on-hold": t("On hold"),
  completed: t("Completed"),
  archived: t("Archived"),
});
const KIND_LABEL = () => ({
  note: t("Note"),
  task: t("Task"),
  project: t("Project"),
  collection: t("Collection"),
});
const KIND_ICON = {
  note: "note",
  task: "task",
  project: "project",
  collection: "collection",
};
function fallbackTitle(r) {
  return r.daily_date || "Untitled";
}
function displayTitle(r) {
  if (!r) return "";
  if (r.daily_date && r.title === r.daily_date) return longDay(r.daily_date);
  if (r.title === "Untitled") return t("Untitled");
  return r.title;
}
function plainText(markdown = "", { keepLines = false } = {}) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s\[[ xX]\]|[-*+]|\d+\.)\s*/gm, "")
    .replace(/[*_`~|]/g, "");
  return keepLines
    ? text
        .replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim()
    : text.replace(/\s+/g, " ").trim();
}
function titleOf(id) {
  const r = find(id);
  return r ? displayTitle(r) : t("In Trash");
}
function fileSize(bytes) {
  let format;
  try {
    format = new Intl.NumberFormat(activeLocale, { maximumFractionDigits: 1 });
  } catch {
    format = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  }
  if (bytes < 1024) return t("{size} B", { size: format.format(bytes) });
  if (bytes < 1048576)
    return t("{size} KiB", { size: format.format(bytes / 1024) });
  return t("{size} MiB", { size: format.format(bytes / 1048576) });
}
function avatar(title) {
  const letter = [...(title || "?").trim()][0] || "?";
  return `<span class="ws-avatar" aria-hidden="true">${esc(letter.toUpperCase())}</span>`;
}
function resourceGlyph(r) {
  if (r.icon) return `<span class="glyph emoji">${esc(r.icon)}</span>`;
  const style = r.accent ? ` style="color:${esc(r.accent)}"` : "";
  return `<span class="glyph"${style}>${icon(r.daily_date ? "sun" : KIND_ICON[r.kind])}</span>`;
}

function dueChip(iso, done = false) {
  const diff = daysBetween(today(), iso);
  const tone = done ? "" : diff < 0 ? "danger" : diff === 0 ? "accent" : "";
  return `<span class="chip ${tone}" title="${esc(longDay(iso))}">${icon("calendar")}${esc(relativeDay(iso))}</span>`;
}
function priorityChip(priority) {
  if (!priority || priority === "none") return "";
  return `<span class="chip prio prio-${priority}" title="${esc(t("Priority"))}">${icon("flag")}${esc(PRIORITY_LABEL()[priority])}</span>`;
}
function checklistProgress(r) {
  if (!r.checklist?.length) return "";
  const done = r.checklist.filter((c) => c.done).length;
  return `<span class="chip ${done === r.checklist.length ? "accent" : ""}">${icon("checklist")}${done}/${r.checklist.length}</span>`;
}

/* ───────────────────────── Task semantics (unchanged) ───────────────────────── */

const PRIORITY_RANK = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
function taskIn(view, r, day = today()) {
  if (r.kind !== "task") return false;
  const open = r.status === "open";
  if (view === "overdue") return open && !!r.due_date && r.due_date < day;
  if (view === "today")
    return open && (r.due_date === day || r.start_date === day);
  if (view === "inbox") return open && !r.project;
  if (view === "upcoming")
    return (
      open &&
      ((!!r.due_date && r.due_date > day) ||
        (!!r.start_date && r.start_date > day))
    );
  if (view === "completed") return r.status === "completed";
  return true;
}
function byUrgency(a, b) {
  const order = { open: 0, cancelled: 1, completed: 2 };
  return (
    order[a.status] - order[b.status] ||
    (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    (a.created_at || "").localeCompare(b.created_at || "")
  );
}
function held(view, r) {
  return taskIn(view, r) || state.holding.has(r.id);
}

/* ───────────────────────── Feedback: toast, dialogs, popovers ───────────────────────── */

let toastTimer = null,
  toastRemaining = 0,
  toastStarted = 0;
function toast(message, { action, onAction, tone = "", duration = 5200 } = {}) {
  const region = $("#toast");
  if (!region) return;
  clearTimeout(toastTimer);
  region.innerHTML = `<div class="toast ${tone}" role="${tone === "error" ? "alert" : "status"}">${tone === "error" ? icon("info") : icon("check")}<span class="toast-text">${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ""}<button type="button" class="toast-close" aria-label="${esc(t("Dismiss"))}">${icon("close")}</button></div>`;
  region.hidden = false;
  const el = region.firstElementChild;
  raf(() => el.classList.add("show"));
  const hide = () => {
    clearTimeout(toastTimer);
    el.classList.remove("show");
    el.classList.add("leaving");
    setTimeout(() => {
      if (region.firstElementChild === el) {
        region.innerHTML = "";
        region.hidden = true;
      }
    }, 180);
  };
  const start = (ms) => {
    toastRemaining = ms;
    toastStarted = Date.now();
    toastTimer = setTimeout(hide, ms);
  };
  el.querySelector(".toast-close").onclick = hide;
  if (action)
    el.querySelector(".toast-action").onclick = () => {
      hide();
      run(onAction);
    };
  el.onmouseenter = el.onfocusin = () => {
    clearTimeout(toastTimer);
    toastRemaining -= Date.now() - toastStarted;
  };
  el.onmouseleave = el.onfocusout = () => start(Math.max(1500, toastRemaining));
  start(tone === "error" ? Math.max(duration, 7000) : duration);
}

function run(fn, ...args) {
  return Promise.resolve()
    .then(() => fn?.(...args))
    .catch((error) => {
      toast(error?.message || String(error), { tone: "error" });
    });
}

/** A modal decision. Resolves with { value, data } or null when dismissed. */
function dialog({
  title,
  body: content = "",
  actions,
  collect,
  validate,
  wide,
}) {
  const d = $("#dialog");
  return new Promise((resolve) => {
    d.className = wide ? "wide" : "";
    d.innerHTML = `<div class="dialog-card"><header class="dialog-head"><h2>${esc(title)}</h2></header><div class="dialog-body">${content}<p class="dialog-error" hidden></p></div><footer class="dialog-actions">${actions
      .map(
        (a) =>
          `<button type="button" class="btn ${a.kind || ""}" data-dialog-action="${esc(a.value)}">${esc(a.label)}</button>`,
      )
      .join("")}</footer></div>`;
    let settled = false;
    const finish = async (value) => {
      if (settled) return;
      const data = value !== null && collect ? collect(d) : undefined;
      if (value !== null && value !== "cancel" && validate) {
        const problem = validate(value, data);
        if (problem) {
          const el = $(".dialog-error", d);
          el.textContent = problem;
          el.hidden = false;
          return;
        }
      }
      settled = true;
      d.classList.add("closing");
      await wait(reducedMotion() ? 0 : 130);
      d.classList.remove("closing");
      d.close?.();
      d.open = false;
      resolve(value === null || value === "cancel" ? null : { value, data });
    };
    $$("[data-dialog-action]", d).forEach(
      (b) => (b.onclick = () => finish(b.dataset.dialogAction)),
    );
    d.oncancel = (e) => {
      e.preventDefault();
      finish(null);
    };
    d.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      } else if (
        e.key === "Enter" &&
        e.target.tagName === "INPUT" &&
        e.target.type !== "checkbox"
      ) {
        e.preventDefault();
        const primary = actions.find((a) => a.primary);
        if (primary) finish(primary.value);
      }
    };
    d.showModal();
    const first =
      $("input:not([type=checkbox]), textarea", d) ||
      $("[data-dialog-action].primary, [data-dialog-action].danger", d) ||
      $("[data-dialog-action]", d);
    first?.focus();
    if (first?.select && first.tagName === "INPUT") first.select();
  });
}
function confirmDestructive(title, message, label) {
  return dialog({
    title,
    body: `<p>${esc(message)}</p>`,
    actions: [
      { label: t("Cancel"), value: "cancel", kind: "quiet" },
      { label, value: "confirm", kind: "danger" },
    ],
  });
}
function promptName(title, label, value = "", confirm = t("Create")) {
  return dialog({
    title,
    body: `<label class="field"><span>${esc(label)}</span><input name="name" maxlength="200" value="${esc(value)}" autocomplete="off"></label>`,
    actions: [
      { label: t("Cancel"), value: "cancel", kind: "quiet" },
      { label: confirm, value: "ok", kind: "primary", primary: true },
    ],
    collect: (d) => $("input[name=name]", d).value.trim(),
    validate: (_, name) => (name ? null : t("Enter a name.")),
  }).then((result) => result?.data || null);
}

let popover = null;
function closePopover(restoreFocus = false) {
  if (!popover) return;
  const { el, anchor, onClose } = popover;
  popover = null;
  anchor?.setAttribute("aria-expanded", "false");
  el.classList.add("leaving");
  el.setAttribute("aria-hidden", "true");
  setTimeout(() => el.remove(), reducedMotion() ? 0 : 120);
  onClose?.();
  if (restoreFocus) anchor?.focus();
}
function openPopover(anchor, html, { className = "", onClose, align } = {}) {
  closePopover();
  const el = document.createElement("div");
  el.className = "popover " + className;
  el.innerHTML = html;
  let layer = $("#layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "layer";
    document.body.append(layer);
  }
  layer.append(el);
  anchor?.setAttribute("aria-expanded", "true");
  placePopover(el, anchor, align);
  popover = { el, anchor, onClose, align };
  return el;
}
function placePopover(el, anchor, align) {
  const rect = anchor?.getBoundingClientRect?.() || {
    left: 0,
    bottom: 0,
    top: 0,
    right: 0,
  };
  const width = el.offsetWidth || 240,
    height = el.offsetHeight || 200;
  let left = align === "end" ? rect.right - width : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = rect.bottom + 6;
  const above =
    top + height > window.innerHeight - 8 && rect.top - height - 6 > 8;
  if (above) top = rect.top - height - 6;
  el.classList.toggle("above", above);
  el.style.left = left + "px";
  el.style.top = Math.max(8, top) + "px";
}
document.addEventListener("pointerdown", (e) => {
  if (
    popover &&
    !popover.el.contains(e.target) &&
    !popover.anchor?.contains(e.target)
  )
    closePopover();
});

/**
 * Menu with keyboard navigation. items: {label, value, icon, hint, danger,
 * checked, disabled, heading, divider}. onPick(item) may be async.
 */
function menu(
  anchor,
  items,
  onPick,
  { filter = false, placeholder, multi = false, align, className = "" } = {},
) {
  const el = openPopover(
    anchor,
    `<div class="menu" role="menu">${filter ? `<div class="menu-filter">${icon("search")}<input type="text" placeholder="${esc(placeholder || t("Filter"))}" aria-label="${esc(placeholder || t("Filter"))}"></div>` : ""}<div class="menu-items"></div></div>`,
    { className: "menu-pop " + className, align },
  );
  const list = $(".menu-items", el);
  const input = $(".menu-filter input", el);
  const draw = () => {
    const q = (input?.value || "").toLowerCase();
    const visible = items.filter(
      (it) =>
        it.heading ||
        it.divider ||
        !q ||
        String(it.label).toLowerCase().includes(q),
    );
    list.innerHTML =
      visible
        .map((it) => {
          if (it.divider)
            return '<div class="menu-sep" role="separator"></div>';
          if (it.heading)
            return `<div class="menu-heading">${esc(it.label)}</div>`;
          const index = items.indexOf(it);
          return `<button type="button" class="menu-item${it.danger ? " danger" : ""}${it.checked ? " checked" : ""}" role="${multi ? "menuitemcheckbox" : "menuitem"}" data-index="${index}" ${multi ? `aria-checked="${!!it.checked}"` : ""} ${it.disabled ? "disabled" : ""}>${it.icon ? icon(it.icon) : it.html || ""}<span class="menu-label">${esc(it.label)}</span>${it.hint ? `<span class="menu-hint">${esc(it.hint)}</span>` : ""}${it.checked ? icon("check", "tick") : ""}</button>`;
        })
        .join("") ||
      `<div class="menu-empty">${esc(t("Nothing matches"))}</div>`;
  };
  draw();
  placePopover(el, anchor, align);
  const buttons = () => $$(".menu-item:not(:disabled)", list);
  const pick = (button) => {
    const item = items[+button.dataset.index];
    if (multi) {
      item.checked = !item.checked;
      draw();
      $(`[data-index="${items.indexOf(item)}"]`, list)?.focus();
      run(onPick, item);
    } else {
      closePopover(true);
      run(onPick, item);
    }
  };
  list.addEventListener("click", (e) => {
    const button = e.target.closest(".menu-item");
    if (button && !button.disabled) pick(button);
  });
  el.addEventListener("keydown", (e) => {
    const all = buttons();
    const index = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next =
        e.key === "ArrowDown"
          ? all[(index + 1) % all.length]
          : all[(index - 1 + all.length) % all.length];
      next?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePopover(true);
    } else if (e.key === "Enter" && e.target === input) {
      e.preventDefault();
      if (all[0]) pick(all[0]);
    } else if (e.key === "Tab") {
      closePopover();
    }
  });
  input?.addEventListener("input", draw);
  (input || buttons()[0])?.focus();
  return el;
}

/* ───────────────────────── Sessions: editing & autosave ───────────────────────── */

function session(id) {
  return sessions.get(id);
}
async function openSession(id) {
  const existing = sessions.get(id);
  if (existing && (existing.dirty || existing.flight || existing.error))
    return existing;
  const r = await api(wp("/resources/" + id));
  const s = existing || {
    dirty: false,
    timer: null,
    flight: null,
    error: null,
  };
  s.r = r;
  s.error = null;
  sessions.set(id, s);
  return s;
}
function edit(s, patch, delay = 650) {
  if (!s || readOnly() || s.r.trashed) return;
  Object.assign(s.r, patch);
  s.dirty = true;
  if (s.error !== "conflict") s.error = null;
  status(s, "unsaved");
  clearTimeout(s.timer);
  s.timer = setTimeout(() => saveSession(s).catch(() => {}), delay);
}
async function saveSession(s) {
  clearTimeout(s.timer);
  if (s.flight) {
    await s.flight.catch(() => {});
    if (s.dirty) return saveSession(s);
    if (s.error) throw Error(s.errorMessage);
    return s.r;
  }
  if (!s.dirty) return s.r;
  if (s.error === "conflict") throw Error(s.errorMessage);
  const current = s.r;
  s.dirty = false;
  status(s, "saving");
  s.flight = api(wp("/resources/" + current.id), "PUT", body(current))
    .then((result) => {
      current.revision = result.revision;
      current.updated_at = result.updated_at;
      current.completed_at = result.completed_at;
      current.trashed_at = result.trashed_at;
      s.error = null;
      upsert(result);
      patchRows(result.id);
      status(s, s.dirty ? "unsaved" : "saved");
      if (s.dirty)
        s.timer = setTimeout(() => saveSession(s).catch(() => {}), 400);
      return current;
    })
    .catch((error) => {
      s.dirty = true;
      s.errorMessage = error.message;
      s.error = /^Resource changed/.test(error.message) ? "conflict" : "failed";
      status(s);
      throw error;
    })
    .finally(() => (s.flight = null));
  return s.flight;
}
async function reloadSession(s) {
  if (s.dirty) await saveSession(s);
  s.r = await api(wp("/resources/" + s.r.id));
  upsert(s.r);
  return s;
}
function status(s, value) {
  const id = s.r.id;
  const kind = value || (s.error === "conflict" ? "conflict" : "failed");
  for (const el of $$(`[data-status-for="${cssq(id)}"]`)) {
    el.dataset.state = kind;
    clearTimeout(el._fade);
    if (kind === "saving")
      el.innerHTML = `<span class="dot"></span>${esc(t("Saving…"))}`;
    else if (kind === "unsaved")
      el.innerHTML = `<span class="dot"></span>${esc(t("Editing"))}`;
    else if (kind === "saved") {
      el.innerHTML = `${icon("check")}${esc(t("Saved"))}`;
      el._fade = setTimeout(() => (el.dataset.state = "idle"), 1600);
    } else if (kind === "conflict")
      el.innerHTML = `${icon("info")}<span>${esc(t("Changed elsewhere"))}</span><button type="button" class="link" data-act="keep-mine" data-id="${esc(id)}">${esc(t("Keep mine"))}</button><button type="button" class="link" data-act="use-saved" data-id="${esc(id)}">${esc(t("Use saved"))}</button>`;
    else if (kind === "failed")
      el.innerHTML = `${icon("info")}<span>${esc(t("Couldn't save"))}</span><button type="button" class="link" data-act="retry-save" data-id="${esc(id)}">${esc(t("Retry"))}</button>`;
    else el.innerHTML = "";
  }
}
function statusSlot(id) {
  return `<span class="save-status" data-status-for="${esc(id)}" data-state="idle" aria-live="polite"></span>`;
}
/** Save every open editor. Returns false if the user chose to stay with unsaved work. */
async function flushAll() {
  const failed = [];
  for (const s of sessions.values()) {
    if (!s.dirty && !s.flight) continue;
    try {
      await saveSession(s);
    } catch {
      failed.push(s);
    }
  }
  if (!failed.length) return true;
  const names = failed.map((s) => "“" + displayTitle(s.r) + "”").join(", ");
  const conflict = failed.some((s) => s.error === "conflict");
  const choice = await dialog({
    title: t("Your latest changes aren't saved"),
    body: `<p>${esc(
      conflict
        ? t(
            "{names} changed somewhere else since you opened it. Keep your version, or discard your unsaved changes.",
            { names },
          )
        : t("{names} couldn't be saved: {reason}", {
            names,
            reason: failed[0].errorMessage,
          }),
    )}</p>`,
    actions: [
      { label: t("Discard my changes"), value: "discard", kind: "danger" },
      ...(conflict
        ? [{ label: t("Keep my version"), value: "keep", kind: "" }]
        : []),
      { label: t("Stay here"), value: "cancel", kind: "primary" },
    ],
  });
  if (!choice) return false;
  if (choice.value === "keep") {
    for (const s of failed) await keepMine(s);
    return flushAll();
  }
  for (const s of failed) {
    clearTimeout(s.timer);
    sessions.delete(s.r.id);
  }
  return true;
}
async function keepMine(s) {
  const latest = await api(wp("/resources/" + s.r.id));
  s.r.revision = latest.revision;
  s.error = null;
  s.dirty = true;
  await saveSession(s);
  toast(t("Your version was saved."));
}
async function useSaved(s) {
  clearTimeout(s.timer);
  s.r = await api(wp("/resources/" + s.r.id));
  s.dirty = false;
  s.error = null;
  upsert(s.r);
  rerenderSessionViews(s.r.id);
  toast(t("Showing the saved version."));
}
function dropSessions(keep = []) {
  for (const [id, s] of sessions)
    if (!keep.includes(id) && !s.dirty && !s.flight) sessions.delete(id);
}

/** Change one resource safely: through its open editor, or GET-then-PUT. */
async function mutate(id, changes) {
  const s = sessions.get(id);
  if (s) {
    Object.assign(s.r, typeof changes === "function" ? changes(s.r) : changes);
    s.dirty = true;
    await saveSession(s);
    return s.r;
  }
  const fresh = await api(wp("/resources/" + id));
  const patch = typeof changes === "function" ? changes(fresh) : changes;
  const result = await api(
    wp("/resources/" + id),
    "PUT",
    body({ ...fresh, ...patch }),
  );
  upsert(result);
  patchRows(id);
  return result;
}
function upsert(r) {
  const index = state.resources.findIndex((x) => x.id === r.id);
  const summary = { ...r };
  delete summary.attachments;
  delete summary.links;
  delete summary.backlinks;
  if (r.trashed) {
    if (index >= 0) state.resources.splice(index, 1);
  } else if (index >= 0) Object.assign(state.resources[index], summary);
  else state.resources.unshift(summary);
}
async function loadResources() {
  state.resources = state.wid ? await api(wp("/resources")) : [];
}

/* ───────────────────────── Rows ───────────────────────── */

function taskRow(r, { hideProject = false, card = false } = {}) {
  const done = r.status === "completed",
    cancelled = r.status === "cancelled";
  const chips = [];
  if (r.due_date && !done && !cancelled) chips.push(dueChip(r.due_date));
  else if (!done && !cancelled && r.start_date && r.start_date > today())
    chips.push(
      `<span class="chip">${icon("play")}${esc(t("Starts {day}", { day: relativeDay(r.start_date) }))}</span>`,
    );
  if (!done && !cancelled) chips.push(priorityChip(r.priority));
  if (r.project && !hideProject)
    chips.push(
      `<span class="chip project-chip">${icon("project")}${esc(titleOf(r.project))}</span>`,
    );
  chips.push(checklistProgress(r));
  if (cancelled)
    chips.push(`<span class="chip muted">${esc(t("Cancelled"))}</span>`);
  if (done && r.completed_at)
    chips.push(
      `<span class="chip muted">${esc(t("Done {time}", { time: relativeTime(r.completed_at) }))}</span>`,
    );
  const selected = state.drawer?.mode === "task" && state.drawer.id === r.id;
  const holding = state.holding.has(r.id);
  const chipHtml = chips.filter(Boolean).join("");
  return `<div class="${card ? "card" : "task-row"}${done ? " is-done" : ""}${cancelled ? " is-cancelled" : ""}${selected ? " is-selected" : ""}" data-row="${esc(r.id)}" data-row-kind="${card ? "card" : "task"}" data-open-task="${esc(r.id)}" tabindex="0" role="listitem" ${card && !readOnly() ? 'draggable="true"' : ""} aria-label="${esc(r.title)}">
    <button type="button" class="check" data-act="toggle-task" data-complete="${esc(r.id)}" data-id="${esc(r.id)}" aria-pressed="${done}" aria-label="${esc(done ? t("Reopen {title}", { title: r.title }) : t("Complete {title}", { title: r.title }))}" tabindex="-1" ${readOnly() || cancelled ? "disabled" : ""}>${CHECK}</button>
    <div class="row-main"><span class="task-title">${r.icon ? esc(r.icon) + " " : ""}${esc(displayTitle(r))}</span>${chipHtml ? `<span class="chips">${chipHtml}</span>` : ""}</div>
    ${holding ? undoButton(r.id) : ""}
    <button type="button" class="row-more" data-act="${card ? "card-menu" : "task-menu"}" data-id="${esc(r.id)}" aria-label="${esc(t("More actions for {title}", { title: r.title }))}" tabindex="-1">${icon("more")}</button>
  </div>`;
}
function noteRow(r, { removable = false } = {}) {
  const snippet = plainText(r.content).slice(0, 140);
  const selected =
    (state.view === "note" && state.noteId === r.id) ||
    (state.view === "collection" && state.collectionNoteId === r.id);
  return `<div class="note-row${selected ? " is-selected" : ""}" data-row="${esc(r.id)}" data-row-kind="note" data-open-note="${esc(r.id)}" tabindex="0" role="listitem">
    <div class="note-row-top"><span class="note-row-title">${r.daily_date ? icon("sun", "lead") : ""}${r.icon ? `<span class="emoji">${esc(r.icon)}</span>` : ""}${esc(displayTitle(r))}</span>${r.pinned ? icon("pin", "pinned") : ""}<time datetime="${esc(r.updated_at)}">${esc(relativeTime(r.updated_at))}</time></div>
    <div class="note-row-snippet">${snippet ? esc(snippet) : `<em>${esc(t("Empty note"))}</em>`}</div>
    ${removable ? `<button type="button" class="row-remove" data-act="remove-from-collection" data-id="${esc(r.id)}" aria-label="${esc(t("Remove {title} from this Collection", { title: displayTitle(r) }))}" title="${esc(t("Remove from Collection"))}">${icon("x")}</button>` : ""}
  </div>`;
}
function patchRows(id) {
  const r = find(id);
  if (!r) return;
  for (const el of $$(`[data-row="${cssq(id)}"]`)) {
    if (el.dataset.animating) continue;
    const kind = el.dataset.rowKind;
    let html = null;
    if (kind === "task")
      html = taskRow(r, {
        hideProject: el.closest("[data-hide-project]") !== null,
      });
    else if (kind === "card")
      html = taskRow(r, { card: true, hideProject: true });
    else if (kind === "note")
      html = noteRow(r, { removable: !!el.querySelector(".row-remove") });
    if (!html) continue;
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const hadFocus =
      el.contains(document.activeElement) && document.activeElement === el;
    el.replaceWith(template.content.firstElementChild);
    if (hadFocus)
      $(`[data-row="${cssq(id)}"][data-row-kind="${kind}"]`)?.focus();
  }
  if (state.drawer?.mode === "task" && state.drawer.id === id) {
    const s = sessions.get(id);
    if (s) {
      const check = $("#drawer .drawer-check");
      if (check) {
        check.setAttribute("aria-pressed", String(s.r.status === "completed"));
        $("#drawer .inspector").classList.toggle(
          "is-done",
          s.r.status === "completed",
        );
      }
    }
  }
}

/* ───────────────────────── Shell ───────────────────────── */

const NAV = [
  ["home", "home", "Home"],
  ["note", "note", "Notes"],
  ["task", "task", "Tasks"],
  ["project", "project", "Projects"],
  ["collection", "collection", "Collections"],
];

function splash(message = "") {
  $("#app").innerHTML =
    `<div class="splash"><div class="splash-mark">${MARK}</div><div class="display poster">MNEMOSYNE</div><div class="splash-status">${esc(message)}</div></div>`;
}

function renderShell() {
  const w = ws();
  $("#app").innerHTML = `<div class="app" id="shell">
    <aside class="sidebar" aria-label="${esc(t("Mnemosyne"))}">
      <div class="brand">${MARK}<div class="brand-text"><span class="display wordmark">MNEMOSYNE</span><span class="display house">AUREATE EMPYREAN</span></div></div>
      <button type="button" class="ws-switch" data-act="workspace-menu" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t("Switch Workspace"))}">${avatar(w?.title)}<span class="ws-text"><span class="ws-label">${esc(t("Workspace"))}</span><span class="ws-name">${esc(w?.title || "")}</span></span>${icon("chevronsUpDown", "ws-chevron")}</button>
      <nav class="nav" aria-label="${esc(t("Mnemosyne navigation"))}"><span class="nav-ink" aria-hidden="true"></span>${NAV.map(([view, glyph, label]) => `<button type="button" class="nav-item" data-view="${view}" title="${esc(t(label))}">${icon(glyph)}<span>${esc(t(label))}</span>${view === "task" ? '<span class="nav-count" id="task-count"></span>' : ""}</button>`).join("")}</nav>
      <button type="button" class="nav-item daily-link" data-act="open-daily" title="${esc(t("Today's note"))}">${icon("sun")}<span>${esc(t("Today's note"))}</span><span class="nav-hint" id="daily-hint"></span></button>
      <div class="sidebar-foot">
        <div id="sync-slot"></div>
        <button type="button" class="nav-item" data-view="trash" title="${esc(t("Trash"))}">${icon("trash")}<span>${esc(t("Trash"))}</span></button>
        <button type="button" class="nav-item" data-act="apps-menu" aria-haspopup="menu" aria-expanded="false" title="${esc(t("Applications"))}">${icon("apps")}<span>${esc(t("Applications"))}</span></button>
        <button type="button" class="nav-item" data-act="more-menu" aria-haspopup="menu" aria-expanded="false" title="${esc(t("More"))}">${icon("more")}<span>${esc(t("More"))}</span></button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar"><div class="crumbs" id="crumbs"></div><label class="search">${icon("search")}<input id="search" type="search" autocomplete="off" aria-label="${esc(t("Search this Workspace"))}"><kbd>/</kbd></label></header>
      <div id="banner"></div>
      <div id="view" class="view" tabindex="-1"></div>
    </main>
    <aside id="drawer" class="drawer" aria-hidden="true" tabindex="-1"></aside>
  </div>`;
  updateShell();
}
function updateShell() {
  const w = ws();
  if (!$("#shell")) return;
  $(".ws-switch").innerHTML =
    `${avatar(w?.title)}<span class="ws-text"><span class="ws-label">${esc(t("Workspace"))}</span><span class="ws-name">${esc(w?.title || "")}</span></span>${icon("chevronsUpDown", "ws-chevron")}`;
  $("#search").placeholder = t("Search {workspace}", {
    workspace: w?.title || "",
  });
  $("#daily-hint").textContent = shortDay(today());
  const count = state.resources.filter(
    (r) => taskIn("overdue", r) || taskIn("today", r),
  ).length;
  $("#task-count").textContent = count || "";
  $("#banner").innerHTML = readOnly()
    ? `<div class="banner">${icon("archive")}<span>${esc(t("This Workspace is archived. Everything is read-only until you restore it."))}</span><button type="button" class="btn small" data-act="unarchive-workspace">${esc(t("Restore Workspace"))}</button></div>`
    : "";
  updateNav();
}
function updateNav() {
  const active = state.view === "search" ? state.returnView : state.view;
  for (const el of $$(".sidebar [data-view]"))
    el.classList.toggle("active", el.dataset.view === active);
  const current = $(`.nav [data-view="${active}"]`);
  const ink = $(".nav-ink");
  if (ink) {
    ink.style.opacity = current ? "1" : "0";
    if (current) {
      ink.style.transform = `translateY(${current.offsetTop}px)`;
      ink.style.height = current.offsetHeight + "px";
    }
  }
}
function crumbs(items) {
  const el = $("#crumbs");
  if (!el) return;
  el.innerHTML = items
    .map((item, i) =>
      i === items.length - 1
        ? `<h1 class="crumb-current">${esc(item.label)}</h1>`
        : `<button type="button" class="crumb" data-act="${esc(item.act)}" ${item.id ? `data-id="${esc(item.id)}"` : ""}>${esc(item.label)}</button>${icon("chevronRight", "crumb-sep")}`,
    )
    .join("");
}

/* ───────────────────────── Navigation ───────────────────────── */

const VIEWS = {};
async function go(view, options = {}) {
  if (!(await flushAll())) return;
  closePopover();
  const previous = state.view;
  if (view !== "search") {
    state.query = "";
    if ($("#search")) $("#search").value = "";
  }
  if (state.drawer && (view !== previous || options.closeDrawer))
    closeDrawer({ flush: false });
  Object.assign(state, options.set || {});
  state.view = view;
  dropSessions();
  if (options.reload !== false) await loadResources();
  await renderView({ direction: options.direction ?? 0 });
}
async function renderView({ direction = 0, soft = false } = {}) {
  const token = ++renderToken;
  updateShell();
  const container = $("#view");
  if (!container) return;
  await VIEWS[state.view]({ token, soft });
  if (token !== renderToken) return;
  if (!soft) {
    container.scrollTop = 0;
    enterView(container.firstElementChild, direction);
  }
}
/** Re-render the current view in place, animating list changes. */
function softRender() {
  return renderView({ soft: true });
}
async function openResource(id, { context } = {}) {
  if (!(await flushAll())) return;
  let r = find(id);
  if (!r) r = await api(wp("/resources/" + id));
  if (r.trashed) {
    toast(t("“{title}” is in Trash.", { title: displayTitle(r) }), {
      action: t("Open Trash"),
      onAction: () => go("trash"),
    });
    return;
  }
  if (r.kind === "task") return openTask(id);
  if (r.kind === "note")
    return go("note", {
      set: { noteId: id, noteContext: context || null, preview: false },
      direction: 1,
    });
  if (r.kind === "project")
    return go("project", {
      set: { projectId: id, projectTab: "overview" },
      direction: 1,
    });
  if (r.kind === "collection")
    return go("collection", {
      set: { collectionId: id, collectionNoteId: null },
      direction: 1,
    });
}
async function openDaily() {
  if (!(await flushAll())) return;
  const r = await api(wp("/daily/" + today()), "POST");
  upsert(r);
  await go("note", {
    set: { noteId: r.id, noteContext: null, preview: false },
  });
  const body = $("#markdown");
  if (body && !body.disabled) {
    body.focus();
    body.setSelectionRange(body.value.length, body.value.length);
  }
}

/* ───────────────────────── Drawer (inspector & details) ───────────────────────── */

async function openTask(id, { focus = false } = {}) {
  if (state.drawer?.mode === "task" && state.drawer.id === id) {
    if (focus) $("#drawer .drawer-title")?.focus();
    return;
  }
  const previous =
    state.drawer?.mode === "task" ? sessions.get(state.drawer.id) : null;
  if (previous?.dirty) await saveSession(previous).catch(() => {});
  const s = await openSession(id);
  state.drawer = { mode: "task", id };
  renderDrawer();
  $$(
    ".is-selected[data-row-kind='task'], .is-selected[data-row-kind='card']",
  ).forEach((el) => el.classList.remove("is-selected"));
  $$(`[data-row="${cssq(id)}"]`).forEach((el) =>
    el.classList.add("is-selected"),
  );
  if (focus) $("#drawer .drawer-title")?.focus();
  return s;
}
async function openDetails(id) {
  await openSession(id);
  state.drawer = { mode: "details", id };
  renderDrawer();
  $$("[data-act='toggle-details']").forEach((b) =>
    b.setAttribute("aria-pressed", "true"),
  );
}
function closeDrawer({ flush = true } = {}) {
  const current = state.drawer;
  if (!current) return;
  const s = sessions.get(current.id);
  if (flush && s?.dirty) saveSession(s).catch(() => {});
  state.drawer = null;
  const drawer = $("#drawer");
  drawer?.classList.remove("open");
  drawer?.setAttribute("aria-hidden", "true");
  $("#shell")?.classList.remove("drawer-open");
  $$("[data-act='toggle-details']").forEach((b) =>
    b.setAttribute("aria-pressed", "false"),
  );
  $$(`[data-row="${cssq(current.id)}"]`).forEach((el) =>
    el.classList.remove("is-selected"),
  );
  setTimeout(() => {
    if (!state.drawer && drawer) drawer.innerHTML = "";
  }, 240);
  if (current.mode === "task") $(`[data-row="${cssq(current.id)}"]`)?.focus();
}
function renderDrawer() {
  const drawer = $("#drawer");
  const current = state.drawer;
  if (!drawer || !current) return;
  const s = sessions.get(current.id);
  if (!s) return;
  drawer.innerHTML =
    current.mode === "task" ? inspectorHtml(s.r) : detailsHtml(s.r);
  drawer.setAttribute("aria-hidden", "false");
  drawer.setAttribute(
    "aria-label",
    current.mode === "task" ? t("Task") : t("Details"),
  );
  $$("textarea.autosize", drawer).forEach(autosize);
  if (!drawer.classList.contains("open")) {
    drawer.classList.add("open");
    $("#shell")?.classList.add("drawer-open");
  }
  if (current.mode === "task") renderChecklist(s);
}
function rerenderSessionViews(id) {
  if (state.drawer?.id === id) renderDrawer();
  if (
    (state.view === "note" && state.noteId === id) ||
    (state.view === "collection" &&
      (state.collectionNoteId === id || state.collectionId === id)) ||
    (state.view === "project" && state.projectId === id)
  )
    renderView({ soft: true });
}

function propertyChips(r) {
  const chips = [];
  const ro = readOnly() || r.trashed ? "disabled" : "";
  if (r.due_date)
    chips.push(
      `<button type="button" class="prop ${daysBetween(today(), r.due_date) < 0 && r.status === "open" ? "danger" : ""}" data-act="prop" data-prop="due_date" ${ro}>${icon("calendar")}<span>${esc(t("Due {day}", { day: relativeDay(r.due_date) }))}</span></button>`,
    );
  if (r.start_date)
    chips.push(
      `<button type="button" class="prop" data-act="prop" data-prop="start_date" ${ro}>${icon("play")}<span>${esc(t("Starts {day}", { day: relativeDay(r.start_date) }))}</span></button>`,
    );
  if (r.priority && r.priority !== "none")
    chips.push(
      `<button type="button" class="prop prio-${r.priority}" data-act="prop" data-prop="priority" ${ro}>${icon("flag")}<span>${esc(PRIORITY_LABEL()[r.priority])}</span></button>`,
    );
  if (r.project)
    chips.push(
      `<button type="button" class="prop" data-act="prop" data-prop="project" ${ro}>${icon("project")}<span>${esc(titleOf(r.project))}</span></button>`,
    );
  if (r.related_note)
    chips.push(
      `<button type="button" class="prop" data-act="prop" data-prop="related_note" ${ro}>${icon("note")}<span>${esc(titleOf(r.related_note))}</span></button>`,
    );
  for (const tag of r.tags)
    chips.push(
      `<button type="button" class="prop tag" data-act="prop" data-prop="tags" ${ro}>${icon("tag")}<span>${esc(tag)}</span></button>`,
    );
  if (!ro)
    chips.push(
      `<button type="button" class="prop add" data-act="add-property" aria-haspopup="menu">${icon("plus")}<span>${esc(t("Add"))}</span></button>`,
    );
  return chips.join("");
}
function inspectorHtml(r) {
  const done = r.status === "completed",
    cancelled = r.status === "cancelled";
  const ro = readOnly() || r.trashed;
  return `<div class="inspector${done ? " is-done" : ""}" data-session="${esc(r.id)}">
    <header class="drawer-head">
      <button type="button" class="check drawer-check" data-act="toggle-task" data-id="${esc(r.id)}" aria-pressed="${done}" aria-label="${esc(done ? t("Reopen task") : t("Complete task"))}" ${ro || cancelled ? "disabled" : ""}>${CHECK}</button>
      <textarea class="drawer-title autosize" data-edit="title" rows="1" maxlength="200" aria-label="${esc(t("Task title"))}" placeholder="${esc(t("Untitled"))}" ${ro ? "readonly" : ""}>${esc(r.title === "Untitled" ? "" : r.title)}</textarea>
      <div class="drawer-tools">${statusSlot(r.id)}<button type="button" class="icon-btn" data-act="task-menu" data-id="${esc(r.id)}" data-from="inspector" aria-label="${esc(t("More actions"))}" aria-haspopup="menu">${icon("more")}</button><button type="button" class="icon-btn" data-act="close-drawer" aria-label="${esc(t("Close"))}">${icon("close")}</button></div>
    </header>
    ${cancelled ? `<div class="inline-banner">${esc(t("This task was cancelled."))}<button type="button" class="link" data-act="reopen-task" data-id="${esc(r.id)}" ${ro ? "disabled" : ""}>${esc(t("Reopen"))}</button></div>` : ""}
    <div class="props" id="props">${propertyChips(r)}</div>
    <textarea class="desc autosize" data-edit="content" rows="3" maxlength="40000" placeholder="${esc(t("Add notes…"))}" aria-label="${esc(t("Description"))}" ${ro ? "readonly" : ""}>${esc(r.content)}</textarea>
    <section class="checklist" aria-label="${esc(t("Checklist"))}"><header class="section-label"><span>${esc(t("Checklist"))}</span><span class="checklist-count" id="checklist-count"></span></header><div id="checklist" role="list"></div>${ro ? "" : `<div class="check-add">${icon("plus")}<input id="check-text" maxlength="500" placeholder="${esc(t("Add a step"))}" aria-label="${esc(t("Add a checklist step"))}"></div>`}</section>
    <details class="more" data-animate><summary>${icon("chevronRight", "disclosure")}${esc(t("Attachments, links and more"))}</summary><div class="more-body">${sharedSections(r)}</div></details>
  </div>`;
}
function renderChecklist(s) {
  const r = s.r;
  const list = $("#checklist");
  if (!list) return;
  const ro = readOnly() || r.trashed;
  list.innerHTML = r.checklist
    .map(
      (item, i) =>
        `<div class="check-item${item.done ? " is-done" : ""}" role="listitem"><button type="button" class="check small" data-act="toggle-step" data-index="${i}" aria-pressed="${item.done}" aria-label="${esc(item.done ? t("Mark step not done") : t("Mark step done"))}" ${ro ? "disabled" : ""}>${CHECK}</button><input class="step-text" data-step="${i}" value="${esc(item.text)}" maxlength="500" aria-label="${esc(t("Checklist step"))}" ${ro ? "readonly" : ""}><button type="button" class="icon-btn subtle" data-act="remove-step" data-index="${i}" aria-label="${esc(t("Remove step"))}" ${ro ? "disabled" : ""}>${icon("x")}</button></div>`,
    )
    .join("");
  const done = r.checklist.filter((c) => c.done).length;
  $("#checklist-count").textContent = r.checklist.length
    ? `${done}/${r.checklist.length}`
    : "";
}
function sharedSections(r) {
  const ro = readOnly() || r.trashed ? "disabled" : "";
  const attachments = (r.attachments || [])
    .map(
      (a) =>
        `<div class="d-row" data-attachment="${esc(a.id)}">${icon("paperclip")}<span class="d-row-main"><span class="d-row-title">${esc(a.name)}</span><span class="d-row-meta">${esc(fileSize(a.size))}</span></span><span class="d-row-actions">${/^image\/(png|jpeg|gif|webp)$/.test(a.media_type) ? `<button type="button" class="icon-btn" data-act="preview-attachment" data-id="${esc(a.id)}" aria-label="${esc(t("Preview {name}", { name: a.name }))}">${icon("eye")}</button>` : ""}<button type="button" class="icon-btn" data-act="download-attachment" data-id="${esc(a.id)}" aria-label="${esc(t("Download {name}", { name: a.name }))}">${icon("download")}</button><button type="button" class="icon-btn" data-act="remove-attachment" data-id="${esc(a.id)}" aria-label="${esc(t("Remove {name}", { name: a.name }))}" ${ro}>${icon("x")}</button></span></div>`,
    )
    .join("");
  const links = (r.links || [])
    .map((l) => {
      const local = l.target.match(/^nexus:v1:mnemosyne:([a-z-]+):(.+)$/);
      const label =
        local && find(local[2]) ? displayTitle(find(local[2])) : l.target;
      return `<div class="d-row">${icon("link")}<button type="button" class="d-row-main link-target" data-act="resolve-link" data-target="${esc(l.target)}"><span class="d-row-title">${esc(label)}</span>${label !== l.target ? `<span class="d-row-meta mono">${esc(l.target)}</span>` : ""}${l.readers && l.readers !== "[]" ? `<span class="d-row-meta">${esc(t("Shared with {modules}", { modules: JSON.parse(l.readers).join(", ") }))}</span>` : ""}</button><span class="d-row-actions"><button type="button" class="icon-btn" data-act="unlink" data-id="${esc(l.id)}" aria-label="${esc(t("Remove link"))}" ${ro}>${icon("x")}</button></span></div>`;
    })
    .join("");
  const backlinks = (r.backlinks || [])
    .map(
      (b) =>
        `<button type="button" class="d-row as-button" data-act="open" data-id="${esc(b.id)}">${icon(KIND_ICON[b.kind])}<span class="d-row-main"><span class="d-row-title">${esc(displayTitle(b))}</span><span class="d-row-meta">${esc(KIND_LABEL()[b.kind])}</span></span></button>`,
    )
    .join("");
  const accent = (r.accent || "").toUpperCase();
  return `
    <section class="d-section"><h3>${esc(t("Attachments"))}</h3>${attachments || `<p class="d-empty">${esc(t("No files attached."))}</p>`}${ro ? "" : `<label class="btn small file-btn">${icon("paperclip")}<span>${esc(t("Attach a file"))}</span><input type="file" data-attach="${esc(r.id)}" hidden></label><p class="d-hint">${esc(t("Up to 1 MiB per file."))}</p>`}</section>
    <section class="d-section"><h3>${esc(t("Links"))}</h3>${links || `<p class="d-empty">${esc(t("This doesn't link to anything yet."))}</p>`}
      ${ro ? "" : `<details class="link-form" data-animate><summary>${icon("plus", "disclosure-plus")}${esc(t("Link a resource"))}</summary><div class="link-form-body"><label class="field"><span>${esc(t("Reference"))}</span><input id="link-target" class="mono" placeholder="nexus:v1:module:type:id" autocomplete="off"></label><label class="field"><span>${esc(t("Share with modules (optional)"))}</span><input id="link-readers" placeholder="${esc(t("module-id, another-module"))}" autocomplete="off"></label><p class="d-hint">${esc(t("Sharing also lets those modules see this item's title. Leave empty to keep the link private."))}</p><button type="button" class="btn small primary" data-act="add-link">${esc(t("Add link"))}</button></div></details>`}
    </section>
    <section class="d-section"><h3>${esc(t("Linked from"))}</h3>${backlinks || `<p class="d-empty">${esc(t("Nothing in this Workspace links here."))}</p>`}<button type="button" class="btn small quiet" data-act="nexus-backlinks">${icon("refresh")}<span>${esc(t("Check other modules"))}</span></button><div class="nexus-backlinks" id="nexus-backlinks"></div></section>
    <section class="d-section"><h3>${esc(t("Appearance"))}</h3>
      <div class="appearance"><label class="icon-field"><span>${esc(t("Icon"))}</span><input data-edit="icon" maxlength="8" value="${esc(r.icon)}" placeholder="✦" aria-label="${esc(t("Icon"))}" ${ro}></label>
      <div class="swatches" role="radiogroup" aria-label="${esc(t("Color"))}"><button type="button" class="swatch none${!accent ? " on" : ""}" data-act="set-accent" data-color="" role="radio" aria-checked="${!accent}" aria-label="${esc(t("No color"))}" ${ro}>${icon("x")}</button>${ACCENTS.map((c) => `<button type="button" class="swatch${accent === c ? " on" : ""}" style="--swatch:${c}" data-act="set-accent" data-color="${c}" role="radio" aria-checked="${accent === c}" aria-label="${esc(t("Color {hex}", { hex: c }))}" ${ro}></button>`).join("")}<label class="swatch custom${accent && !ACCENTS.includes(accent) ? " on" : ""}" style="--swatch:${esc(accent || "#8B7CF6")}" title="${esc(t("Custom color"))}"><input type="color" data-edit="accent" value="${esc((r.accent || "#8b7cf6").toLowerCase())}" aria-label="${esc(t("Custom color"))}" ${ro}></label></div></div>
      <label class="switch"><input type="checkbox" data-edit-bool="pinned" ${r.pinned ? "checked" : ""} ${ro}><span class="switch-track"></span><span>${esc(t("Pin to the top of lists"))}</span></label>
    </section>
    ${r.kind === "project" || r.kind === "collection" ? `<section class="d-section"><h3>${esc(t("Tags"))}</h3><div class="props">${r.tags.map((tag) => `<button type="button" class="prop tag" data-act="prop" data-prop="tags" ${ro}>${icon("tag")}<span>${esc(tag)}</span></button>`).join("")}${ro ? "" : `<button type="button" class="prop add" data-act="prop" data-prop="tags">${icon("plus")}<span>${esc(t("Tag"))}</span></button>`}</div></section>` : ""}
    <section class="d-section"><h3>${esc(t("Reference"))}</h3><code class="reference" tabindex="0">${esc(r.reference)}</code><p class="d-hint">${esc(t("Other modules use this identifier to link here."))}</p></section>
    <p class="d-stamp">${esc(t("Created {created} · Updated {updated}", { created: absoluteTime(r.created_at), updated: absoluteTime(r.updated_at) }))}${r.completed_at ? " · " + esc(t("Completed {time}", { time: absoluteTime(r.completed_at) })) : ""}</p>`;
}
function detailsHtml(r) {
  return `<div class="details" data-session="${esc(r.id)}">
    <header class="drawer-head plain"><div class="drawer-heading"><span class="eyebrow">${esc(t("Details"))}</span><h2>${esc(displayTitle(r))}</h2></div><div class="drawer-tools"><button type="button" class="icon-btn" data-act="close-drawer" aria-label="${esc(t("Close"))}">${icon("close")}</button></div></header>
    ${sharedSections(r)}
  </div>`;
}

/* ───────────────────────── Property editors ───────────────────────── */

function datePicker(anchor, value, onPick, { allowClear = true } = {}) {
  const day = today();
  const options = [
    [t("Today"), day],
    [t("Tomorrow"), addDays(day, 1)],
    [t("In a week"), addDays(day, 7)],
  ];
  const el = openPopover(
    anchor,
    `<div class="date-pop"><div class="date-quick">${options.map(([label, iso]) => `<button type="button" class="menu-item${iso === value ? " checked" : ""}" data-date="${iso}"><span class="menu-label">${esc(label)}</span><span class="menu-hint">${esc(shortDay(iso))}</span></button>`).join("")}</div><label class="date-field"><span>${esc(t("Pick a date"))}</span><input type="date" value="${esc(value || "")}"></label>${allowClear && value ? `<button type="button" class="menu-item danger" data-date=""><span class="menu-label">${esc(t("Remove date"))}</span></button>` : ""}</div>`,
    { className: "menu-pop" },
  );
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-date]");
    if (!b) return;
    closePopover(true);
    run(onPick, b.dataset.date || null);
  });
  const input = $("input[type=date]", el);
  input.addEventListener("change", () => {
    if (!input.value) return;
    closePopover(true);
    run(onPick, input.value);
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePopover(true);
    }
  });
  $(".menu-item", el)?.focus();
}
function priorityPicker(anchor, value, onPick) {
  menu(
    anchor,
    PRIORITIES.map((p) => ({
      label: PRIORITY_LABEL()[p],
      value: p,
      checked: p === value,
      html: `<span class="prio-${p}">${icon("flag")}</span>`,
    })),
    (item) => onPick(item.value),
  );
}
function resourcePicker(
  anchor,
  kind,
  value,
  onPick,
  { exclude = [], noneLabel } = {},
) {
  const options = byKind(kind)
    .filter((r) => !exclude.includes(r.id))
    .filter(
      (r) =>
        kind !== "project" ||
        !["archived", "completed"].includes(r.status) ||
        r.id === value,
    )
    .map((r) => ({
      label: displayTitle(r),
      value: r.id,
      checked: r.id === value,
      icon: KIND_ICON[kind],
    }));
  menu(
    anchor,
    [
      {
        label: noneLabel || t("None"),
        value: null,
        checked: !value,
        icon: "x",
      },
      ...options,
    ],
    (item) => onPick(item.value),
    {
      filter: options.length > 5,
      placeholder: kind === "project" ? t("Find a project") : t("Find a note"),
    },
  );
}
function tagEditor(anchor, tags, onChange) {
  const known = [
    ...new Set(state.resources.flatMap((r) => r.tags || [])),
  ].sort();
  const el = openPopover(
    anchor,
    `<div class="tag-pop"><div class="tag-list"></div><input class="tag-input" maxlength="50" placeholder="${esc(t("Add a tag and press Enter"))}" aria-label="${esc(t("Add a tag"))}"><div class="tag-suggest"></div></div>`,
    { className: "menu-pop" },
  );
  let current = [...tags];
  const input = $(".tag-input", el);
  const draw = () => {
    $(".tag-list", el).innerHTML =
      current
        .map(
          (tag, i) =>
            `<span class="chip tag-chip">${icon("tag")}${esc(tag)}<button type="button" data-remove="${i}" aria-label="${esc(t("Remove tag {tag}", { tag }))}">${icon("x")}</button></span>`,
        )
        .join("") || `<span class="d-empty">${esc(t("No tags yet."))}</span>`;
    const q = input.value.trim().toLowerCase();
    const suggestions = known
      .filter(
        (tag) =>
          !current.includes(tag) && (!q || tag.toLowerCase().includes(q)),
      )
      .slice(0, 6);
    $(".tag-suggest", el).innerHTML = suggestions
      .map(
        (tag) =>
          `<button type="button" class="menu-item" data-add="${esc(tag)}">${icon("tag")}<span class="menu-label">${esc(tag)}</span></button>`,
      )
      .join("");
  };
  const commit = () => run(onChange, [...current]);
  el.addEventListener("click", (e) => {
    const remove = e.target.closest("[data-remove]");
    const add = e.target.closest("[data-add]");
    if (remove) current.splice(+remove.dataset.remove, 1);
    else if (add) current.push(add.dataset.add);
    else return;
    draw();
    commit();
    input.focus();
  });
  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const value = input.value.trim();
      if (value && !current.includes(value) && current.length < 30) {
        current.push(value);
        input.value = "";
        draw();
        commit();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePopover(true);
    } else if (e.key === "Backspace" && !input.value && current.length) {
      current.pop();
      draw();
      commit();
    }
  });
  draw();
  placePopover(el, anchor);
  input.focus();
}
function editProperty(anchor, s, prop) {
  const r = s.r;
  const set = (patch) => {
    edit(s, patch, 0);
    refreshProps(s);
  };
  if (prop === "due_date" || prop === "start_date")
    return datePicker(anchor, r[prop], (value) => set({ [prop]: value }));
  if (prop === "priority")
    return priorityPicker(anchor, r.priority, (value) =>
      set({ priority: value }),
    );
  if (prop === "project")
    return resourcePicker(
      anchor,
      "project",
      r.project,
      (value) => set({ project: value }),
      { noneLabel: t("No project") },
    );
  if (prop === "related_note")
    return resourcePicker(
      anchor,
      "note",
      r.related_note,
      (value) => set({ related_note: value }),
      { exclude: [r.id], noneLabel: t("No related note") },
    );
  if (prop === "tags")
    return tagEditor(anchor, r.tags, (tags) => set({ tags }));
}
function refreshProps(s) {
  const holder =
    $(`[data-session="${cssq(s.r.id)}"] #props`) || $("#drawer #props");
  if (holder && state.drawer?.mode === "task" && state.drawer.id === s.r.id)
    holder.innerHTML = propertyChips(s.r);
  if (state.drawer?.mode === "details" && state.drawer.id === s.r.id)
    renderDrawer();
  const chips = $(`[data-session="${cssq(s.r.id)}"] .meta-chips`);
  if (chips) chips.innerHTML = noteChips(s.r);
  const projectMeta = $(`[data-session="${cssq(s.r.id)}"] .project-meta`);
  if (projectMeta) projectMeta.innerHTML = projectMetaHtml(s.r);
}

/* ───────────────────────── Quick add ───────────────────────── */

function draftDefaults(context) {
  if (context === "today") return { due_date: today() };
  if (context === "upcoming") return { due_date: addDays(today(), 1) };
  if (context?.startsWith("project:")) return { project: context.slice(8) };
  return {};
}
function draftChips(draft, { lockProject = false } = {}) {
  const chips = [];
  chips.push(
    draft.due_date
      ? `<button type="button" class="qa-chip set" data-act="draft-date">${icon("calendar")}<span>${esc(relativeDay(draft.due_date))}</span></button>`
      : `<button type="button" class="qa-chip" data-act="draft-date" aria-label="${esc(t("Set a deadline"))}" title="${esc(t("Deadline"))}">${icon("calendar")}</button>`,
  );
  chips.push(
    draft.priority && draft.priority !== "none"
      ? `<button type="button" class="qa-chip set prio-${draft.priority}" data-act="draft-priority">${icon("flag")}<span>${esc(PRIORITY_LABEL()[draft.priority])}</span></button>`
      : `<button type="button" class="qa-chip" data-act="draft-priority" aria-label="${esc(t("Set a priority"))}" title="${esc(t("Priority"))}">${icon("flag")}</button>`,
  );
  if (!lockProject)
    chips.push(
      draft.project
        ? `<button type="button" class="qa-chip set" data-act="draft-project">${icon("project")}<span>${esc(titleOf(draft.project))}</span></button>`
        : `<button type="button" class="qa-chip" data-act="draft-project" aria-label="${esc(t("Choose a project"))}" title="${esc(t("Project"))}">${icon("project")}</button>`,
    );
  return chips.join("");
}
function quickAddHtml(context, { placeholder, lockProject = false } = {}) {
  if (readOnly()) return "";
  if (state.draft.context !== context)
    state.draft = { context, ...draftDefaults(context) };
  return `<div class="quick-add" id="quick-add" data-context="${esc(context)}" ${lockProject ? 'data-lock-project="1"' : ""}><span class="qa-plus">${icon("plus")}</span><input class="qa-input" id="quick-add-input" maxlength="200" placeholder="${esc(placeholder || t("Add a task"))}" aria-label="${esc(t("Add a task"))}" autocomplete="off"><div class="qa-chips" id="qa-chips">${draftChips(state.draft, { lockProject })}</div><kbd class="qa-enter" aria-hidden="true">↵</kbd></div>`;
}
function redrawDraft() {
  const holder = $("#qa-chips") || $("#capture-chips");
  if (holder)
    holder.innerHTML = draftChips(state.draft, {
      lockProject: !!$("#quick-add")?.dataset.lockProject,
    });
}
async function createTask(title, draft, extra = {}) {
  const payload = {
    kind: "task",
    title,
    status: "open",
    priority: draft.priority || "none",
    due_date: draft.due_date || null,
    project: draft.project || null,
    ...extra,
  };
  const r = await api(wp("/resources"), "POST", payload);
  upsert(r);
  await softRender();
  if (!$(`[data-row="${cssq(r.id)}"]`)) {
    const destination = r.project
      ? titleOf(r.project)
      : !r.due_date
        ? t("Inbox")
        : t("Upcoming");
    toast(t("Added to {place}", { place: destination }), {
      action: t("Open"),
      onAction: () => openTask(r.id),
    });
  }
  return r;
}

/* ───────────────────────── Task actions ───────────────────────── */

async function toggleTask(id) {
  if (readOnly()) return;
  const r = find(id) || sessions.get(id)?.r;
  if (!r || r.status === "cancelled") return;
  const completing = r.status !== "completed";
  const rows = $$(`[data-row="${cssq(id)}"]`);
  const drawerCheck =
    state.drawer?.id === id ? $("#drawer .drawer-check") : null;
  const setVisual = (done) => {
    rows.forEach((row) => {
      row.classList.toggle("is-done", done);
      $(".check", row)?.setAttribute("aria-pressed", String(done));
    });
    drawerCheck?.setAttribute("aria-pressed", String(done));
    $("#drawer .inspector")?.classList.toggle("is-done", done);
  };
  // The row keeps its element (and its animation) until the hold settles.
  rows.forEach((row) => (row.dataset.animating = "1"));
  setVisual(completing);
  [...rows.map((row) => $(".check", row)), drawerCheck].forEach((check) =>
    animate(
      check,
      [
        { transform: "scale(1)" },
        { transform: "scale(.82)" },
        { transform: "scale(1.12)" },
        { transform: "scale(1)" },
      ],
      { duration: 300, easing: EASE_SPRING },
    ),
  );
  try {
    await mutate(id, { status: completing ? "completed" : "open" });
  } catch (error) {
    setVisual(!completing);
    rows.forEach((row) => delete row.dataset.animating);
    throw error;
  }
  hold(id);
  rows.forEach((row) => delete row.dataset.animating);
}
function undoButton(id) {
  return `<button type="button" class="undo-inline" data-act="undo-complete" data-id="${esc(id)}">${icon("undo")}${esc(t("Undo"))}</button>`;
}
/** Keep a just-changed task in place briefly, with Undo, before it settles. */
function hold(id) {
  clearTimeout(state.holding.get(id));
  state.holding.set(
    id,
    setTimeout(async () => {
      state.holding.delete(id);
      $$(`[data-row="${cssq(id)}"] .undo-inline`).forEach((b) => b.remove());
      await softRender();
    }, 2600),
  );
  for (const row of $$(`[data-row="${cssq(id)}"]`))
    if (!$(".undo-inline", row))
      $(".row-more", row)?.insertAdjacentHTML("beforebegin", undoButton(id));
}
async function undoComplete(id) {
  clearTimeout(state.holding.get(id));
  state.holding.delete(id);
  $$(`[data-row="${cssq(id)}"] .undo-inline`).forEach((b) => b.remove());
  const r = find(id);
  await mutate(id, {
    status: r?.status === "completed" ? "open" : "completed",
  });
  await softRender();
}
async function trashResource(id) {
  const s = sessions.get(id);
  if (s) {
    clearTimeout(s.timer);
  }
  const r = find(id) || s?.r;
  await mutate(id, { trashed: true });
  sessions.delete(id);
  if (state.drawer?.id === id) closeDrawer({ flush: false });
  const title = r ? displayTitle(r) : "";
  return title;
}
async function trashAndReport(id, after) {
  const title = await trashResource(id);
  await after?.();
  toast(t("“{title}” moved to Trash", { title }), {
    action: t("Undo"),
    onAction: async () => {
      await api(wp("/trash"), "POST", { action: "restore", ids: [id] });
      await loadResources();
      await softRender();
      toast(t("Restored “{title}”", { title }));
    },
  });
}
function taskMenu(anchor, id, { from } = {}) {
  const r = find(id) || sessions.get(id)?.r;
  if (!r) return;
  const ro = readOnly();
  const items = [];
  if (from !== "inspector")
    items.push({ label: t("Open"), value: "open", icon: "arrowRight" });
  items.push(
    { label: t("Deadline…"), value: "due", icon: "calendar", disabled: ro },
    { label: t("Priority…"), value: "priority", icon: "flag", disabled: ro },
    { label: t("Project…"), value: "project", icon: "project", disabled: ro },
    { divider: true },
    r.status === "cancelled"
      ? { label: t("Reopen task"), value: "reopen", icon: "undo", disabled: ro }
      : {
          label: t("Cancel task"),
          value: "cancel",
          icon: "x",
          disabled: ro || r.status === "completed",
        },
    {
      label: t("Move to Trash"),
      value: "trash",
      icon: "trash",
      danger: true,
      disabled: ro,
    },
  );
  menu(
    anchor,
    items,
    async (item) => {
      const s = sessions.get(id);
      const apply = async (patch) => {
        await mutate(id, patch);
        if (s && state.drawer?.id === id) renderDrawer();
        await softRender();
      };
      if (item.value === "open") return openTask(id, { focus: true });
      if (item.value === "due")
        return datePicker(anchor, r.due_date, (value) =>
          apply({ due_date: value }),
        );
      if (item.value === "priority")
        return priorityPicker(anchor, r.priority, (value) =>
          apply({ priority: value }),
        );
      if (item.value === "project")
        return resourcePicker(
          anchor,
          "project",
          r.project,
          (value) => apply({ project: value }),
          { noneLabel: t("No project") },
        );
      if (item.value === "cancel") return apply({ status: "cancelled" });
      if (item.value === "reopen") return apply({ status: "open" });
      if (item.value === "trash") return trashAndReport(id, softRender);
    },
    { align: "end" },
  );
}

/* ───────────────────────── Home ───────────────────────── */

VIEWS.home = async function renderHome({ soft }) {
  crumbs([{ label: t("Home") }]);
  const day = today();
  const overdue = state.resources
    .filter((r) => held("overdue", r))
    .sort(byUrgency);
  const due = state.resources
    .filter((r) => held("today", r) && !overdue.includes(r))
    .sort(byUrgency);
  const daily = state.resources.find(
    (r) => r.kind === "note" && r.daily_date === day,
  );
  const recent = state.resources
    .filter((r) => r.kind !== "task" && r.id !== daily?.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 6);
  const inbox = state.resources.filter((r) => taskIn("inbox", r)).length;
  const todayHtml =
    (overdue.length
      ? `<div class="group"><div class="group-head danger"><span>${esc(t("Overdue"))}</span><span class="group-count">${overdue.length}</span></div>${overdue.map((r) => taskRow(r)).join("")}</div>`
      : "") +
    (due.length
      ? `<div class="group">${overdue.length ? `<div class="group-head"><span>${esc(t("Due today"))}</span><span class="group-count">${due.length}</span></div>` : ""}${due.map((r) => taskRow(r)).join("")}</div>`
      : "") +
    (!overdue.length && !due.length
      ? `<div class="calm"><p>${esc(t("Nothing is due today."))}</p>${inbox ? `<button type="button" class="link" data-act="goto-tasks" data-task-view="inbox">${esc(plural(inbox, "Triage {count} task in your Inbox", "Triage {count} tasks in your Inbox"))}</button>` : ""}</div>`
      : "");
  if (soft && $("#home-today")) return morph($("#home-today"), todayHtml);
  const dailySnippet = daily
    ? plainText(daily.content, { keepLines: true }).slice(0, 240)
    : "";
  $("#view").innerHTML = `<div class="page home">
    <header class="home-head"><p class="eyebrow">${esc(ws().title)}</p><h2 class="date-title">${esc(longDay(day))}</h2></header>
    ${captureHtml()}
    <div class="home-grid">
      <section class="home-main" aria-labelledby="today-heading"><header class="section-head"><h3 id="today-heading">${esc(t("Today"))}</h3><button type="button" class="link" data-act="goto-tasks" data-task-view="today">${esc(t("All tasks"))}${icon("arrowRight")}</button></header><div class="task-list" role="list" id="home-today">${todayHtml}</div></section>
      <aside class="home-side">
        <button type="button" class="daily-card" data-act="open-daily">
          <span class="daily-card-head">${icon("sun")}<span>${esc(t("Today's note"))}</span></span>
          <span class="daily-card-body">${dailySnippet ? esc(dailySnippet) : `<em>${esc(t("A blank page for today's thoughts, links and loose ends."))}</em>`}</span>
          <span class="daily-card-cta">${esc(daily ? t("Continue writing") : t("Start writing"))}${icon("arrowRight")}</span>
        </button>
        <section class="recent"><header class="section-head"><h3>${esc(t("Recently edited"))}</h3></header>${recent.length ? `<div class="compact-list">${recent.map((r) => `<button type="button" class="compact-row" data-act="open" data-id="${esc(r.id)}">${resourceGlyph(r)}<span class="compact-title">${esc(displayTitle(r))}</span><span class="compact-meta">${esc(relativeTime(r.updated_at))}</span></button>`).join("")}</div>` : `<p class="calm-text">${esc(t("Notes, projects and collections you work on will show up here."))}</p>`}</section>
      </aside>
    </div>
  </div>`;
};
function captureHtml() {
  if (readOnly()) return "";
  if (state.draft.context !== "capture") state.draft = { context: "capture" };
  const task = state.captureKind === "task";
  return `<div class="capture" id="capture" data-kind="${state.captureKind}">
    <div class="seg" role="radiogroup" aria-label="${esc(t("Capture as"))}"><button type="button" role="radio" class="seg-btn${task ? " on" : ""}" data-act="capture-kind" data-kind="task" aria-checked="${task}">${icon("task")}${esc(t("Task"))}</button><button type="button" role="radio" class="seg-btn${!task ? " on" : ""}" data-act="capture-kind" data-kind="note" aria-checked="${!task}">${icon("note")}${esc(t("Note"))}</button></div>
    <input id="capture-input" class="capture-input" maxlength="200" autocomplete="off" aria-label="${esc(t("Capture"))}" placeholder="${esc(task ? t("What needs doing?") : t("Title of a new note"))}">
    <div class="qa-chips" id="capture-chips" ${task ? "" : "hidden"}>${draftChips(state.draft)}</div>
    <kbd class="qa-enter" aria-hidden="true">↵</kbd>
  </div>`;
}

/* ───────────────────────── Tasks ───────────────────────── */

const TASK_TABS = [
  ["today", "Today"],
  ["inbox", "Inbox"],
  ["upcoming", "Upcoming"],
  ["completed", "Completed"],
  ["all", "All"],
];
function tabsHtml(tabs, active, attribute, label) {
  return `<div class="tabs" role="tablist" aria-label="${esc(label)}"><span class="tab-ink" aria-hidden="true"></span>${tabs.map(([value, text, count]) => `<button type="button" role="tab" class="tab${value === active ? " on" : ""}" aria-selected="${value === active}" ${attribute}="${value}">${esc(t(text))}${count ? `<span class="tab-count">${count}</span>` : ""}</button>`).join("")}</div>`;
}
function placeInk(root = document, instant = false) {
  for (const tabs of $$(".tabs", root)) {
    const on = $(".tab.on", tabs),
      ink = $(".tab-ink", tabs);
    if (!on || !ink) continue;
    if (instant) ink.classList.add("instant");
    ink.style.transform = `translateX(${on.offsetLeft}px)`;
    ink.style.width = on.offsetWidth + "px";
    if (instant) raf(() => ink.classList.remove("instant"));
  }
}
function groupsFor(view) {
  const day = today();
  const tasks = state.resources.filter((r) => r.kind === "task");
  const groups = [];
  if (view === "today") {
    const overdue = tasks.filter((r) => held("overdue", r)).sort(byUrgency);
    const due = tasks
      .filter((r) => held("today", r) && !overdue.includes(r))
      .sort(byUrgency);
    if (overdue.length)
      groups.push({ label: t("Overdue"), tone: "danger", rows: overdue });
    if (due.length)
      groups.push({ label: overdue.length ? t("Due today") : "", rows: due });
  } else if (view === "inbox") {
    const rows = tasks.filter((r) => held("inbox", r)).sort(byUrgency);
    if (rows.length) groups.push({ label: "", rows });
  } else if (view === "upcoming") {
    const rows = tasks.filter((r) => held("upcoming", r));
    const key = (r) =>
      r.due_date && r.due_date > day
        ? r.due_date
        : r.start_date || r.due_date || day;
    const buckets = new Map();
    for (const r of rows.sort(
      (a, b) => key(a).localeCompare(key(b)) || byUrgency(a, b),
    )) {
      const k = key(r);
      const label = daysBetween(day, k) < 7 ? k : "later";
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(r);
    }
    for (const [label, list] of buckets)
      groups.push({
        label:
          label === "later"
            ? t("Later")
            : relativeDay(label) +
              (daysBetween(day, label) > 1 ? " · " + shortDay(label) : ""),
        rows: list,
      });
  } else if (view === "completed") {
    const rows = tasks
      .filter((r) => held("completed", r))
      .sort((a, b) =>
        (b.completed_at || "").localeCompare(a.completed_at || ""),
      );
    const buckets = new Map();
    for (const r of rows) {
      const d = r.completed_at
        ? isoInZone(new Date(r.completed_at), ws().timezone)
        : day;
      const diff = daysBetween(d, day);
      const label =
        diff === 0
          ? t("Today")
          : diff === 1
            ? t("Yesterday")
            : diff < 7
              ? formatDay(d, { weekday: "long" })
              : t("Earlier");
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(r);
    }
    for (const [label, list] of buckets) groups.push({ label, rows: list });
  } else {
    const buckets = new Map();
    for (const r of tasks.sort(byUrgency)) {
      const k = r.project && find(r.project) ? r.project : "";
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }
    const keys = [...buckets.keys()].sort((a, b) =>
      !a ? 1 : !b ? -1 : titleOf(a).localeCompare(titleOf(b)),
    );
    for (const k of keys)
      groups.push({
        label: k ? titleOf(k) : t("No project"),
        rows: buckets.get(k),
        project: k,
      });
  }
  return groups;
}
function groupsHtml(groups, emptyHtml, options = {}) {
  if (!groups.length) return emptyHtml;
  return groups
    .map(
      (g) =>
        `<div class="group"${options.hideProject || g.project ? " data-hide-project" : ""}>${g.label ? `<div class="group-head ${g.tone || ""}"><span>${esc(g.label)}</span><span class="group-count">${g.rows.length}</span></div>` : ""}${g.rows.map((r) => taskRow(r, { hideProject: options.hideProject || (g.project !== undefined && !!g.project) })).join("")}</div>`,
    )
    .join("");
}
function emptyState(glyph, title, text, action = "") {
  return `<div class="empty">${icon(glyph, "empty-glyph")}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
const TASK_EMPTY = {
  today: [
    "sun",
    "Nothing due today",
    "Tasks with today's deadline or start date appear here. Overdue work shows at the top.",
  ],
  inbox: [
    "task",
    "Inbox zero",
    "New tasks without a project land here until you give them a home.",
  ],
  upcoming: [
    "calendar",
    "Nothing scheduled",
    "Give a task a future deadline or start date and it will wait here.",
  ],
  completed: [
    "check",
    "Nothing completed yet",
    "Tick a task off and it will be kept here.",
  ],
  all: [
    "task",
    "No tasks yet",
    "Add your first task above. Only a title is needed.",
  ],
};
VIEWS.task = async function renderTasks({ soft }) {
  const view = state.taskView;
  crumbs([{ label: t("Tasks") }]);
  const empty = emptyState(...TASK_EMPTY[view].map((s, i) => (i ? t(s) : s)));
  const html = groupsHtml(groupsFor(view), empty);
  if (soft && $("#task-groups")) {
    await morph($("#task-groups"), html);
    updateTabCounts();
    return;
  }
  const counts = {
    today: state.resources.filter(
      (r) => taskIn("today", r) || taskIn("overdue", r),
    ).length,
    inbox: state.resources.filter((r) => taskIn("inbox", r)).length,
  };
  $("#view").innerHTML = `<div class="page tasks">
    <header class="page-bar">${tabsHtml(
      TASK_TABS.map(([v, l]) => [v, l, counts[v]]),
      view,
      "data-task-view",
      t("Task views"),
    )}</header>
    <div class="list-wrap">
      ${view === "completed" ? "" : quickAddHtml(view === "all" ? "all" : view)}
      <div class="task-list" role="list" id="task-groups">${html}</div>
    </div>
  </div>`;
  placeInk($("#view"), true);
};
function updateTabCounts() {
  const counts = {
    today: state.resources.filter(
      (r) => taskIn("today", r) || taskIn("overdue", r),
    ).length,
    inbox: state.resources.filter((r) => taskIn("inbox", r)).length,
  };
  for (const [view, count] of Object.entries(counts)) {
    const tab = $(`.tab[data-task-view="${view}"]`);
    if (!tab) continue;
    let badge = $(".tab-count", tab);
    if (!count) badge?.remove();
    else if (badge) badge.textContent = count;
    else
      tab.insertAdjacentHTML(
        "beforeend",
        `<span class="tab-count">${count}</span>`,
      );
  }
  placeInk();
}

/* ───────────────────────── Notes & Daily Note ───────────────────────── */

function noteChips(r) {
  const ro = readOnly() || r.trashed;
  const chips = [];
  for (const id of r.collections) {
    const c = find(id);
    chips.push(
      `<span class="chip meta-chip${c ? "" : " muted"}"><button type="button" class="chip-main" data-act="${c ? "open" : "noop"}" data-id="${esc(id)}" ${c ? "" : "disabled"}>${icon("collection")}${esc(c ? displayTitle(c) : t("Collection in Trash"))}</button>${ro ? "" : `<button type="button" class="chip-x" data-act="note-remove-collection" data-id="${esc(id)}" aria-label="${esc(t("Remove from {name}", { name: c ? displayTitle(c) : t("Collection in Trash") }))}">${icon("x")}</button>`}</span>`,
    );
  }
  if (r.project) {
    const p = find(r.project);
    chips.push(
      `<span class="chip meta-chip"><button type="button" class="chip-main" data-act="${p ? "open" : "noop"}" data-id="${esc(r.project)}" ${p ? "" : "disabled"}>${icon("project")}${esc(p ? displayTitle(p) : t("Project in Trash"))}</button>${ro ? "" : `<button type="button" class="chip-x" data-act="note-clear-project" aria-label="${esc(t("Remove from project"))}">${icon("x")}</button>`}</span>`,
    );
  }
  for (const tag of r.tags)
    chips.push(
      `<span class="chip meta-chip"><button type="button" class="chip-main" data-act="note-tags" ${ro ? "disabled" : ""}>${icon("tag")}${esc(tag)}</button></span>`,
    );
  if (!ro)
    chips.push(
      `<button type="button" class="chip meta-add" data-act="note-add-meta" aria-haspopup="menu">${icon("plus")}<span>${esc(chips.length ? t("Add") : t("Add to a collection, project or tag"))}</span></button>`,
    );
  return chips.join("");
}
function dailyNeighbours(r) {
  const days = byKind("note")
    .filter((n) => n.daily_date)
    .sort((a, b) => a.daily_date.localeCompare(b.daily_date));
  const index = days.findIndex((n) => n.id === r.id);
  return { prev: days[index - 1], next: days[index + 1] };
}
function noteEditorHtml(r, context) {
  const ro = readOnly() || r.trashed;
  const daily = !!r.daily_date;
  const around = daily ? dailyNeighbours(r) : {};
  const back = context
    ? `<button type="button" class="back-link" data-act="${esc(context.act)}" ${context.id ? `data-id="${esc(context.id)}"` : ""}>${icon("chevronLeft")}${esc(context.label)}</button>`
    : "";
  const eyebrow = daily
    ? `<div class="daily-nav"><button type="button" class="icon-btn" data-act="open" data-id="${esc(around.prev?.id || "")}" ${around.prev ? "" : "disabled"} aria-label="${esc(t("Previous daily note"))}">${icon("chevronLeft")}</button><span class="eyebrow">${icon("sun")}${esc(t("Daily note"))}</span><button type="button" class="icon-btn" data-act="open" data-id="${esc(around.next?.id || "")}" ${around.next ? "" : "disabled"} aria-label="${esc(t("Next daily note"))}">${icon("chevronRight")}</button>${r.daily_date !== today() ? `<button type="button" class="link" data-act="open-daily">${esc(t("Go to today"))}</button>` : ""}</div>`
    : "";
  const titleValue =
    r.title === "Untitled"
      ? ""
      : daily && r.title === r.daily_date
        ? longDay(r.daily_date)
        : r.title;
  const format = [
    ["# ", "", "H1", t("Heading")],
    ["## ", "", "H2", t("Subheading")],
    ["**", "**", "<b>B</b>", t("Bold")],
    ["*", "*", "<i>I</i>", t("Italic")],
    ["- ", "", icon("list"), t("Bulleted list")],
    ["- [ ] ", "", icon("checklist"), t("Checklist")],
    ["> ", "", icon("quote"), t("Quote")],
    ["```\n", "\n```", icon("code"), t("Code block")],
  ];
  return `<div class="note-editor${state.preview ? " previewing" : ""}" data-session="${esc(r.id)}">
    <header class="editor-bar">
      <div class="editor-bar-start">${back}${eyebrow}</div>
      <div class="editor-bar-end">${statusSlot(r.id)}
        <div class="seg small" role="radiogroup" aria-label="${esc(t("Editor mode"))}"><button type="button" role="radio" class="seg-btn${state.preview ? "" : " on"}" data-act="write-mode" aria-checked="${!state.preview}">${esc(t("Write"))}</button><button type="button" role="radio" class="seg-btn${state.preview ? " on" : ""}" id="preview-toggle" data-act="preview-mode" aria-checked="${state.preview}">${esc(t("Preview"))}</button></div>
        <button type="button" class="icon-btn" data-act="toggle-details" data-id="${esc(r.id)}" aria-pressed="${state.drawer?.mode === "details" && state.drawer.id === r.id}" aria-label="${esc(t("Details"))}" title="${esc(t("Details"))}">${icon("info")}</button>
        <button type="button" class="icon-btn" data-act="note-menu" data-id="${esc(r.id)}" aria-haspopup="menu" aria-label="${esc(t("More actions"))}">${icon("more")}</button>
      </div>
    </header>
    ${r.trashed ? `<div class="inline-banner">${esc(t("This note is in Trash."))}<button type="button" class="link" data-act="restore-open" data-id="${esc(r.id)}" ${readOnly() ? "disabled" : ""}>${esc(t("Restore it"))}</button></div>` : ""}
    <div class="editor-scroll"><div class="writing">
      <textarea class="note-title autosize" data-edit="title" rows="1" maxlength="200" placeholder="${esc(t("Untitled"))}" aria-label="${esc(t("Title"))}" ${ro ? "readonly" : ""}>${esc(titleValue)}</textarea>
      <div class="meta-chips">${noteChips(r)}</div>
      ${ro ? "" : `<div class="format-bar" role="toolbar" aria-label="${esc(t("Formatting"))}">${format.map(([before, after, label, name]) => `<button type="button" class="fmt" data-act="format" data-before="${esc(before)}" data-after="${esc(after)}" aria-label="${esc(name)}" title="${esc(name)}">${label}</button>`).join("")}<button type="button" class="fmt" data-act="insert-table" aria-label="${esc(t("Table"))}" title="${esc(t("Table"))}">${icon("table")}</button><button type="button" class="fmt" data-act="insert-note-link" aria-label="${esc(t("Link to a note"))}" title="${esc(t("Link to a note"))}" aria-haspopup="menu">${icon("link")}</button></div>`}
      <textarea id="markdown" class="note-body autosize" data-edit="content" maxlength="40000" placeholder="${esc(t("Start writing…"))}" aria-label="${esc(t("Note text"))}" ${ro ? "readonly" : ""} ${state.preview ? "hidden" : ""}>${esc(r.content)}</textarea>
      <article id="preview" class="note-preview markdown" ${state.preview ? "" : "hidden"}></article>
    </div></div>
  </div>`;
}
async function mountNoteEditor(container, id, context) {
  const s = await openSession(id);
  container.innerHTML = noteEditorHtml(s.r, context);
  $$("textarea.autosize", container).forEach(autosize);
  if (state.preview) await renderPreview(s);
  if (state.drawer?.mode === "details" && state.drawer.id !== id) closeDrawer();
  return s;
}
async function renderPreview(s) {
  const result = await api("/api/preview", "POST", { content: s.r.content });
  const el = $("#preview");
  if (!el) return;
  el.innerHTML =
    result.html ||
    `<p class="calm-text">${esc(t("Nothing to preview yet."))}</p>`;
}
VIEWS.note = async function renderNotes({ token, soft }) {
  const notes = byKind("note");
  if (state.noteId && !find(state.noteId) && !sessions.get(state.noteId))
    state.noteId = null;
  if (!state.noteId && notes.length) state.noteId = notes[0].id;
  const current = state.noteId
    ? find(state.noteId) || sessions.get(state.noteId)?.r
    : null;
  crumbs([{ label: t("Notes") }]);
  const listHtml = notes.length
    ? notes.map((n) => noteRow(n)).join("")
    : `<div class="pane-empty"><p>${esc(t("Your notes will live here."))}</p></div>`;
  if (soft && $("#note-list")) {
    const filter = $("#note-filter")?.value;
    if (!filter) await morph($("#note-list"), listHtml, { enter: false });
    return;
  }
  $("#view").innerHTML = `<div class="split notes-split">
    <aside class="pane list-pane" aria-label="${esc(t("Notes"))}">
      <header class="pane-head"><h2>${esc(t("Notes"))}</h2>${readOnly() ? "" : `<button type="button" class="icon-btn accent" data-act="new-note" aria-label="${esc(t("New note"))}" title="${esc(t("New note"))}">${icon("plus")}</button>`}</header>
      <label class="pane-filter">${icon("search")}<input id="note-filter" type="search" autocomplete="off" placeholder="${esc(t("Filter notes"))}" aria-label="${esc(t("Filter notes"))}"></label>
      <div id="note-list" class="note-list" role="list">${listHtml}</div>
    </aside>
    <section class="pane editor-pane" id="editor-slot">${current ? "" : emptyState("note", t("Start writing"), t("Notes are plain Markdown. Create one and start typing — it saves as you go."), readOnly() ? "" : `<button type="button" class="btn primary" data-act="new-note">${icon("plus")}${esc(t("New note"))}</button>`)}</section>
  </div>`;
  if (current) {
    await mountNoteEditor($("#editor-slot"), current.id, state.noteContext);
    if (token !== renderToken) return;
    crumbs([
      { label: t("Notes"), act: "goto-notes" },
      { label: displayTitle(sessions.get(current.id).r) },
    ]);
  }
};
async function createNote(extra = {}, { context } = {}) {
  if (!(await flushAll())) return;
  const r = await api(wp("/resources"), "POST", {
    kind: "note",
    title: "Untitled",
    status: "open",
    ...extra,
  });
  upsert(r);
  return r;
}

/* ───────────────────────── Projects ───────────────────────── */

function projectStats(p) {
  const tasks = state.resources.filter(
    (r) => r.kind === "task" && r.project === p.id,
  );
  const open = tasks.filter((r) => r.status === "open");
  const done = tasks.filter((r) => r.status === "completed").length;
  const next = open
    .map((r) => r.due_date)
    .filter(Boolean)
    .sort()[0];
  return { open: open.length, done, total: open.length + done, next };
}
function projectRow(p) {
  const stats = projectStats(p);
  const ratio = stats.total ? stats.done / stats.total : 0;
  const snippet = plainText(p.content).slice(0, 140);
  return `<button type="button" class="project-row" data-row="${esc(p.id)}" data-act="open" data-id="${esc(p.id)}">
    <span class="project-mark" style="${p.accent ? `--mark:${esc(p.accent)}` : ""}">${p.icon ? esc(p.icon) : icon("project")}</span>
    <span class="project-row-main"><span class="project-row-title">${esc(p.title)}${p.status !== "active" ? `<span class="badge">${esc(PROJECT_STATE_LABEL()[p.status])}</span>` : ""}</span>${snippet ? `<span class="project-row-desc">${esc(snippet)}</span>` : ""}</span>
    <span class="project-row-stats"><span class="progress" aria-hidden="true"><span style="width:${Math.round(ratio * 100)}%"></span></span><span class="project-row-count">${esc(stats.total ? t("{open} open · {done} done", { open: stats.open, done: stats.done }) : t("No tasks yet"))}</span></span>
    <span class="project-row-due">${p.due_date ? `<span class="chip ${daysBetween(today(), p.due_date) < 0 && p.status === "active" ? "danger" : ""}" title="${esc(longDay(p.due_date))}">${icon("calendar")}${esc(t("Due {day}", { day: shortDay(p.due_date) }))}</span>` : ""}</span>
  </button>`;
}
function projectMetaHtml(p) {
  const ro = readOnly() ? "disabled" : "";
  const stats = projectStats(p);
  return `<button type="button" class="status-pill st-${esc(p.status)}" data-act="project-status" aria-haspopup="menu" ${ro}><span class="status-dot"></span>${esc(PROJECT_STATE_LABEL()[p.status])}${icon("chevronDown")}</button>
    <button type="button" class="prop" data-act="project-date" data-prop="start_date" ${ro}>${icon("play")}<span>${esc(p.start_date ? t("Starts {day}", { day: shortDay(p.start_date) }) : t("Start date"))}</span></button>
    <button type="button" class="prop${p.due_date && daysBetween(today(), p.due_date) < 0 && p.status === "active" ? " danger" : ""}" data-act="project-date" data-prop="due_date" ${ro}>${icon("calendar")}<span>${esc(p.due_date ? t("Due {day}", { day: shortDay(p.due_date) }) : t("Deadline"))}</span></button>
    <span class="project-progress">${esc(stats.total ? t("{open} open · {done} done", { open: stats.open, done: stats.done }) : t("No tasks yet"))}</span>`;
}
VIEWS.project = async function renderProjects({ token, soft }) {
  if (state.projectId && !find(state.projectId)) state.projectId = null;
  if (state.projectId) return renderProject({ token, soft });
  crumbs([{ label: t("Projects") }]);
  const projects = byKind("project");
  const groups = [
    [t("Active"), projects.filter((p) => p.status === "active")],
    [t("On hold"), projects.filter((p) => p.status === "on-hold")],
  ];
  const closed = projects.filter((p) =>
    ["completed", "archived"].includes(p.status),
  );
  if (state.showClosedProjects)
    groups.push([t("Completed and archived"), closed]);
  const body = projects.length
    ? groups
        .filter(([, list]) => list.length)
        .map(
          ([label, list]) =>
            `<section class="group"><div class="group-head"><span>${esc(label)}</span><span class="group-count">${list.length}</span></div><div class="project-list">${list.map(projectRow).join("")}</div></section>`,
        )
        .join("") +
      (closed.length
        ? `<button type="button" class="link toggle-closed" data-act="toggle-closed-projects">${esc(state.showClosedProjects ? t("Hide completed and archived") : plural(closed.length, "Show {count} completed or archived project", "Show {count} completed or archived projects"))}</button>`
        : "")
    : emptyState(
        "project",
        t("No projects yet"),
        t(
          "A project is something you're working toward — with tasks, notes and an end.",
        ),
        readOnly()
          ? ""
          : `<button type="button" class="btn primary" data-act="new-project">${icon("plus")}${esc(t("New project"))}</button>`,
      );
  $("#view").innerHTML = `<div class="page projects">
    <header class="page-bar"><p class="page-intro">${esc(t("Goals you're working toward, with their tasks and notes."))}</p>${readOnly() || !projects.length ? "" : `<button type="button" class="btn primary" data-act="new-project">${icon("plus")}${esc(t("New project"))}</button>`}</header>
    ${body}
  </div>`;
};
async function renderProject({ token, soft }) {
  const s = await openSession(state.projectId);
  if (token !== renderToken) return;
  const p = s.r;
  crumbs([{ label: t("Projects"), act: "goto-projects" }, { label: p.title }]);
  if (soft && $("#project-work")) {
    $(".project-meta").innerHTML = projectMetaHtml(p);
    return renderProjectWork(true);
  }
  const ro = readOnly();
  $("#view").innerHTML = `<div class="page project" data-session="${esc(p.id)}">
    <header class="project-head">
      <div class="project-title-row"><span class="project-mark big" style="${p.accent ? `--mark:${esc(p.accent)}` : ""}">${p.icon ? esc(p.icon) : icon("project")}</span><textarea class="project-title autosize" data-edit="title" rows="1" maxlength="200" aria-label="${esc(t("Project name"))}" ${ro ? "readonly" : ""}>${esc(p.title)}</textarea><div class="head-tools">${statusSlot(p.id)}<button type="button" class="icon-btn" data-act="toggle-details" data-id="${esc(p.id)}" aria-pressed="false" aria-label="${esc(t("Details"))}" title="${esc(t("Details"))}">${icon("info")}</button><button type="button" class="icon-btn" data-act="project-menu" aria-haspopup="menu" aria-label="${esc(t("More actions"))}">${icon("more")}</button></div></div>
      <div class="project-meta">${projectMetaHtml(p)}</div>
      <textarea class="project-desc autosize" data-edit="content" rows="1" maxlength="40000" placeholder="${esc(t("What does done look like?"))}" aria-label="${esc(t("Project description"))}" ${ro ? "readonly" : ""}>${esc(p.content)}</textarea>
      ${tabsHtml(
        [
          ["overview", "Overview"],
          ["board", "Board"],
          ["tasks", "Tasks"],
          ["notes", "Notes"],
        ],
        state.projectTab,
        "data-project-tab",
        t("Project views"),
      )}
    </header>
    <div id="project-work" class="project-work"></div>
  </div>`;
  $$("textarea.autosize", $("#view")).forEach(autosize);
  placeInk($("#view"), true);
  await renderProjectWork(false);
}
async function renderProjectWork(soft) {
  const p = sessions.get(state.projectId)?.r || find(state.projectId);
  const holder = $("#project-work");
  if (!p || !holder) return;
  const tasks = state.resources.filter(
    (r) => r.kind === "task" && r.project === p.id,
  );
  const notes = byKind("note").filter((n) => n.project === p.id);
  const tab = state.projectTab;
  let html = "";
  if (tab === "overview") {
    const next = tasks
      .filter((r) => r.status === "open" || state.holding.has(r.id))
      .sort(byUrgency)
      .slice(0, 6);
    html = `<div class="overview-grid"><section><header class="section-head"><h3>${esc(t("Next up"))}</h3>${tasks.length ? `<button type="button" class="link" data-act="project-tab" data-project-tab="tasks">${esc(t("All tasks"))}${icon("arrowRight")}</button>` : ""}</header>${quickAddHtml("project:" + p.id, { lockProject: true })}<div class="task-list" role="list" data-hide-project id="project-list">${next.map((r) => taskRow(r, { hideProject: true })).join("") || `<p class="calm-text">${esc(t("No open tasks. Add the next step above."))}</p>`}</div></section>
      <section><header class="section-head"><h3>${esc(t("Notes"))}</h3>${readOnly() ? "" : `<button type="button" class="link" data-act="project-new-note">${icon("plus")}${esc(t("New note"))}</button>`}</header><div class="note-list flat" role="list">${
        notes
          .slice(0, 6)
          .map((n) => noteRow(n))
          .join("") ||
        `<p class="calm-text">${esc(t("Notes linked to this project appear here."))}</p>`
      }</div></section></div>`;
  } else if (tab === "board") {
    html = boardHtml(p, tasks);
  } else if (tab === "tasks") {
    const open = tasks
      .filter((r) => r.status === "open" || state.holding.has(r.id))
      .sort(byUrgency);
    const closed = tasks
      .filter((r) => r.status !== "open" && !state.holding.has(r.id))
      .sort(byUrgency);
    html = `${quickAddHtml("project:" + p.id, { lockProject: true })}<div class="task-list" role="list" data-hide-project id="project-list">${open.map((r) => taskRow(r, { hideProject: true })).join("") || `<p class="calm-text">${esc(t("No open tasks."))}</p>`}${closed.length ? `<div class="group"><div class="group-head"><span>${esc(t("Completed and cancelled"))}</span><span class="group-count">${closed.length}</span></div>${closed.map((r) => taskRow(r, { hideProject: true })).join("")}</div>` : ""}</div>`;
  } else {
    html = `<div class="page-bar inner">${readOnly() ? "" : `<button type="button" class="btn" data-act="project-new-note">${icon("plus")}${esc(t("New note"))}</button>`}</div><div class="note-list flat" role="list">${notes.map((n) => noteRow(n)).join("") || emptyState("note", t("No project notes"), t("Plans, research and meeting notes for this project."))}</div>`;
  }
  if (soft && (tab === "overview" || tab === "tasks") && $("#project-list")) {
    const template = document.createElement("template");
    template.innerHTML = html;
    return morph(
      $("#project-list"),
      $("#project-list", template.content).innerHTML,
    );
  }
  if (soft) return morph(holder, html);
  holder.innerHTML = html;
  enterView(holder.firstElementChild, 0);
}
function boardHtml(p, tasks) {
  return `<div class="board" role="list">${COLUMNS.map((column) => {
    const open = tasks
      .filter(
        (r) =>
          r.board_column === column &&
          (r.status === "open" || state.holding.has(r.id)),
      )
      .sort(byUrgency);
    const closed = tasks.filter(
      (r) =>
        r.board_column === column &&
        r.status !== "open" &&
        !state.holding.has(r.id),
    );
    const expanded = state.openDoneColumns.has(column);
    return `<section class="column" data-column="${esc(column)}" aria-label="${esc(t(column))}">
      <header class="column-head"><span>${esc(t(column))}</span><span class="group-count">${open.length}</span></header>
      <div class="column-cards" data-drop="${esc(column)}" role="list">${open.map((r) => taskRow(r, { card: true, hideProject: true })).join("")}</div>
      ${closed.length ? `<button type="button" class="column-closed" data-act="toggle-column-done" data-column="${esc(column)}" aria-expanded="${expanded}">${icon(expanded ? "chevronDown" : "chevronRight")}${esc(plural(closed.length, "{count} finished", "{count} finished"))}</button><div class="column-cards finished" ${expanded ? "" : "hidden"}>${closed.map((r) => taskRow(r, { card: true, hideProject: true })).join("")}</div>` : ""}
      ${readOnly() ? "" : `<div class="column-add" data-column="${esc(column)}"><button type="button" class="column-add-btn" data-act="column-add" data-column="${esc(column)}">${icon("plus")}${esc(t("Add task"))}</button></div>`}
    </section>`;
  }).join(
    "",
  )}</div><p class="board-hint">${esc(t("Columns organize work; they don't complete tasks. Drag cards, or use Alt + ← / → on a focused card."))}</p>`;
}
async function moveCard(id, column) {
  const r = find(id);
  if (!r || r.board_column === column || readOnly()) return;
  const previous = r.board_column;
  r.board_column = column;
  await softRender();
  try {
    await mutate(id, { board_column: column });
  } catch (error) {
    r.board_column = previous;
    await softRender();
    throw error;
  }
  $(`[data-row="${cssq(id)}"]`)?.focus();
}

/* ───────────────────────── Collections ───────────────────────── */

function collectionChildren(parentId) {
  const all = byKind("collection");
  return all
    .filter((c) =>
      parentId
        ? c.parent === parentId
        : !c.parent || !all.some((x) => x.id === c.parent),
    )
    .sort((a, b) => b.pinned - a.pinned || a.title.localeCompare(b.title));
}
function descendants(id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of byKind("collection"))
      if (c.parent && out.has(c.parent) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
  }
  return out;
}
function collectionPath(id) {
  const path = [];
  let current = find(id);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent ? find(current.parent) : null;
  }
  return path;
}
function treeHtml(parentId = null, depth = 0) {
  return collectionChildren(parentId)
    .map((c) => {
      const kids = collectionChildren(c.id);
      const open = !state.collapsedNodes.has(c.id);
      const count = byKind("note").filter((n) =>
        n.collections.includes(c.id),
      ).length;
      const selected = state.collectionId === c.id;
      return `<div class="tree-node" role="treeitem" aria-expanded="${kids.length ? open : "false"}" aria-selected="${selected}">
        <div class="tree-row${selected ? " is-selected" : ""}" style="--depth:${depth}">
          ${kids.length ? `<button type="button" class="tree-toggle" data-act="toggle-node" data-id="${esc(c.id)}" aria-label="${esc(open ? t("Collapse") : t("Expand"))}">${icon("chevronRight", open ? "open" : "")}</button>` : '<span class="tree-spacer"></span>'}
          <button type="button" class="tree-label" data-act="select-collection" data-id="${esc(c.id)}">${c.icon ? `<span class="emoji">${esc(c.icon)}</span>` : `<span class="tree-glyph" style="${c.accent ? `color:${esc(c.accent)}` : ""}">${icon("collection")}</span>`}<span class="tree-title">${esc(c.title)}</span>${count ? `<span class="tree-count">${count}</span>` : ""}</button>
        </div>
        ${kids.length ? `<div class="tree-children" role="group" ${open ? "" : "hidden"}>${treeHtml(c.id, depth + 1)}</div>` : ""}
      </div>`;
    })
    .join("");
}
VIEWS.collection = async function renderCollections({ token, soft }) {
  const collections = byKind("collection");
  if (state.collectionId && !find(state.collectionId))
    state.collectionId = null;
  if (!state.collectionId && collections.length)
    state.collectionId = collectionChildren(null)[0]?.id || collections[0].id;
  const path = state.collectionId ? collectionPath(state.collectionId) : [];
  const trail = [
    { label: t("Collections"), act: "goto-collections" },
    ...path.map((c) => ({
      label: c.title,
      act: "select-collection",
      id: c.id,
    })),
  ];
  if (state.collectionNoteId) {
    const note =
      find(state.collectionNoteId) || sessions.get(state.collectionNoteId)?.r;
    trail.push({ label: note ? displayTitle(note) : t("Note") });
  } else if (trail.length > 1)
    trail[trail.length - 1] = { label: trail[trail.length - 1].label };
  crumbs(trail.length > 1 ? trail : [{ label: t("Collections") }]);
  if (soft && $("#tree") && !state.collectionNoteId && $("#collection-notes")) {
    $("#tree").innerHTML = treeHtml();
    const current = find(state.collectionId);
    if (current)
      await morph($("#collection-notes"), collectionNotesHtml(current), {
        enter: true,
      });
    return;
  }
  $("#view").innerHTML = `<div class="split collections-split">
    <aside class="pane tree-pane" aria-label="${esc(t("Collections"))}">
      <header class="pane-head"><h2>${esc(t("Collections"))}</h2>${readOnly() ? "" : `<button type="button" class="icon-btn accent" data-act="new-collection" aria-label="${esc(t("New collection"))}" title="${esc(t("New collection"))}">${icon("plus")}</button>`}</header>
      <div class="tree" role="tree" id="tree">${treeHtml() || `<div class="pane-empty"><p>${esc(t("No collections yet."))}</p></div>`}</div>
    </aside>
    <section class="pane detail-pane" id="collection-detail"></section>
  </div>`;
  const detail = $("#collection-detail");
  if (state.collectionNoteId) {
    const c = find(state.collectionId);
    await mountNoteEditor(detail, state.collectionNoteId, {
      act: "back-to-collection",
      label: c ? c.title : t("Collections"),
    });
    return;
  }
  if (!state.collectionId) {
    detail.innerHTML = emptyState(
      "collection",
      t("Organize what you know"),
      t(
        "Collections gather related notes. A note can live in several at once, and collections can nest.",
      ),
      readOnly()
        ? ""
        : `<button type="button" class="btn primary" data-act="new-collection">${icon("plus")}${esc(t("New collection"))}</button>`,
    );
    return;
  }
  const s = await openSession(state.collectionId);
  if (token !== renderToken) return;
  detail.innerHTML = collectionDetailHtml(s.r);
  $$("textarea.autosize", detail).forEach(autosize);
};
function collectionNotesHtml(c) {
  const notes = byKind("note").filter((n) => n.collections.includes(c.id));
  return (
    notes.map((n) => noteRow(n, { removable: !readOnly() })).join("") ||
    `<div class="calm"><p>${esc(t("No notes here yet."))}</p></div>`
  );
}
function collectionDetailHtml(c) {
  const ro = readOnly();
  const kids = collectionChildren(c.id);
  return `<div class="collection" data-session="${esc(c.id)}">
    <header class="collection-head">
      <div class="collection-title-row"><textarea class="collection-title autosize" data-edit="title" rows="1" maxlength="200" aria-label="${esc(t("Collection name"))}" ${ro ? "readonly" : ""}>${esc(c.title)}</textarea><div class="head-tools">${statusSlot(c.id)}<button type="button" class="icon-btn" data-act="toggle-details" data-id="${esc(c.id)}" aria-pressed="false" aria-label="${esc(t("Details"))}" title="${esc(t("Details"))}">${icon("info")}</button><button type="button" class="icon-btn" data-act="collection-menu" aria-haspopup="menu" aria-label="${esc(t("More actions"))}">${icon("more")}</button></div></div>
      <textarea class="collection-desc autosize" data-edit="content" rows="1" maxlength="40000" placeholder="${esc(t("What belongs here?"))}" aria-label="${esc(t("Collection description"))}" ${ro ? "readonly" : ""}>${esc(c.content)}</textarea>
      ${ro ? "" : `<div class="collection-actions"><button type="button" class="btn primary" data-act="collection-new-note">${icon("plus")}${esc(t("New note here"))}</button><button type="button" class="btn" data-act="collection-add-notes">${esc(t("Add existing notes"))}</button></div>`}
    </header>
    ${kids.length ? `<section class="sub-collections"><h3 class="section-label">${esc(t("Inside"))}</h3><div class="sub-grid">${kids.map((k) => `<button type="button" class="sub-collection" data-act="select-collection" data-id="${esc(k.id)}">${icon("collection")}<span>${esc(k.title)}</span><span class="tree-count">${byKind("note").filter((n) => n.collections.includes(k.id)).length}</span></button>`).join("")}</div></section>` : ""}
    <section class="collection-notes-section"><h3 class="section-label">${esc(t("Notes"))}</h3><div class="note-list flat" role="list" id="collection-notes">${collectionNotesHtml(c)}</div></section>
  </div>`;
}

/* ───────────────────────── Search ───────────────────────── */

function highlight(text, query) {
  if (!query) return esc(text);
  const lower = text.toLowerCase(),
    q = query.toLowerCase();
  let out = "",
    index = 0,
    at;
  while ((at = lower.indexOf(q, index)) !== -1) {
    out +=
      esc(text.slice(index, at)) +
      "<mark>" +
      esc(text.slice(at, at + q.length)) +
      "</mark>";
    index = at + q.length;
  }
  return out + esc(text.slice(index));
}
function snippetAround(text, query) {
  const plain = plainText(text);
  const at = plain.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return plain.slice(0, 140);
  const start = Math.max(0, at - 50);
  return (
    (start ? "…" : "") +
    plain.slice(start, start + 160) +
    (start + 160 < plain.length ? "…" : "")
  );
}
VIEWS.search = async function renderSearch({ token }) {
  const q = state.query;
  crumbs([{ label: t("Search") }]);
  const rows = await api(wp("/resources?q=" + encodeURIComponent(q)));
  if (token !== renderToken) return;
  const order = ["note", "task", "project", "collection"];
  const label = {
    note: t("Notes"),
    task: t("Tasks"),
    project: t("Projects"),
    collection: t("Collections"),
  };
  const groups = order
    .map((kind) => [kind, rows.filter((r) => r.kind === kind)])
    .filter(([, list]) => list.length);
  $("#view").innerHTML = `<div class="page search-page">
    <header class="search-head"><h2>${esc(t("Results for “{query}”", { query: q }))}</h2><p class="calm-text">${esc(plural(rows.length, "{count} match in {workspace}", "{count} matches in {workspace}", { workspace: ws().title }))}</p></header>
    ${groups.length ? groups.map(([kind, list]) => `<section class="group"><div class="group-head"><span>${esc(label[kind])}</span><span class="group-count">${list.length}</span></div><div class="result-list" role="list">${list.map((r) => `<button type="button" class="result" role="listitem" data-act="open-result" data-id="${esc(r.id)}">${resourceGlyph(r)}<span class="result-main"><span class="result-title">${highlight(displayTitle(r), q)}</span>${r.content ? `<span class="result-snippet">${highlight(snippetAround(r.content, q), q)}</span>` : ""}${r.tags.length ? `<span class="result-tags">${r.tags.map((tag) => `<span class="chip">${icon("tag")}${highlight(tag, q)}</span>`).join("")}</span>` : ""}</span>${r.kind === "task" && r.status !== "open" ? `<span class="chip muted">${esc(r.status === "completed" ? t("Completed") : t("Cancelled"))}</span>` : ""}</button>`).join("")}</div></section>`).join("") : emptyState("search", t("No matches"), t("Search looks through titles, text and tags in this Workspace. Trash isn't searched."))}
  </div>`;
};
let searchTimer = null;
function onSearchInput(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(
    () =>
      run(async () => {
        const q = value.trim();
        if (!q) {
          if (state.view === "search") await go(state.returnView || "home");
          return;
        }
        if (state.view !== "search") {
          if (!(await flushAll())) return;
          state.returnView = state.view;
          closeDrawer();
        }
        state.query = q;
        state.view = "search";
        await renderView({ soft: $(".search-page") !== null });
      }),
    220,
  );
}

/* ───────────────────────── Trash ───────────────────────── */

let trashCache = { rows: [], days: 30 };
function retentionLabel(days) {
  return days === null
    ? t("Never")
    : plural(days, "{count} day", "{count} days");
}
function trashRow(r, days) {
  const selected = state.trashSelection.has(r.id);
  const deleted = new Date(r.trashed_at).getTime();
  const left =
    days === null
      ? null
      : Math.max(
          0,
          Math.ceil((deleted + days * 86400000 - Date.now()) / 86400000),
        );
  const leftText =
    left === null
      ? ""
      : left === 0
        ? t("deleted within a minute")
        : plural(left, "{count} day left", "{count} days left");
  return `<div class="trash-row${selected ? " is-selected" : ""}" data-row="${esc(r.id)}" role="listitem">
    <label class="select-box"><input type="checkbox" data-trash-select="${esc(r.id)}" ${selected ? "checked" : ""} aria-label="${esc(t("Select {title}", { title: displayTitle(r) }))}"><span class="box">${icon("check")}</span></label>
    ${resourceGlyph(r)}
    <span class="trash-main"><span class="trash-title">${esc(displayTitle(r))}</span><span class="trash-meta"><span title="${esc(absoluteTime(r.trashed_at))}">${esc(t("{kind} · Deleted {time}", { kind: KIND_LABEL()[r.kind], time: relativeTime(r.trashed_at) }))}</span>${leftText ? `<span class="${left <= 3 ? "warn" : ""}"> · ${esc(leftText)}</span>` : ""}</span></span>
    <span class="trash-actions"><button type="button" class="btn small" data-act="restore" data-id="${esc(r.id)}" ${readOnly() ? "disabled" : ""}>${icon("undo")}${esc(t("Restore"))}</button><button type="button" class="icon-btn" data-act="trash-row-menu" data-id="${esc(r.id)}" aria-haspopup="menu" aria-label="${esc(t("More actions for {title}", { title: displayTitle(r) }))}" ${readOnly() ? "disabled" : ""}>${icon("more")}</button></span>
  </div>`;
}
VIEWS.trash = async function renderTrash({ token, soft }) {
  crumbs([{ label: t("Trash") }]);
  const [rows, policy] = await Promise.all([
    api(wp("/resources?view=trash")),
    api(wp("/trash/policy")),
  ]);
  if (token !== renderToken) return;
  rows.sort((a, b) => (b.trashed_at || "").localeCompare(a.trashed_at || ""));
  trashCache = { rows, days: policy.days };
  for (const id of [...state.trashSelection])
    if (!rows.some((r) => r.id === id)) state.trashSelection.delete(id);
  const list = rows.length
    ? rows.map((r) => trashRow(r, policy.days)).join("")
    : emptyState(
        "trash",
        t("Trash is empty"),
        policy.days === null
          ? t("Deleted items stay here until you remove them.")
          : t(
              "Deleted items stay here for {days} before they're gone for good.",
              { days: retentionLabel(policy.days) },
            ),
      );
  if (soft && $("#trash-list")) {
    await morph($("#trash-list"), list, { enter: false });
    updateTrashChrome();
    return;
  }
  $("#view").innerHTML = `<div class="page trash">
    <header class="page-bar trash-bar"><p class="policy">${icon("clock")}<span id="policy-text">${esc(policy.days === null ? t("Items stay in Trash until you delete them.") : t("Items are deleted permanently {days} after they're moved here.", { days: retentionLabel(policy.days) }))}</span>${readOnly() ? "" : `<button type="button" class="link" data-act="retention" aria-haspopup="menu">${esc(t("Change"))}</button>`}</p><button type="button" class="btn quiet danger-text" data-act="empty-trash" id="empty-trash" ${!rows.length || readOnly() ? "disabled" : ""}>${esc(t("Empty Trash…"))}</button></header>
    <div class="selection-bar" id="selection-bar" hidden></div>
    <div class="trash-list" role="list" id="trash-list">${list}</div>
  </div>`;
  updateTrashChrome();
};
function updateTrashChrome() {
  const bar = $("#selection-bar");
  if (!bar) return;
  const count = state.trashSelection.size;
  $("#empty-trash") &&
    ($("#empty-trash").disabled = !trashCache.rows.length || readOnly());
  if (!count) {
    if (!bar.hidden) {
      bar.classList.remove("show");
      setTimeout(() => {
        if (!state.trashSelection.size) bar.hidden = true;
      }, 160);
    }
    return;
  }
  const all = count === trashCache.rows.length;
  bar.innerHTML = `<label class="select-box"><input type="checkbox" id="select-all" ${all ? "checked" : ""} aria-label="${esc(t("Select all"))}"><span class="box">${icon(all ? "check" : "minus")}</span></label><span class="selection-count">${esc(plural(count, "{count} selected", "{count} selected"))}</span><button type="button" class="btn small" data-act="restore-selected" ${readOnly() ? "disabled" : ""}>${icon("undo")}${esc(t("Restore"))}</button><button type="button" class="btn small quiet danger-text" data-act="delete-selected" ${readOnly() ? "disabled" : ""}>${esc(t("Delete permanently…"))}</button><button type="button" class="link" data-act="clear-selection">${esc(t("Clear"))}</button>`;
  if (bar.hidden) {
    bar.hidden = false;
    raf(() => bar.classList.add("show"));
  }
  $("#select-all").indeterminate = !all;
}
async function trashAction(action, ids) {
  const titles = trashCache.rows
    .filter((r) => ids.includes(r.id))
    .map((r) => displayTitle(r));
  if (action !== "restore") {
    const count = action === "empty" ? trashCache.rows.length : ids.length;
    const title =
      action === "empty"
        ? t("Empty Trash?")
        : plural(
            count,
            "Delete {count} item permanently?",
            "Delete {count} items permanently?",
          );
    const message =
      (count === 1 && titles[0] && action !== "empty"
        ? t("“{title}” will be deleted permanently. This can't be undone.", {
            title: titles[0],
          })
        : plural(
            count,
            "{count} item will be deleted permanently. This can't be undone.",
            "{count} items will be deleted permanently. This can't be undone.",
          )) +
      " " +
      t(
        "Tasks, notes and collections that were organized under them are kept, and links to them show as deleted.",
      );
    const choice = await confirmDestructive(
      title,
      message,
      plural(count, "Delete {count} item", "Delete {count} items"),
    );
    if (!choice) return;
  }
  await api(wp("/trash"), "POST", {
    action,
    ids: action === "empty" ? [] : ids,
    confirmed: action !== "restore",
  });
  for (const id of action === "empty" ? [...state.trashSelection] : ids)
    state.trashSelection.delete(id);
  if (action === "empty") state.trashSelection.clear();
  if (action === "restore") {
    await loadResources();
    await softRender();
    toast(
      ids.length === 1
        ? t("Restored “{title}”", { title: titles[0] })
        : plural(ids.length, "Restored {count} item", "Restored {count} items"),
      ids.length === 1
        ? { action: t("Open"), onAction: () => openResource(ids[0]) }
        : {},
    );
  } else {
    await softRender();
    toast(
      action === "empty"
        ? t("Trash emptied")
        : plural(
            ids.length,
            "Deleted {count} item permanently",
            "Deleted {count} items permanently",
          ),
    );
  }
}
function retentionMenu(anchor) {
  const current = trashCache.days;
  menu(
    anchor,
    [
      { heading: true, label: t("Delete items automatically after") },
      ...RETENTION.map((days) => ({
        label: retentionLabel(days),
        value: days,
        checked: days === current,
      })),
    ],
    async (item) => {
      const days = item.value;
      if (days === current) return;
      if (days !== null && (current === null || days < current)) {
        const expiring = trashCache.rows.filter(
          (r) =>
            new Date(r.trashed_at).getTime() + days * 86400000 <= Date.now(),
        ).length;
        if (expiring) {
          const choice = await confirmDestructive(
            t("Shorten retention?"),
            plural(
              expiring,
              "{count} item has already been in Trash longer than {days}. It will be deleted permanently within a minute.",
              "{count} items have already been in Trash longer than {days}. They will be deleted permanently within a minute.",
              { days: retentionLabel(days) },
            ),
            t("Change to {days}", { days: retentionLabel(days) }),
          );
          if (!choice) return;
        }
      }
      await api(wp("/trash/policy"), "PUT", { days });
      await renderView({ soft: false });
      toast(
        days === null
          ? t("Automatic deletion is off")
          : t("Trash now keeps items for {days}", {
              days: retentionLabel(days),
            }),
      );
    },
    { align: "start" },
  );
}

/* ───────────────────────── Workspaces ───────────────────────── */

function timezoneList() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}
VIEWS.workspaces = async function renderWorkspaces() {
  crumbs([{ label: t("Workspaces") }]);
  state.workspaces = await api("/api/workspaces");
  $("#view").innerHTML = `<div class="page workspaces">
    <header class="page-bar"><p class="page-intro">${esc(t("Each Workspace keeps its own notes, tasks and projects apart. Search and lists only ever show the active one."))}</p><button type="button" class="btn primary" data-act="new-workspace">${icon("plus")}${esc(t("New Workspace"))}</button></header>
    <datalist id="zones">${timezoneList()
      .map((z) => `<option value="${esc(z)}">`)
      .join("")}</datalist>
    <div class="ws-list" role="list">${state.workspaces
      .map(
        (
          w,
        ) => `<div class="ws-row${w.archived ? " archived" : ""}" role="listitem" data-ws-row="${esc(w.id)}">
      ${avatar(w.title)}
      <label class="ws-field grow"><span>${esc(t("Name"))}</span><input data-ws-field="title" data-ws="${esc(w.id)}" value="${esc(w.title)}" maxlength="100"></label>
      <label class="ws-field"><span>${esc(t("Time zone"))}</span><input data-ws-field="timezone" data-ws="${esc(w.id)}" value="${esc(w.timezone)}" list="zones" autocomplete="off"></label>
      <div class="ws-actions">${w.id === state.wid ? `<span class="badge accent">${esc(t("Current"))}</span>` : `<button type="button" class="btn small" data-act="switch-workspace" data-id="${esc(w.id)}">${esc(t("Open"))}</button>`}<button type="button" class="btn small quiet" data-act="toggle-archive" data-id="${esc(w.id)}">${icon(w.archived ? "undo" : "archive")}${esc(w.archived ? t("Restore") : t("Archive"))}</button></div>
    </div>`,
      )
      .join("")}</div>
  </div>`;
};
async function saveWorkspace(id, patch) {
  const w = state.workspaces.find((x) => x.id === id);
  const next = {
    title: w.title,
    timezone: w.timezone,
    archived: !!w.archived,
    ...patch,
  };
  await api("/api/workspaces/" + id, "PUT", next);
  Object.assign(w, next, { archived: next.archived ? 1 : 0 });
  updateShell();
}
async function newWorkspace() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const result = await dialog({
    title: t("New Workspace"),
    body: `<label class="field"><span>${esc(t("Name"))}</span><input name="title" maxlength="100" placeholder="${esc(t("Personal, Work, Studies…"))}" autocomplete="off"></label><label class="field"><span>${esc(t("Time zone"))}</span><input name="timezone" value="${esc(zone)}" list="zones-dialog" autocomplete="off"></label><datalist id="zones-dialog">${timezoneList()
      .map((z) => `<option value="${esc(z)}">`)
      .join(
        "",
      )}</datalist><p class="d-hint">${esc(t("The time zone decides what “today” means for tasks and daily notes."))}</p>`,
    actions: [
      { label: t("Cancel"), value: "cancel", kind: "quiet" },
      {
        label: t("Create Workspace"),
        value: "ok",
        kind: "primary",
        primary: true,
      },
    ],
    collect: (d) => ({
      title: $("input[name=title]", d).value.trim(),
      timezone: $("input[name=timezone]", d).value.trim(),
    }),
    validate: (_, data) => (data.title ? null : t("Enter a name.")),
  });
  if (!result) return;
  const created = await api("/api/workspaces", "POST", {
    ...result.data,
    archived: false,
  });
  state.workspaces = await api("/api/workspaces");
  await switchWorkspace(created.id);
}
async function switchWorkspace(id) {
  if (!(await flushAll())) return;
  closeDrawer({ flush: false });
  sessions.clear();
  state.wid = id;
  api(`/api/workspaces/${id}/open`, "POST").catch(() => {});
  Object.assign(state, {
    view: "home",
    noteId: null,
    projectId: null,
    collectionId: null,
    collectionNoteId: null,
    query: "",
    draft: {},
    trashSelection: new Set(),
  });
  if (!$("#shell")) renderShell();
  await loadResources();
  updateShell();
  await renderView({});
  const name = $(".ws-name");
  animate(
    name,
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 220 },
  );
}
function workspaceMenu(anchor) {
  const active = state.workspaces.filter((w) => !w.archived);
  const archived = state.workspaces.filter((w) => w.archived);
  menu(
    anchor,
    [
      ...active.map((w) => ({
        label: w.title,
        value: w.id,
        checked: w.id === state.wid,
        html: avatar(w.title),
      })),
      ...(archived.length
        ? [
            { heading: true, label: t("Archived") },
            ...archived.map((w) => ({
              label: w.title,
              value: w.id,
              checked: w.id === state.wid,
              html: avatar(w.title),
            })),
          ]
        : []),
      { divider: true },
      { label: t("New Workspace…"), value: "__new", icon: "plus" },
      { label: t("Manage Workspaces"), value: "__manage", icon: "apps" },
    ],
    async (item) => {
      if (item.value === "__new") return newWorkspace();
      if (item.value === "__manage") return go("workspaces");
      if (item.value !== state.wid) return switchWorkspace(item.value);
    },
    { className: "ws-menu" },
  );
}
function welcome() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  $("#app").innerHTML = `<div class="welcome">
    <div class="welcome-mark">${MARK}</div>
    <div class="display poster">MNEMOSYNE</div>
    <p class="welcome-lede">${esc(t("Notes, tasks and projects in one calm place — kept apart by Workspace, so work stays work and life stays life."))}</p>
    <div class="welcome-form">
      <label class="field"><span>${esc(t("Name your first Workspace"))}</span><input id="welcome-title" maxlength="100" placeholder="${esc(t("Personal"))}" autocomplete="off"></label>
      <label class="field"><span>${esc(t("Time zone"))}</span><input id="welcome-zone" value="${esc(zone)}" list="welcome-zones" autocomplete="off"></label>
      <datalist id="welcome-zones">${timezoneList()
        .map((z) => `<option value="${esc(z)}">`)
        .join("")}</datalist>
      <button type="button" class="btn primary large" data-act="welcome-create">${esc(t("Create Workspace"))}${icon("arrowRight")}</button>
    </div>
  </div>`;
  $("#welcome-title").focus();
}

/* ───────────────────────── Sync status ───────────────────────── */

let syncMisses = 0,
  syncTimer = null;
async function checkSync() {
  if (!state.wid) return;
  try {
    const { pending: count } = await api("/api/sync");
    syncMisses = count ? syncMisses + 1 : 0;
    const slot = $("#sync-slot");
    if (!slot) return;
    slot.innerHTML =
      syncMisses >= 2
        ? `<button type="button" class="sync-note" data-act="sync-retry" title="${esc(t("Links and activity are waiting to reach Nexus. Your work is saved here."))}">${icon("refresh")}<span>${esc(plural(count, "{count} change waiting for Nexus", "{count} changes waiting for Nexus"))}</span></button>`
        : "";
  } catch {
    /* Sync state is informational; the app keeps working locally. */
  }
}

/* ───────────────────────── Editing helpers ───────────────────────── */

function currentEditorSession() {
  const host = $("#view [data-session]");
  return host ? sessions.get(host.dataset.session) : null;
}
function insertMarkdown(before, after = "") {
  const area = $("#markdown");
  if (!area || area.readOnly) return;
  if (state.preview) setPreview(false);
  const start = area.selectionStart,
    end = area.selectionEnd;
  area.setRangeText(
    before + area.value.slice(start, end) + after,
    start,
    end,
    "end",
  );
  if (!after && start === end)
    area.selectionStart = area.selectionEnd = start + before.length;
  area.focus();
  area.dispatchEvent(new Event("input", { bubbles: true }));
}
async function setPreview(on) {
  const s = currentEditorSession();
  state.preview = on;
  const editor = $(".note-editor");
  if (!editor || !s) return;
  editor.classList.toggle("previewing", on);
  $("#markdown").hidden = on;
  $("#preview").hidden = !on;
  $$(".note-editor .seg-btn").forEach((b) => {
    const isPreview = b.dataset.act === "preview-mode";
    b.classList.toggle("on", isPreview === on);
    b.setAttribute("aria-checked", String(isPreview === on));
  });
  if (on) {
    await renderPreview(s);
    enterView($("#preview"));
  } else {
    autosize($("#markdown"));
    $("#markdown").focus();
  }
}
async function uploadAttachment(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 1048576) throw Error(t("Files can be up to 1 MiB."));
  const s = sessions.get(input.dataset.attach);
  if (!s) return;
  if (s.dirty) await saveSession(s);
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  await api(wp("/resources/" + s.r.id + "/attachments"), "POST", {
    name: file.name,
    media_type: file.type || "application/octet-stream",
    content,
  });
  await reloadSession(s);
  renderDrawer();
  $$("#drawer details.more").forEach((d) => (d.open = true));
  toast(t("Attached “{name}”", { name: file.name }));
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
function drawerSession() {
  return state.drawer ? sessions.get(state.drawer.id) : null;
}
function activeSessionFor(el) {
  const host = el.closest("[data-session]");
  return host ? sessions.get(host.dataset.session) : drawerSession();
}

/* ───────────────────────── Actions (event delegation) ───────────────────────── */

const actions = {
  "workspace-menu": (el) => workspaceMenu(el),
  "apps-menu": (el) =>
    menu(
      el,
      [
        { label: t("Nexus control center"), value: "nexus", icon: "home" },
        ...state.context.applications
          .filter((a) => a.id !== "mnemosyne")
          .map((a) => ({ label: a.name, value: a.id, icon: "apps" })),
      ],
      async (item) => {
        if (!(await flushAll())) return;
        await bridge("navigate", { module: item.value });
      },
    ),
  "more-menu": (el) =>
    menu(
      el,
      [
        { label: t("Manage Workspaces"), value: "workspaces", icon: "apps" },
        {
          label: t("Export this Workspace"),
          value: "export",
          icon: "download",
        },
        { label: t("Sync with Nexus now"), value: "sync", icon: "refresh" },
      ],
      async (item) => {
        if (item.value === "workspaces") return go("workspaces");
        if (item.value === "export") {
          const data = await api(wp("/export"));
          download(
            "mnemosyne-" + ws().title + ".json",
            JSON.stringify(data, null, 2),
            "application/json",
          );
          toast(t("Exported “{name}”", { name: ws().title }));
        }
        if (item.value === "sync") return actions["sync-retry"]();
      },
    ),
  "sync-retry": async () => {
    const result = await api("/api/sync", "POST");
    syncMisses = result.pending ? 2 : 0;
    await checkSync();
    toast(
      result.pending
        ? plural(
            result.pending,
            "{count} change is still waiting for Nexus",
            "{count} changes are still waiting for Nexus",
          )
        : t("Everything is synced with Nexus"),
    );
  },
  "open-daily": () => openDaily(),
  "unarchive-workspace": async () => {
    await saveWorkspace(state.wid, { archived: false });
    await renderView({});
    toast(t("Workspace restored"));
  },
  open: (el) => el.dataset.id && openResource(el.dataset.id),
  "open-result": (el) => openResource(el.dataset.id),
  noop: () => {},
  "goto-notes": () => go("note"),
  "goto-projects": () =>
    go("project", { set: { projectId: null }, direction: -1 }),
  "goto-collections": () =>
    go("collection", { set: { collectionNoteId: null } }),
  "goto-tasks": (el) =>
    go("task", { set: { taskView: el.dataset.taskView || "today" } }),
  "back-to-collection": () =>
    go("collection", { set: { collectionNoteId: null }, direction: -1 }),
  "back-to-project": (el) =>
    go("project", { set: { projectId: el.dataset.id }, direction: -1 }),

  "toggle-task": (el) => toggleTask(el.dataset.id),
  "undo-complete": (el) => undoComplete(el.dataset.id),
  "task-menu": (el) => taskMenu(el, el.dataset.id, { from: el.dataset.from }),
  "card-menu": (el) => {
    const id = el.dataset.id;
    const r = find(id);
    menu(
      el,
      [
        { label: t("Open"), value: "open", icon: "arrowRight" },
        { heading: true, label: t("Move to") },
        ...COLUMNS.map((c) => ({
          label: t(c),
          value: "col:" + c,
          checked: r?.board_column === c,
          disabled: readOnly(),
        })),
        { divider: true },
        {
          label: t("Move to Trash"),
          value: "trash",
          icon: "trash",
          danger: true,
          disabled: readOnly(),
        },
      ],
      async (item) => {
        if (item.value === "open") return openTask(id, { focus: true });
        if (item.value.startsWith("col:"))
          return moveCard(id, item.value.slice(4));
        if (item.value === "trash") return trashAndReport(id, softRender);
      },
      { align: "end" },
    );
  },
  "reopen-task": async (el) => {
    await mutate(el.dataset.id, { status: "open" });
    renderDrawer();
    await softRender();
  },
  "close-drawer": () => closeDrawer(),
  "add-property": (el) => {
    const s = drawerSession();
    if (!s) return;
    const r = s.r;
    const options = [
      !r.due_date && {
        label: t("Deadline"),
        value: "due_date",
        icon: "calendar",
      },
      !r.start_date && {
        label: t("Start date"),
        value: "start_date",
        icon: "play",
      },
      r.priority === "none" && {
        label: t("Priority"),
        value: "priority",
        icon: "flag",
      },
      !r.project && { label: t("Project"), value: "project", icon: "project" },
      { label: t("Tags"), value: "tags", icon: "tag" },
      !r.related_note && {
        label: t("Related note"),
        value: "related_note",
        icon: "note",
      },
    ].filter(Boolean);
    menu(el, options, (item) => editProperty(el, s, item.value));
  },
  prop: (el) => {
    const s = activeSessionFor(el);
    if (s) editProperty(el, s, el.dataset.prop);
  },
  "toggle-step": (el) => {
    const s = drawerSession();
    const item = s.r.checklist[+el.dataset.index];
    item.done = !item.done;
    edit(s, { checklist: s.r.checklist }, 200);
    renderChecklist(s);
    patchRows(s.r.id);
    animate(
      $(`[data-index="${el.dataset.index}"].check`),
      [
        { transform: "scale(.8)" },
        { transform: "scale(1.1)" },
        { transform: "scale(1)" },
      ],
      { duration: 260, easing: EASE_SPRING },
    );
  },
  "remove-step": (el) => {
    const s = drawerSession();
    s.r.checklist.splice(+el.dataset.index, 1);
    edit(s, { checklist: s.r.checklist }, 200);
    renderChecklist(s);
  },

  "capture-kind": (el) => {
    state.captureKind = el.dataset.kind;
    const capture = $("#capture");
    capture.dataset.kind = state.captureKind;
    $$(".seg-btn", capture).forEach((b) => {
      const on = b.dataset.kind === state.captureKind;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
    $("#capture-chips").hidden = state.captureKind !== "task";
    $("#capture-input").placeholder =
      state.captureKind === "task"
        ? t("What needs doing?")
        : t("Title of a new note");
    $("#capture-input").focus();
  },
  "draft-date": (el) =>
    datePicker(el, state.draft.due_date, (value) => {
      state.draft.due_date = value;
      redrawDraft();
      ($("#quick-add-input") || $("#capture-input"))?.focus();
    }),
  "draft-priority": (el) =>
    priorityPicker(el, state.draft.priority || "none", (value) => {
      state.draft.priority = value;
      redrawDraft();
      ($("#quick-add-input") || $("#capture-input"))?.focus();
    }),
  "draft-project": (el) =>
    resourcePicker(
      el,
      "project",
      state.draft.project,
      (value) => {
        state.draft.project = value;
        redrawDraft();
        ($("#quick-add-input") || $("#capture-input"))?.focus();
      },
      { noneLabel: t("No project") },
    ),

  "new-note": async () => {
    const r = await createNote();
    if (!r) return;
    await go("note", {
      set: { noteId: r.id, noteContext: null, preview: false },
      reload: false,
    });
    $("#markdown")?.focus();
  },
  "write-mode": () => setPreview(false),
  "preview-mode": () => setPreview(true),
  format: (el) => insertMarkdown(el.dataset.before, el.dataset.after),
  "insert-table": () =>
    insertMarkdown(
      `| ${t("Column")} | ${t("Column")} |\n| --- | --- |\n| | |\n`,
    ),
  "insert-note-link": (el) => {
    const s = currentEditorSession();
    resourcePicker(
      el,
      "note",
      null,
      (id) => {
        const note = id && find(id);
        if (note)
          insertMarkdown(
            `[${displayTitle(note).replace(/[[\]]/g, "")}](${note.reference})`,
          );
      },
      { exclude: [s?.r.id], noneLabel: t("Cancel") },
    );
  },
  "toggle-details": (el) => {
    const id = el.dataset.id;
    if (state.drawer?.mode === "details" && state.drawer.id === id)
      return closeDrawer();
    return openDetails(id);
  },
  "note-menu": (el) => {
    const s = sessions.get(el.dataset.id);
    if (!s) return;
    const r = s.r;
    menu(
      el,
      [
        {
          label: r.pinned ? t("Unpin") : t("Pin to top"),
          value: "pin",
          icon: "pin",
          disabled: readOnly() || r.trashed,
        },
        { label: t("Details"), value: "details", icon: "info" },
        { divider: true },
        {
          label: t("Move to Trash"),
          value: "trash",
          icon: "trash",
          danger: true,
          disabled: readOnly() || r.trashed,
        },
      ],
      async (item) => {
        if (item.value === "pin") {
          edit(s, { pinned: !r.pinned }, 0);
          toast(r.pinned ? t("Pinned to the top") : t("Unpinned"));
          return;
        }
        if (item.value === "details") return openDetails(r.id);
        if (item.value === "trash") {
          const inCollection = state.view === "collection";
          return trashAndReport(r.id, async () => {
            if (inCollection) {
              state.collectionNoteId = null;
            } else state.noteId = null;
            await go(state.view, { reload: false });
          });
        }
      },
      { align: "end" },
    );
  },
  "note-add-meta": (el) => {
    const s = activeSessionFor(el);
    if (!s) return;
    menu(
      el,
      [
        {
          label: t("Add to a collection…"),
          value: "collection",
          icon: "collection",
        },
        { label: t("Set a project…"), value: "project", icon: "project" },
        { label: t("Tags…"), value: "tags", icon: "tag" },
      ],
      (item) => {
        if (item.value === "tags") return editProperty(el, s, "tags");
        if (item.value === "project") return editProperty(el, s, "project");
        const items = byKind("collection").map((c) => ({
          label: collectionPath(c.id)
            .map((x) => x.title)
            .join(" / "),
          value: c.id,
          checked: s.r.collections.includes(c.id),
          icon: "collection",
        }));
        if (!items.length)
          return toast(t("Create a collection first — in Collections."));
        menu(
          el,
          items,
          (picked) => {
            const set = new Set(s.r.collections);
            picked.checked ? set.add(picked.value) : set.delete(picked.value);
            edit(s, { collections: [...set] }, 0);
            const chips = $(`[data-session="${cssq(s.r.id)}"] .meta-chips`);
            if (chips) chips.innerHTML = noteChips(s.r);
          },
          {
            multi: true,
            filter: items.length > 6,
            placeholder: t("Find a collection"),
          },
        );
      },
    );
  },
  "note-tags": (el) => {
    const s = activeSessionFor(el);
    if (s) editProperty(el, s, "tags");
  },
  "note-remove-collection": (el) => {
    const s = activeSessionFor(el);
    edit(
      s,
      { collections: s.r.collections.filter((c) => c !== el.dataset.id) },
      0,
    );
    refreshProps(s);
  },
  "note-clear-project": (el) => {
    const s = activeSessionFor(el);
    edit(s, { project: null }, 0);
    refreshProps(s);
  },
  "restore-open": async (el) => {
    await api(wp("/trash"), "POST", {
      action: "restore",
      ids: [el.dataset.id],
    });
    sessions.delete(el.dataset.id);
    await loadResources();
    await renderView({});
    toast(t("Restored"));
  },

  "set-accent": (el) => {
    const s = activeSessionFor(el);
    if (!s) return;
    edit(s, { accent: el.dataset.color }, 0);
    $$(".swatch", el.closest(".swatches")).forEach((b) => {
      const on = b === el;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
  },
  "add-link": async (el) => {
    const s = activeSessionFor(el);
    const target = $("#link-target").value.trim();
    if (!target)
      throw Error(t("Enter a reference such as nexus:v1:module:type:id."));
    const readers = $("#link-readers")
      .value.split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (s.dirty) await saveSession(s);
    await api(wp("/resources/" + s.r.id + "/links"), "POST", {
      target,
      readers,
    });
    await reloadSession(s);
    renderDrawer();
    $$("#drawer details.more").forEach((d) => (d.open = true));
    toast(t("Link added"));
  },
  unlink: async (el) => {
    const s = activeSessionFor(el);
    if (s.dirty) await saveSession(s);
    await api(wp("/resources/" + s.r.id + "/links/" + el.dataset.id), "DELETE");
    await reloadSession(s);
    renderDrawer();
    $$("#drawer details.more").forEach((d) => (d.open = true));
  },
  "resolve-link": async (el) => {
    const target = el.dataset.target;
    const local = target.match(/^nexus:v1:mnemosyne:[a-z-]+:(.+)$/);
    if (local && find(local[1])) return openResource(local[1]);
    const result = await api(wp("/resolve"), "POST", { target });
    const labels = {
      available: t("Available"),
      deleted: t("Deleted"),
      unavailable_or_not_granted: t("Unavailable"),
      module_uninstalled: t("Module not installed"),
      module_disabled: t("Module disabled"),
      temporarily_unavailable: t("Temporarily unavailable"),
      forbidden: t("Not shared with Mnemosyne"),
      not_found: t("Not found"),
    };
    const meta =
      el.querySelector(".resolve-state") ||
      el.appendChild(
        Object.assign(document.createElement("span"), {
          className: "d-row-meta resolve-state",
        }),
      );
    meta.textContent =
      (result.label ? result.label + " · " : "") +
      (labels[result.availability] || result.availability);
  },
  "nexus-backlinks": async (el) => {
    const s = activeSessionFor(el);
    const data = await api(wp("/resources/" + s.r.id + "/references"));
    const holder = el.parentElement.querySelector(".nexus-backlinks");
    holder.innerHTML = data.references.length
      ? data.references
          .map((e) => {
            const local = e.source.match(/^nexus:v1:mnemosyne:[a-z-]+:(.+)$/);
            const r = local && find(local[1]);
            return r
              ? `<button type="button" class="d-row as-button" data-act="open" data-id="${esc(r.id)}">${icon(KIND_ICON[r.kind])}<span class="d-row-main"><span class="d-row-title">${esc(displayTitle(r))}</span></span></button>`
              : `<div class="d-row">${icon("link")}<span class="d-row-main"><span class="d-row-title mono">${esc(e.source)}</span></span></div>`;
          })
          .join("") +
        (data.has_more
          ? `<p class="d-hint">${esc(t("Showing the first 100."))}</p>`
          : "")
      : `<p class="d-empty">${esc(t("No other module links here, or none has shared it with Mnemosyne."))}</p>`;
    enterView(holder);
  },
  "download-attachment": async (el) => {
    const s = activeSessionFor(el);
    const a = await api(
      wp("/resources/" + s.r.id + "/attachments/" + el.dataset.id),
    );
    const bytes = Uint8Array.from(atob(a.content), (c) => c.charCodeAt(0));
    download(a.name, bytes, "application/octet-stream");
  },
  "preview-attachment": async (el) => {
    const s = activeSessionFor(el);
    const row = el.closest(".d-row");
    const existing = row.nextElementSibling?.classList.contains(
      "attachment-preview",
    )
      ? row.nextElementSibling
      : null;
    if (existing) return collapseOut(existing);
    const a = await api(
      wp("/resources/" + s.r.id + "/attachments/" + el.dataset.id),
    );
    const img = document.createElement("img");
    img.className = "attachment-preview";
    img.alt = a.name;
    img.src = "data:" + a.media_type + ";base64," + a.content;
    row.after(img);
    expandIn(img);
  },
  "remove-attachment": async (el) => {
    const s = activeSessionFor(el);
    await api(
      wp("/resources/" + s.r.id + "/attachments/" + el.dataset.id),
      "DELETE",
    );
    await reloadSession(s);
    renderDrawer();
    $$("#drawer details.more").forEach((d) => (d.open = true));
  },
  "retry-save": (el) => saveSession(sessions.get(el.dataset.id)),
  "keep-mine": (el) => keepMine(sessions.get(el.dataset.id)),
  "use-saved": (el) => useSaved(sessions.get(el.dataset.id)),

  "new-project": async () => {
    const name = await promptName(
      t("New project"),
      t("What are you working toward?"),
    );
    if (!name) return;
    const r = await api(wp("/resources"), "POST", {
      kind: "project",
      title: name,
      status: "active",
    });
    upsert(r);
    await go("project", {
      set: { projectId: r.id, projectTab: "overview" },
      reload: false,
      direction: 1,
    });
  },
  "toggle-closed-projects": async () => {
    state.showClosedProjects = !state.showClosedProjects;
    await renderView({ soft: false });
  },
  "project-status": (el) => {
    const s = sessions.get(state.projectId);
    menu(
      el,
      PROJECT_STATES.map((value) => ({
        label: PROJECT_STATE_LABEL()[value],
        value,
        checked: s.r.status === value,
        html: `<span class="status-dot st-${value}"></span>`,
      })),
      (item) => {
        edit(s, { status: item.value }, 0);
        refreshProps(s);
      },
    );
  },
  "project-date": (el) => {
    const s = sessions.get(state.projectId);
    datePicker(el, s.r[el.dataset.prop], (value) => {
      edit(s, { [el.dataset.prop]: value }, 0);
      refreshProps(s);
    });
  },
  "project-tab": (el) => {
    state.projectTab = el.dataset.projectTab;
    $$(".tab[data-project-tab]").forEach((b) => {
      const on = b.dataset.projectTab === state.projectTab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
    placeInk();
    return renderProjectWork(false);
  },
  "project-menu": (el) => {
    const s = sessions.get(state.projectId);
    menu(
      el,
      [
        { label: t("Details"), value: "details", icon: "info" },
        {
          label: s.r.pinned ? t("Unpin") : t("Pin to top"),
          value: "pin",
          icon: "pin",
          disabled: readOnly(),
        },
        { divider: true },
        {
          label: t("Move to Trash"),
          value: "trash",
          icon: "trash",
          danger: true,
          disabled: readOnly(),
        },
      ],
      (item) => {
        if (item.value === "details") return openDetails(s.r.id);
        if (item.value === "pin") return edit(s, { pinned: !s.r.pinned }, 0);
        if (item.value === "trash")
          return trashAndReport(s.r.id, () =>
            go("project", {
              set: { projectId: null },
              reload: false,
              direction: -1,
            }),
          );
      },
      { align: "end" },
    );
  },
  "project-new-note": async () => {
    const p = find(state.projectId);
    const r = await createNote({ project: state.projectId });
    if (!r) return;
    await go("note", {
      set: {
        noteId: r.id,
        noteContext: { act: "back-to-project", id: p.id, label: p.title },
        preview: false,
      },
      reload: false,
      direction: 1,
    });
    $("#markdown")?.focus();
  },
  "column-add": (el) => {
    const holder = el.closest(".column-add");
    const column = el.dataset.column;
    holder.innerHTML = `<div class="column-input">${icon("plus")}<input maxlength="200" placeholder="${esc(t("Task title"))}" aria-label="${esc(t("New task in {column}", { column: t(column) }))}" data-column-input="${esc(column)}"></div>`;
    const input = $("input", holder);
    input.focus();
    input.addEventListener("blur", () => {
      if (!input.value.trim()) setTimeout(() => softRender(), 0);
    });
  },
  "toggle-column-done": (el) => {
    const column = el.dataset.column;
    state.openDoneColumns.has(column)
      ? state.openDoneColumns.delete(column)
      : state.openDoneColumns.add(column);
    const expanded = state.openDoneColumns.has(column);
    el.setAttribute("aria-expanded", String(expanded));
    el.innerHTML = `${icon(expanded ? "chevronDown" : "chevronRight")}${el.textContent}`;
    const list = el.nextElementSibling;
    list.hidden = !expanded;
    if (expanded) enterView(list);
  },

  "new-collection": async () => {
    const name = await promptName(t("New collection"), t("Name"));
    if (!name) return;
    const r = await api(wp("/resources"), "POST", {
      kind: "collection",
      title: name,
      status: "open",
      parent: null,
    });
    upsert(r);
    await go("collection", {
      set: { collectionId: r.id, collectionNoteId: null },
      reload: false,
    });
  },
  "select-collection": (el) =>
    go("collection", {
      set: { collectionId: el.dataset.id, collectionNoteId: null },
      reload: false,
    }),
  "toggle-node": (el) => {
    const id = el.dataset.id;
    const node = el.closest(".tree-node");
    const children = $(".tree-children", node);
    const open = state.collapsedNodes.has(id);
    open ? state.collapsedNodes.delete(id) : state.collapsedNodes.add(id);
    node.setAttribute("aria-expanded", String(open));
    $(".i", el).classList.toggle("open", open);
    el.setAttribute("aria-label", open ? t("Collapse") : t("Expand"));
    if (!children) return;
    if (open) {
      children.hidden = false;
      expandIn(children);
    } else {
      const h = children.offsetHeight;
      animate(
        children,
        [
          { height: h + "px", opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration: 160, easing: EASE_IN },
      ).then(() => (children.hidden = !open && state.collapsedNodes.has(id)));
      if (!children.animate || reducedMotion()) children.hidden = true;
    }
  },
  "collection-new-note": async () => {
    const r = await createNote({ collections: [state.collectionId] });
    if (!r) return;
    await go("collection", {
      set: { collectionNoteId: r.id },
      reload: false,
      direction: 1,
    });
    $("#markdown")?.focus();
  },
  "collection-add-notes": async () => {
    const cid = state.collectionId;
    const candidates = byKind("note").filter(
      (n) => !n.collections.includes(cid),
    );
    if (!candidates.length)
      return toast(t("Every note is already in this collection."));
    const result = await dialog({
      title: t("Add notes to “{name}”", { name: find(cid).title }),
      wide: true,
      body: `<label class="pane-filter in-dialog">${icon("search")}<input type="search" id="pick-filter" placeholder="${esc(t("Filter notes"))}" aria-label="${esc(t("Filter notes"))}"></label><div class="pick-list" id="pick-list">${candidates.map((n) => `<label class="pick" data-text="${esc((displayTitle(n) + " " + plainText(n.content)).toLowerCase())}"><input type="checkbox" value="${esc(n.id)}"><span class="box">${icon("check")}</span><span class="pick-main"><span class="pick-title">${esc(displayTitle(n))}</span><span class="pick-snippet">${esc(plainText(n.content).slice(0, 90))}</span></span></label>`).join("")}</div>`,
      actions: [
        { label: t("Cancel"), value: "cancel", kind: "quiet" },
        { label: t("Add selected notes"), value: "ok", kind: "primary" },
      ],
      collect: (d) => $$("#pick-list input:checked", d).map((i) => i.value),
      validate: (_, ids) =>
        ids.length ? null : t("Choose at least one note."),
    });
    if (!result) return;
    for (const id of result.data)
      await mutate(id, (fresh) => ({
        collections: [...new Set([...fresh.collections, cid])],
      }));
    await softRender();
    toast(
      plural(result.data.length, "Added {count} note", "Added {count} notes"),
    );
  },
  "remove-from-collection": async (el) => {
    const cid = state.collectionId;
    const id = el.dataset.id;
    await mutate(id, (fresh) => ({
      collections: fresh.collections.filter((c) => c !== cid),
    }));
    await softRender();
    toast(t("Removed from “{name}”", { name: find(cid)?.title || "" }), {
      action: t("Undo"),
      onAction: async () => {
        await mutate(id, (fresh) => ({
          collections: [...new Set([...fresh.collections, cid])],
        }));
        await softRender();
      },
    });
  },
  "collection-menu": (el) => {
    const s = sessions.get(state.collectionId);
    const blocked = descendants(s.r.id);
    menu(
      el,
      [
        {
          label: t("New collection inside"),
          value: "child",
          icon: "plus",
          disabled: readOnly(),
        },
        {
          label: t("Move to…"),
          value: "move",
          icon: "folderUp",
          disabled: readOnly(),
        },
        { label: t("Details"), value: "details", icon: "info" },
        { divider: true },
        {
          label: t("Move to Trash"),
          value: "trash",
          icon: "trash",
          danger: true,
          disabled: readOnly(),
        },
      ],
      async (item) => {
        if (item.value === "details") return openDetails(s.r.id);
        if (item.value === "child") {
          const name = await promptName(
            t("New collection inside “{name}”", { name: s.r.title }),
            t("Name"),
          );
          if (!name) return;
          const r = await api(wp("/resources"), "POST", {
            kind: "collection",
            title: name,
            status: "open",
            parent: s.r.id,
          });
          upsert(r);
          return go("collection", {
            set: { collectionId: r.id, collectionNoteId: null },
            reload: false,
          });
        }
        if (item.value === "move") {
          const targets = byKind("collection").filter(
            (c) => !blocked.has(c.id),
          );
          return menu(
            el,
            [
              {
                label: t("Top level"),
                value: null,
                checked: !s.r.parent,
                icon: "folderUp",
              },
              ...targets.map((c) => ({
                label: collectionPath(c.id)
                  .map((x) => x.title)
                  .join(" / "),
                value: c.id,
                checked: s.r.parent === c.id,
                icon: "collection",
              })),
            ],
            async (target) => {
              await mutate(s.r.id, { parent: target.value });
              await renderView({ soft: false });
              toast(t("Moved “{name}”", { name: s.r.title }));
            },
            { filter: targets.length > 6, placeholder: t("Find a collection") },
          );
        }
        if (item.value === "trash")
          return trashAndReport(s.r.id, () =>
            go("collection", { set: { collectionId: null }, reload: false }),
          );
      },
      { align: "end" },
    );
  },

  restore: (el) => trashAction("restore", [el.dataset.id]),
  "trash-row-menu": (el) =>
    menu(
      el,
      [
        { label: t("Restore"), value: "restore", icon: "undo" },
        {
          label: t("Delete permanently…"),
          value: "delete",
          icon: "trash",
          danger: true,
        },
      ],
      (item) => trashAction(item.value, [el.dataset.id]),
      { align: "end" },
    ),
  "restore-selected": () => trashAction("restore", [...state.trashSelection]),
  "delete-selected": () => trashAction("delete", [...state.trashSelection]),
  "clear-selection": () => {
    state.trashSelection.clear();
    $$("[data-trash-select]").forEach((c) => (c.checked = false));
    $$(".trash-row.is-selected").forEach((r) =>
      r.classList.remove("is-selected"),
    );
    updateTrashChrome();
  },
  "empty-trash": () => trashAction("empty", []),
  retention: (el) => retentionMenu(el),

  "new-workspace": () => newWorkspace(),
  "switch-workspace": (el) => switchWorkspace(el.dataset.id),
  "toggle-archive": async (el) => {
    const w = state.workspaces.find((x) => x.id === el.dataset.id);
    await saveWorkspace(w.id, { archived: !w.archived });
    await renderView({ soft: false });
    toast(
      w.archived
        ? t("“{name}” archived", { name: w.title })
        : t("“{name}” restored", { name: w.title }),
    );
  },
  "welcome-create": async () => {
    const title = $("#welcome-title").value.trim();
    if (!title) {
      $("#welcome-title").focus();
      throw Error(t("Enter a name for your Workspace."));
    }
    const created = await api("/api/workspaces", "POST", {
      title,
      timezone: $("#welcome-zone").value.trim(),
      archived: false,
    });
    state.workspaces = await api("/api/workspaces");
    renderShell();
    await switchWorkspace(created.id);
  },
};

document.addEventListener("click", (e) => {
  const target = e.target;
  const actionEl = target.closest?.("[data-act]");
  if (
    actionEl &&
    !actionEl.disabled &&
    (actionEl.closest("#app") || actionEl.closest("#layer"))
  ) {
    const handler = actions[actionEl.dataset.act];
    if (!handler) return;
    e.preventDefault();
    if (actionEl.dataset.busy) return;
    actionEl.dataset.busy = "1";
    run(handler, actionEl, e).finally(() => delete actionEl.dataset.busy);
    return;
  }
  const view = target.closest?.("[data-view]");
  if (view && view.closest("#app")) {
    e.preventDefault();
    const destination = view.dataset.view;
    run(() =>
      go(destination, {
        set:
          destination === "project"
            ? { projectId: null }
            : destination === "collection"
              ? { collectionNoteId: null }
              : destination === "note"
                ? { noteContext: null }
                : {},
      }),
    );
    return;
  }
  const taskTab = target.closest?.("[data-task-view]");
  if (taskTab && taskTab.classList.contains("tab")) {
    const view = taskTab.dataset.taskView;
    run(async () => {
      if (!(await flushAll())) return;
      state.taskView = view;
      closeDrawer({ flush: false });
      $$(".tab[data-task-view]").forEach((b) => {
        const on = b.dataset.taskView === view;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", String(on));
      });
      placeInk();
      const wrap = $(".list-wrap");
      wrap.innerHTML = `${view === "completed" ? "" : quickAddHtml(view === "all" ? "all" : view)}<div class="task-list" role="list" id="task-groups">${groupsHtml(groupsFor(view), emptyState(...TASK_EMPTY[view].map((s, i) => (i ? t(s) : s))))}</div>`;
      enterView(wrap, 0);
    });
    return;
  }
  const projectTab = target.closest?.("[data-project-tab]");
  if (projectTab && projectTab.classList.contains("tab")) {
    run(actions["project-tab"], projectTab);
    return;
  }
  const taskRowEl = target.closest?.("[data-open-task]");
  if (taskRowEl && !target.closest("button, input, a")) {
    run(() => openTask(taskRowEl.dataset.openTask));
    return;
  }
  const noteRowEl = target.closest?.("[data-open-note]");
  if (noteRowEl && !target.closest("button, input, a")) {
    const id = noteRowEl.dataset.openNote;
    run(async () => {
      if (state.view === "collection") {
        if (!(await flushAll())) return;
        return go("collection", {
          set: { collectionNoteId: id },
          reload: false,
          direction: 1,
        });
      }
      if (state.view === "note") {
        if (!(await flushAll())) return;
        state.noteId = id;
        state.noteContext = null;
        state.preview = false;
        $$("#note-list .note-row").forEach((row) =>
          row.classList.toggle("is-selected", row.dataset.row === id),
        );
        await mountNoteEditor($("#editor-slot"), id, null);
        dropSessions([id]);
        crumbs([
          { label: t("Notes"), act: "goto-notes" },
          { label: displayTitle(sessions.get(id).r) },
        ]);
        enterView($("#editor-slot").firstElementChild, 0);
        return;
      }
      if (state.view === "project") {
        const p = find(state.projectId);
        return go("note", {
          set: {
            noteId: id,
            noteContext: p
              ? { act: "back-to-project", id: p.id, label: p.title }
              : null,
            preview: false,
          },
          direction: 1,
        });
      }
      return openResource(id);
    });
    return;
  }
  const preview = target.closest?.("#preview a[href]");
  if (preview) {
    e.preventDefault();
    const href = preview.getAttribute("href");
    run(async () => {
      if (href.startsWith("nexus:v1:mnemosyne:"))
        return openResource(href.split(":").at(-1));
      if (/^(https?:|mailto:)/.test(href))
        return bridge("external", { url: href });
    });
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.matches?.("textarea.autosize")) autosize(el);
  if (el.id === "search") return onSearchInput(el.value);
  if (el.id === "note-filter") {
    const q = el.value.toLowerCase();
    const notes = byKind("note").filter((n) =>
      (displayTitle(n) + " " + n.content).toLowerCase().includes(q),
    );
    $("#note-list").innerHTML =
      notes.map((n) => noteRow(n)).join("") ||
      `<div class="pane-empty"><p>${esc(t("No notes match."))}</p></div>`;
    return;
  }
  if (el.id === "pick-filter") {
    const q = el.value.toLowerCase();
    $$("#pick-list .pick").forEach(
      (pick) => (pick.hidden = !pick.dataset.text.includes(q)),
    );
    return;
  }
  if (el.dataset?.step !== undefined) {
    const s = drawerSession();
    if (!s) return;
    s.r.checklist[+el.dataset.step].text = el.value;
    edit(s, { checklist: s.r.checklist });
    return;
  }
  const field = el.dataset?.edit;
  if (!field) return;
  const s = activeSessionFor(el);
  if (!s) return;
  let value = el.value;
  if (field === "title")
    value = value.trim() ? value.replace(/\n/g, " ") : fallbackTitle(s.r);
  if (field === "accent") {
    value = value.toUpperCase();
    $$(".swatch.on", el.closest(".swatches")).forEach((b) =>
      b.classList.remove("on"),
    );
    el.closest(".swatch")?.classList.add("on");
    el.closest(".swatch")?.style.setProperty("--swatch", value);
  }
  edit(s, { [field]: value });
  if (field === "title") {
    patchCrumbTitle(s.r);
  }
});
function patchCrumbTitle(r) {
  const current = $("#crumbs .crumb-current");
  if (!current) return;
  if (
    (state.view === "note" && state.noteId === r.id) ||
    (state.view === "project" && state.projectId === r.id) ||
    (state.view === "collection" &&
      (state.collectionNoteId === r.id ||
        (!state.collectionNoteId && state.collectionId === r.id)))
  )
    current.textContent = displayTitle(r);
}

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset?.attach) return run(uploadAttachment, el);
  if (el.dataset?.editBool) {
    const s = activeSessionFor(el);
    if (s) edit(s, { [el.dataset.editBool]: el.checked }, 0);
    return;
  }
  if (el.dataset?.trashSelect) {
    const id = el.dataset.trashSelect;
    el.checked ? state.trashSelection.add(id) : state.trashSelection.delete(id);
    el.closest(".trash-row")?.classList.toggle("is-selected", el.checked);
    updateTrashChrome();
    return;
  }
  if (el.id === "select-all") {
    const all = state.trashSelection.size !== trashCache.rows.length;
    state.trashSelection = new Set(all ? trashCache.rows.map((r) => r.id) : []);
    $$("[data-trash-select]").forEach((c) => {
      c.checked = all;
      c.closest(".trash-row")?.classList.toggle("is-selected", all);
    });
    updateTrashChrome();
    return;
  }
  if (el.dataset?.wsField) {
    const value = el.value.trim();
    if (!value) return;
    run(async () => {
      try {
        await saveWorkspace(el.dataset.ws, { [el.dataset.wsField]: value });
        toast(t("Workspace updated"));
      } catch (error) {
        const w = state.workspaces.find((x) => x.id === el.dataset.ws);
        el.value = w[el.dataset.wsField];
        throw error;
      }
    });
  }
});

document.addEventListener("keydown", (e) => {
  const el = e.target;
  const typing = el.matches?.("input, textarea, select, [contenteditable]");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    run(async () => {
      if (await flushAll())
        for (const s of sessions.values()) status(s, "saved");
    });
    return;
  }
  if (
    ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
    (e.key === "/" && !typing && !popover)
  ) {
    const search = $("#search");
    if (search) {
      e.preventDefault();
      search.focus();
      search.select();
    }
    return;
  }
  if (el.id === "search") {
    if (e.key === "Escape") {
      el.value = "";
      el.blur();
      onSearchInput("");
    } else if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchTimer);
      run(async () => {
        if (state.view !== "search" || state.query !== el.value.trim()) {
          onSearchInput(el.value);
          await wait(260);
        }
        $(".result")?.click();
      });
    }
    return;
  }
  if (
    (el.id === "welcome-title" || el.id === "welcome-zone") &&
    e.key === "Enter"
  ) {
    e.preventDefault();
    $('[data-act="welcome-create"]')?.click();
    return;
  }
  if (el.id === "quick-add-input" || el.id === "capture-input") {
    if (e.key === "Escape") {
      el.value = "";
      el.blur();
      return;
    }
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const title = el.value.trim();
    if (!title) return;
    const capture = el.id === "capture-input";
    run(async () => {
      el.disabled = true;
      try {
        if (capture && state.captureKind === "note") {
          const r = await createNote({ title });
          if (!r) return;
          el.value = "";
          await go("note", {
            set: { noteId: r.id, noteContext: null, preview: false },
            reload: false,
          });
          $("#markdown")?.focus();
          return;
        }
        await createTask(title, state.draft);
        el.value = "";
        if (capture) {
          state.draft = { context: "capture" };
          redrawDraft();
        }
      } finally {
        const input = $("#" + el.id) || el;
        input.disabled = false;
        el.disabled = false;
        input.focus();
      }
    });
    return;
  }
  if (el.dataset?.columnInput) {
    if (e.key === "Escape") {
      el.value = "";
      el.blur();
      return;
    }
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    const title = el.value.trim();
    if (!title) return;
    const column = el.dataset.columnInput;
    run(async () => {
      await createTask(
        title,
        { project: state.projectId },
        { board_column: column },
      );
      const input = $(`[data-column-input="${cssq(column)}"]`);
      if (!input) {
        const button = $(`.column-add-btn[data-column="${cssq(column)}"]`);
        button?.click();
      } else input.focus();
    });
    return;
  }
  if (el.id === "check-text" && e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    const s = drawerSession();
    const text = el.value.trim();
    if (!s || !text) return;
    s.r.checklist.push({ text, done: false });
    edit(s, { checklist: s.r.checklist }, 200);
    el.value = "";
    renderChecklist(s);
    expandIn($("#checklist").lastElementChild);
    patchRows(s.r.id);
    return;
  }
  if (
    el.matches?.(
      ".note-title, .drawer-title, .project-title, .collection-title",
    ) &&
    e.key === "Enter"
  ) {
    e.preventDefault();
    if (el.classList.contains("note-title")) $("#markdown")?.focus();
    else el.blur();
    return;
  }
  if (e.key === "Escape") {
    if (popover) return closePopover(true);
    if (state.drawer && !$("#dialog").open) {
      e.preventDefault();
      closeDrawer();
    }
    return;
  }
  const row = el.closest?.("[data-row]");
  if (row && el === row) {
    const list =
      row.parentElement.closest(
        "[role=list], .task-list, .note-list, .board",
      ) || row.parentElement;
    const rows = $$("[data-row]", list).filter(
      (r) => r.offsetParent !== null || !r.hidden,
    );
    const index = rows.indexOf(row);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      rows[
        e.key === "ArrowDown"
          ? Math.min(rows.length - 1, index + 1)
          : Math.max(0, index - 1)
      ]?.focus();
      return;
    }
    if (row.dataset.openTask) {
      if (e.key === " ") {
        e.preventDefault();
        run(toggleTask, row.dataset.openTask);
      } else if (e.key === "Enter") {
        e.preventDefault();
        run(() => openTask(row.dataset.openTask, { focus: true }));
      } else if ((e.key === "Delete" || e.key === "Backspace") && !readOnly()) {
        e.preventDefault();
        run(() => trashAndReport(row.dataset.openTask, softRender));
      } else if (
        (e.key === "." ||
          e.key === "ContextMenu" ||
          (e.shiftKey && e.key === "F10")) &&
        $(".row-more", row)
      ) {
        e.preventDefault();
        $(".row-more", row).click();
      } else if (
        e.altKey &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        row.dataset.rowKind === "card"
      ) {
        e.preventDefault();
        const r = find(row.dataset.openTask);
        const next =
          COLUMNS[
            COLUMNS.indexOf(r.board_column) + (e.key === "ArrowRight" ? 1 : -1)
          ];
        if (next) run(moveCard, r.id, next);
      }
    } else if (row.dataset.openNote && e.key === "Enter") {
      e.preventDefault();
      row.click();
    }
  }
});

/* Board drag and drop */
document.addEventListener("dragstart", (e) => {
  const card = e.target.closest?.(".card[data-row]");
  if (!card) return;
  e.dataTransfer.setData("text/plain", card.dataset.row);
  e.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
});
document.addEventListener("dragend", (e) => {
  e.target.closest?.(".card")?.classList.remove("dragging");
  $$(".column.drop-target").forEach((c) => c.classList.remove("drop-target"));
});
document.addEventListener("dragover", (e) => {
  const column = e.target.closest?.(".column");
  if (!column) return;
  e.preventDefault();
  $$(".column.drop-target").forEach(
    (c) => c !== column && c.classList.remove("drop-target"),
  );
  column.classList.add("drop-target");
});
document.addEventListener("drop", (e) => {
  const column = e.target.closest?.(".column");
  if (!column) return;
  e.preventDefault();
  column.classList.remove("drop-target");
  const id = e.dataTransfer.getData("text/plain");
  if (id) run(moveCard, id, column.dataset.column);
});

/* Animated disclosures */
document.addEventListener(
  "toggle",
  (e) => {
    const details = e.target;
    if (!details.matches?.("details[data-animate]") || !details.open) return;
    const body = details.querySelector(":scope > div");
    if (body) enterView(body);
  },
  true,
);

window.addEventListener("beforeunload", (e) => {
  if ([...sessions.values()].some((s) => s.dirty || s.flight)) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("resize", () => {
  closePopover();
  placeInk(document, true);
  updateNav();
});

/* ───────────────────────── Display typeface detection ───────────────────────── */

function detectDisplayFont() {
  if (!document.fonts?.load) return;
  document.fonts
    .load('32px "Mnemosyne Display"', "MNEMOSYNE")
    .then((faces) => {
      if (faces.length)
        document.documentElement.classList.add("has-display-font");
    })
    .catch(() => {});
}

/* ───────────────────────── Boot ───────────────────────── */

async function boot() {
  splash(t("Opening Mnemosyne…"));
  detectDisplayFont();
  try {
    state.context = await bridge("context");
    activeLocale = safeLocale(state.context.locale);
    document.documentElement.lang = activeLocale;
    state.workspaces = await api("/api/workspaces");
  } catch (error) {
    $("#app").innerHTML =
      `<div class="splash error"><div class="splash-mark">${MARK}</div><h1>${esc(t("Mnemosyne couldn't open"))}</h1><p>${esc(error.message)}</p><button type="button" class="btn primary" id="retry-boot">${esc(t("Try again"))}</button></div>`;
    $("#retry-boot").onclick = () => boot();
    return;
  }
  if (!state.workspaces.length) return welcome();
  const deep = location.pathname.match(/\/w\/([^/]+)\/r\/([^/]+)/);
  const deepWorkspace = deep && state.workspaces.find((w) => w.id === deep[1]);
  // Reopen the last opened active Workspace; deep links keep their own Workspace.
  const recent = state.workspaces
    .filter((w) => !w.archived)
    .sort((a, b) => (b.opened_at || "").localeCompare(a.opened_at || ""));
  state.wid = deepWorkspace?.id || recent[0]?.id || state.workspaces[0].id;
  renderShell();
  try {
    await loadResources();
    updateShell();
    if (deepWorkspace) await openResource(deep[2]);
    else await renderView({});
  } catch (error) {
    $("#view").innerHTML =
      `<div class="page">${emptyState("info", t("This Workspace couldn't be loaded"), error.message, `<button type="button" class="btn primary" id="retry-view">${esc(t("Try again"))}</button>`)}</div>`;
    $("#retry-view").onclick = () => boot();
  }
  checkSync();
  clearInterval(syncTimer);
  syncTimer = setInterval(checkSync, 20000);
}
boot();
