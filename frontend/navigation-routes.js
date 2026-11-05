/* Mnemosyne-owned route codec. No content, search text or credentials in URLs. */
(() => {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const ids = new RegExp('^' + uuid + '$');
  const names = {home:'home', notes:'note', tasks:'task', projects:'project', collections:'collection',
    trash:'trash', workspaces:'workspaces', search:'search'};
  const taskViews = ['today','all','inbox','upcoming','completed'];
  const projectTabs = ['board','overview','tasks','notes'];
  const defaults = () => ({view:'home',noteId:null,noteContext:null,projectId:null,projectTab:'board',
    collectionId:null,collectionNoteId:null,taskView:'today',drawer:null,preview:false,query:''});
  function parse(value, defaultWorkspace) {
    if (value === '/') return {wid:defaultWorkspace, ...defaults()};
    const url = new URL(value, 'https://module.invalid');
    if (url.hash) throw Error('Unknown Mnemosyne fragment');
    const legacy = new RegExp('^/w/(' + uuid + ')/r/(' + uuid + ')$').exec(url.pathname);
    if (legacy && !url.search) return {wid:legacy[1], resource:legacy[2], ...defaults()};
    const match = new RegExp('^/w/(' + uuid + ')/([a-z]+)$').exec(url.pathname);
    if (!match || !names[match[2]]) throw Error('Unknown Mnemosyne view');
    const result = {wid:match[1], ...defaults(), view:names[match[2]]};
    const keys = {note:'noteId',project:'projectId',collection:'collectionId',collectionNote:'collectionNoteId'};
    for (const [key, value] of url.searchParams) {
      if (url.searchParams.getAll(key).length !== 1) throw Error('Ambiguous Mnemosyne route');
      if (keys[key]) {
        if (!ids.test(value)) throw Error('Invalid resource identity');
        result[keys[key]] = value;
      } else if (key === 'task' || key === 'details') {
        if (!ids.test(value) || result.drawer) throw Error('Invalid drawer identity');
        result.drawer = {mode:key === 'task' ? 'task' : 'details',id:value};
      } else if (key === 'taskView' && taskViews.includes(value)) result.taskView = value;
      else if (key === 'projectTab' && projectTabs.includes(value)) result.projectTab = value;
      else if (key === 'preview' && value === '1') result.preview = true;
      else throw Error('Unknown Mnemosyne route option');
    }
    if ((result.noteId && result.view !== 'note') || (result.projectId && result.view !== 'project') ||
        ((result.collectionId || result.collectionNoteId) && result.view !== 'collection')) throw Error('Resource does not belong to view');
    return result;
  }
  function serialize(state) {
    const view = Object.entries(names).find(([, value]) => value === state.view)?.[0];
    if (!view || !ids.test(state.wid)) throw Error('Invalid Mnemosyne route state');
    const params = new URLSearchParams();
    if (view === 'notes' && state.noteId) params.set('note', state.noteId);
    if (view === 'projects' && state.projectId) {
      params.set('project',state.projectId);
      if (state.projectTab !== 'board') params.set('projectTab',state.projectTab);
    }
    if (view === 'collections') {
      if (state.collectionId) params.set('collection',state.collectionId);
      if (state.collectionNoteId) params.set('collectionNote',state.collectionNoteId);
    }
    if (view === 'tasks' && state.taskView !== 'today') params.set('taskView',state.taskView);
    if (state.drawer) params.set(state.drawer.mode === 'task' ? 'task' : 'details',state.drawer.id);
    if (state.preview && (view === 'notes' || view === 'collections')) params.set('preview','1');
    const result = '/w/' + state.wid + '/' + view + (params.size ? '?' + params : '');
    parse(result, state.wid); return result;
  }
  globalThis.MnemosyneRoutes = Object.freeze({parse,serialize});
})();
