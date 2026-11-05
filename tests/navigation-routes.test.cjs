const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({URL,URLSearchParams});
vm.runInContext(fs.readFileSync('frontend/navigation-routes.js','utf8'),context);
const {parse,serialize} = context.MnemosyneRoutes;
const wid = '11111111-1111-1111-1111-111111111111';
const id = '22222222-2222-2222-2222-222222222222';
test('all primary views and task detail round trip with workspace identity',()=>{
  for (const view of ['home','notes','tasks','projects','collections','trash','workspaces','search']) {
    const route = '/w/' + wid + '/' + view;
    assert.equal(serialize(parse(route,wid)),route);
  }
  const detail = '/w/' + wid + '/tasks?taskView=all&task=' + id;
  assert.equal(serialize(parse(detail,wid)),detail);
  assert.equal(parse('/w/' + wid + '/r/' + id,wid).resource,id);
});
test('invalid routes never silently select a different resource',()=>{
  for (const value of ['/unknown','/w/bad/notes','/w/' + wid + '/notes?note=not-an-id',
    '/w/' + wid + '/tasks?taskView=invalid','/w/' + wid + '/notes?note=' + id + '&note=' + id,
    '/w/' + wid + '/tasks?note=' + id,'/w/' + wid + '/notes?token=secret'])
    assert.throws(()=>parse(value,wid),value);
});
