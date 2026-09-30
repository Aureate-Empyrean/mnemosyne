const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const source=fs.readFileSync('frontend/app.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup(){
 const dom=new JSDOM('<div id="app"></div><div id="toast" hidden></div><dialog id="dialog"></dialog>',{url:'http://localhost/modules/mnemosyne/',runScripts:'outside-only'});
 const w=dom.window,calls=[];
 const resources=[{id:'note1',workspace:'w1',kind:'note',title:'First note',content:'Original',status:'open',priority:'none',tags:[],checklist:[],collections:[],revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),reference:'nexus:v1:mnemosyne:note:note1',attachments:[],links:[],backlinks:[]}];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.parent.postMessage=msg=>{
  calls.push(msg);let result;
  if(msg.action==='context')result={applications:[],locale:'en-GB'};
  else if(msg.path==='/api/workspaces')result=[{id:'w1',title:'Personal',timezone:'Europe/Bratislava'},{id:'w2',title:'Work',timezone:'Europe/Bratislava'}];
  else if(msg.path==='/api/w/w1/resources/note1'){
   if(msg.method==='PUT'){if(msg.body.revision!==resources[0].revision)throw Error('conflict');Object.assign(resources[0],msg.body,{revision:resources[0].revision+1});}
   result={...resources[0]};
  }else if(msg.path.includes('/resources'))result=msg.path.includes('/w/w2/')?[]:[{...resources[0]}];
  else if(msg.path==='/api/preview')result={html:'<p>Preview</p>'};
  else result={};
  setTimeout(()=>w.dispatchEvent(new w.MessageEvent('message',{source:w,data:{channel:'empyrean-v1',id:msg.id,result}})),0);
 };
 w.eval(source);return {dom,w,calls,resources};
}
async function ready(){const x=setup();await tick();await tick();return x;}
test('workspace switch scopes subsequent data requests and search',async()=>{
 const {dom,w,calls}=await ready();try{
 assert.match(w.document.body.textContent,/Today/);
 const select=w.document.querySelector('#workspace-select');select.value='w2';select.dispatchEvent(new w.Event('change'));await tick();await tick();
 assert(calls.some(c=>c.path==='/api/w/w2/resources'));
 const search=w.document.querySelector('#search');search.value='private';search.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}));await tick();await tick();
 assert(calls.some(c=>c.path==='/api/w/w2/resources?q=private'));
 }finally{dom.window.close();}
});
test('editor saves current Markdown and revisions before navigation',async()=>{
 const {dom,w,calls,resources}=await ready();try{
 w.document.querySelector('[data-open]').click();await tick();await tick();
 const area=w.document.querySelector('#markdown');assert(area);area.value='# Updated';area.dispatchEvent(new w.Event('input'));
 w.document.querySelector('#save-now').click();await tick();
 assert.equal(resources[0].content,'# Updated');assert.equal(resources[0].revision,2);
 assert.equal(w.document.querySelector('#save-state').textContent,'Saved');
 area.value='Another change';area.dispatchEvent(new w.Event('input'));
 w.document.querySelector('[data-view="task"]').click();await tick();await tick();
 assert.equal(resources[0].content,'Another change');assert.equal(resources[0].revision,3);
 assert(calls.filter(c=>c.method==='PUT').every(c=>c.path==='/api/w/w1/resources/note1'));
 }finally{dom.window.close();}
});
test('preview is supplied by sanitizer API and untrusted message sources are ignored',async()=>{
 const {dom,w,calls}=await ready();try{
 w.document.querySelector('[data-open]').click();await tick();await tick();
 w.document.querySelector('#preview-toggle').click();await tick();
 assert.equal(w.document.querySelector('#preview').textContent,'Preview');
 assert(calls.some(c=>c.path==='/api/preview'));
 w.dispatchEvent(new w.MessageEvent('message',{source:{},data:{channel:'empyrean-v1',id:'forged',result:'intrusion'}}));
 assert(!w.document.body.textContent.includes('intrusion'));
 }finally{dom.window.close();}
});
