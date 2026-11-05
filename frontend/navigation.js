/* Mnemosyne pilot adapter for the shared opaque-frame navigation protocol. */
let applyingNavigation = false, draftStorageError = '', restoration = 0;
const retainedDrafts = new Map(), inputDrafts = new Map();
const moduleNavigation = EmpyreanNavigation.createClient({
  apply: restoreNavigation,
  beforeLeave: checkpointDrafts,
  invalidate: () => {
    ++renderToken; ++restoration; clearTimeout(searchTimer);
    const shell = document.querySelector('#shell');
    if (shell) { shell.inert = true; shell.setAttribute('aria-busy','true'); }
  },
  onError: error => { draftStorageError = error.message; renderDraftRecovery(); },
});
function draftKey(wid, id) { return wid + '/' + id; }
function captureDrafts() {
  for (const [id, s] of sessions) {
    const key = draftKey(s.wid || state.wid, id);
    if (s.dirty || s.flight || s.error) retainedDrafts.set(key, {wid:s.wid || state.wid, resource:structuredClone(s.r)});
    else retainedDrafts.delete(key);
  }
  for (const id of ['capture-input','quick-add-input','search']) {
    const input = document.getElementById(id);
    if (input) {
      const key = state.wid + ':' + (id === 'search' ? 'search' : state.view) + ':' + id;
      if (input.value) inputDrafts.set(key, {value:input.value, draft:structuredClone(state.draft),kind:state.captureKind});
      else inputDrafts.delete(key);
    }
  }
  return {version:1, dirty:retainedDrafts.size > 0 || [...inputDrafts.keys()].some(key => !key.endsWith(':search')),
    entries:[...retainedDrafts.values()], inputs:[...inputDrafts]};
}
function checkpointDrafts() {
  if (!moduleNavigation.enabled) return Promise.resolve();
  const value = captureDrafts();
  renderDraftRecovery();
  return moduleNavigation.checkpoint(value).then(() => { draftStorageError = ''; });
}
function retainDrafts() { void checkpointDrafts().catch(() => {}); }
function renderDraftRecovery() {
  if (!moduleNavigation.enabled || !document.querySelector('#shell')) return;
  let panel = document.querySelector('#navigation-recovery');
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'navigation-recovery';
    panel.setAttribute('role','status'); document.querySelector('#view').before(panel);
  }
  panel.innerHTML = (draftStorageError ? `<p class="inline-banner">${esc(draftStorageError)}</p>` : '') +
    [...retainedDrafts.values()].map(entry => `<div class="inline-banner">${esc(t('A draft is retained in this tab.'))} <button type="button" class="link" data-act="recover-navigation-draft" data-wid="${esc(entry.wid)}" data-id="${esc(entry.resource.id)}">${esc(t('Recover draft'))}: ${esc(displayTitle(entry.resource))}</button></div>`).join('');
}
function restoreInputDrafts() {
  for (const id of ['capture-input','quick-add-input']) {
    const input = document.getElementById(id);
    const saved = inputDrafts.get(state.wid + ':' + state.view + ':' + id);
    if (input && saved) {
      input.value = saved.value; state.draft = structuredClone(saved.draft); state.captureKind = saved.kind;
    }
  }
}
async function navigateState(view, options = {}) {
  const revision = moduleNavigation.revision;
  if (!(await flushAll())) return;
  await checkpointDrafts();
  if (revision !== moduleNavigation.revision) return; // A browser traversal superseded the save/guard.
  const next = {...state, view, drawer:null, ...(options.set || {})};
  return moduleNavigation.navigate(MnemosyneRoutes.serialize(next), options.historyMode || 'push');
}
async function restoreNavigation(value, message) {
  applyingNavigation = true;
  const epoch = restoration;
  const current = () => message.isCurrent() && epoch === restoration;
  const container = document.querySelector('#view');
  if (container) { container.style.visibility = 'hidden'; container.setAttribute('aria-busy','true'); }
  try {
    if (message.checkpoint?.version === 1) {
      for (const entry of message.checkpoint.entries || []) {
        if (entry?.wid && entry.resource?.id) retainedDrafts.set(draftKey(entry.wid,entry.resource.id),entry);
      }
      for (const [key, value] of message.checkpoint.inputs || []) inputDrafts.set(key, value);
    }
    // Browser traversal cannot be canceled. Preserve edits before changing workspace/view.
    await checkpointDrafts();
    for (const s of sessions.values()) {
      clearTimeout(s.timer);
      if (s.dirty && !s.flight) void saveSession(s).catch(() => {});
    }
    const target = MnemosyneRoutes.parse(value, state.wid);
    if (target.view === 'search') target.query = inputDrafts.get(target.wid + ':search:search')?.value || '';
    if (!state.workspaces.some(w => w.id === target.wid)) throw Error('Workspace not found');
    const resources = await api('/api/w/' + target.wid + '/resources');
    if (!current()) return;
    if (target.wid !== state.wid) { sessions.clear(); }
    state.wid = target.wid; state.resources = resources;
    if (target.resource) {
      const r = await api('/api/w/' + target.wid + '/resources/' + target.resource);
      if (!current()) return;
      if (r.trashed) throw Error('This resource is in Trash');
      if (r.kind === 'note') { target.view = 'note'; target.noteId = r.id; }
      if (r.kind === 'task') { target.view = 'task'; target.taskView = 'all'; target.drawer = {mode:'task',id:r.id}; }
      if (r.kind === 'project') { target.view = 'project'; target.projectId = r.id; }
      if (r.kind === 'collection') { target.view = 'collection'; target.collectionId = r.id; }
    }
    for (const [id, kind] of [[target.noteId,'note'],[target.projectId,'project'],[target.collectionId,'collection'],[target.collectionNoteId,'note'],[target.drawer?.id,target.drawer?.mode === 'task' ? 'task' : null]]) {
      if (id && !resources.some(r => r.id === id && (!kind || r.kind === kind))) throw Error('Resource not found');
    }
    closePopover(); closeDrawer({flush:false});
    Object.assign(state, target, {drawer:null});
    dropSessions();
    if (!document.querySelector('#shell')) renderShell();
    await renderView({});
    if (!current()) return;
    if (target.drawer?.mode === 'task') await openTask(target.drawer.id);
    else if (target.drawer?.mode === 'details') await openDetails(target.drawer.id);
    restoreInputDrafts(); renderDraftRecovery();
    if (state.view === 'search' && document.querySelector('#search')) document.querySelector('#search').value = state.query;
  } catch (error) {
    if (current() && document.querySelector('#view')) {
      document.querySelector('#view').innerHTML = `<div class="page"><h2>${esc(t('This view could not be opened'))}</h2><p>${esc(error.message)}</p></div>`;
      renderDraftRecovery();
    }
    throw error;
  } finally {
    applyingNavigation = false;
    if (current() && container?.isConnected) { container.style.visibility = ''; container.removeAttribute('aria-busy'); }
    if (current()) {
      const shell = document.querySelector('#shell');
      if (shell) { shell.inert = false; shell.removeAttribute('aria-busy'); }
    }
  }
}
