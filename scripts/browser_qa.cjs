// Explicit local browser QA against the installed application; no mocked services.
const {chromium,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const compose=['compose','-f',path.resolve('../empyrean-nexus/compose.yaml'),'exec','-T','nexus','python','-c'];
const session=JSON.parse(execFileSync('docker',[...compose,`import sqlite3,secrets,hashlib,time,json
c=sqlite3.connect('/data/nexus.sqlite3')
u=c.execute('select id from users').fetchall()
assert len(u)==1
t=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(32)
c.execute('insert into sessions values(?,?,?,?)',(hashlib.sha256(t.encode()).hexdigest(),u[0][0],csrf,int(time.time())+900)); c.commit()
print(json.dumps({'token':t,'csrf':csrf}))`],{encoding:'utf8'}));
(async()=>{
 let browser,page;const errors=[];const created=[];const suffix=Date.now().toString(36);
 fs.mkdirSync('artifacts',{recursive:true});
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addCookies([{name:'nexus_session',value:session.token,url:'http://localhost:12333',httpOnly:true,sameSite:'Strict'}]);
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:12333/app/overview');
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  await page.goto('http://localhost:12333/app/modules/mnemosyne');
  const app=page.frameLocator('#module-application');
  await expect(app.getByRole('button',{name:'Create a Workspace',exact:true})).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.screenshot({path:'artifacts/01-welcome.png',fullPage:true});
  await app.getByRole('button',{name:'Create a Workspace',exact:true}).click();
  await app.getByLabel('Name',{exact:true}).fill('QA Personal '+suffix);
  await app.locator('dialog').getByRole('button',{name:'Save',exact:true}).click();
  await expect(app.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
  created.push(await app.locator('#workspace-select').inputValue());
  await app.getByRole('button',{name:'Notes',exact:false}).first().click();
  await app.getByRole('button',{name:'+ New note',exact:true}).click();
  await app.getByLabel('Title',{exact:true}).fill('Browser verified note');
  await app.getByLabel('Markdown content').fill('# Real browser verification\n\nA **Markdown** note, saved through Nexus.\n\n- [ ] A lightweight checklist\n\n| Topic | Result |\n| --- | --- |\n| Workspace | Isolated |');
  await app.getByLabel('Tags (comma separated)').fill('qa, browser');
  await app.getByRole('button',{name:'Save',exact:true}).click();
  await expect(app.locator('#save-state')).toHaveText('Saved');
  await app.getByRole('button',{name:'Preview',exact:true}).click();
  await expect(app.locator('#preview strong')).toHaveText('Markdown');
  await expect(app.locator('#preview table')).toBeVisible();
  await page.screenshot({path:'artifacts/02-note-editor.png',fullPage:true});
  await page.reload();
  await expect(app.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
  await app.locator('[data-view="note"]').click();
  await app.getByRole('button',{name:/Browser verified note/}).click();
  await expect(app.getByLabel('Markdown content')).toContainText('Real browser verification');
  await app.locator('[data-view="project"]').click();
  await app.getByRole('button',{name:'+ New project',exact:true}).click();
  await app.getByLabel('Title',{exact:true}).fill('Browser verified project');
  await app.getByRole('button',{name:'Save',exact:true}).click();
  await expect(app.locator('#save-state')).toHaveText('Saved');
  await app.getByRole('button',{name:'+ Task',exact:true}).click();
  await app.getByLabel('Title',{exact:true}).fill('Verify board workflow');
  await app.getByLabel('Priority',{exact:true}).selectOption('high');
  await app.getByLabel('Board column').selectOption('In progress');
  await app.getByLabel('New checklist item').fill('Check persistence');
  await app.locator('#add-check').getByRole('button',{name:'Add',exact:true}).click();
  await app.getByRole('button',{name:'Save',exact:true}).click();
  await expect(app.locator('#save-state')).toHaveText('Saved');
  await expect(app.getByLabel('Lifecycle')).toHaveValue('open');
  await app.locator('[data-view="project"]').click();
  await app.getByRole('button',{name:/Browser verified project/}).click();
  await expect(app.locator('.column').filter({hasText:'In progress'}).getByRole('button',{name:/Verify board workflow/})).toBeVisible();
  await page.screenshot({path:'artifacts/03-project-board.png',fullPage:true});
  await app.getByRole('button',{name:'Manage Workspaces'}).click();
  await app.getByRole('button',{name:'New Workspace',exact:true}).click();
  await app.getByLabel('Name',{exact:true}).fill('QA Work '+suffix);
  await app.locator('dialog').getByRole('button',{name:'Save',exact:true}).click();
  created.push(await app.locator('#workspace-select').inputValue());
  await app.getByRole('searchbox').fill('Browser verified');
  await app.getByRole('searchbox').press('Enter');
  await expect(app.getByRole('heading',{name:'Nothing found',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/04-mobile.png',fullPage:true});
  const frame=page.frames().find(f=>f.url().includes('/modules/mnemosyne/'));
  const overflow=await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Mobile document overflows horizontally');
  await page.setViewportSize({width:1440,height:1000});
  await app.getByRole('button',{name:/Applications/}).click();
  await app.locator('dialog').getByRole('button',{name:'Nexus · Control center',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  if(errors.length)throw Error('Browser console errors: '+errors.join('\n'));
  console.log(JSON.stringify({result:'passed',screenshots:4,checks:['full-application boundary','workspace creation','Markdown autosave and preview','reload persistence','project board and independent lifecycle','checklist','workspace-scoped search','mobile layout','Nexus switching'],workspaces:created}));
 }catch(e){console.error(e.message);console.error(errors);if(page){await page.screenshot({path:'artifacts/failure.png',fullPage:true});for(const f of page.frames())if(f.url().includes('/modules/mnemosyne/'))console.error(await f.locator('body').innerText());}process.exitCode=1;}
 finally{
  fs.writeFileSync('artifacts/browser-workspaces.json',JSON.stringify(created));
  // Only this run's test data is removed. IDs are captured from successful UI creation.
  if(created.length){
   const cleanup=`import json,sqlite3,sys\nids=json.loads(sys.stdin.read())\nc=sqlite3.connect('/data/mnemosyne.sqlite3')\nc.execute('pragma foreign_keys=on')\nwith c:\n for wid in ids:\n  row=c.execute('select title from workspaces where id=?',(wid,)).fetchone()\n  assert row and row[0].startswith('QA ')\n  c.execute('delete from resources where workspace=?',(wid,))\n  c.execute('delete from tombstones where workspace=?',(wid,))\n  c.execute('delete from workspaces where id=?',(wid,))\nprint('Browser verification data cleaned up')`;
   try{console.log(execFileSync('docker',['exec','-i','nexus-module-mnemosyne','python','-c',cleanup],{input:JSON.stringify(created),encoding:'utf8'}).trim());}catch(e){console.error('Test data cleanup needs attention');process.exitCode=1;}
  }
  if(browser)await browser.close();
  execFileSync('docker',[...compose,`import sqlite3,hashlib,sys\nc=sqlite3.connect('/data/nexus.sqlite3');c.execute('delete from sessions where token=?',(hashlib.sha256(sys.stdin.read().encode()).hexdigest(),));c.commit()`],{input:session.token});
 }
})();
