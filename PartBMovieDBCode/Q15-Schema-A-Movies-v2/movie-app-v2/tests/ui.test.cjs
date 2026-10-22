// Exercises the actual HTML and scripts in jsdom with IndexedDB emulation.
// This is not a real-browser/CORS/service-worker test.
const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const {IDBFactory,IDBKeyRange}=require('fake-indexeddb');
const PouchDB=require('pouchdb').plugin(require('pouchdb-adapter-memory'));
const express=require('express'),expressPouchDB=require('express-pouchdb'),path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+16000;while(Date.now()<end){try{if(await fn())return;}catch{}await sleep(40);}throw Error('Timed out: '+label);}
const listen=app=>new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
const movie=id=>({_id:id,title:id,actors:['Actor'],genres:['Drama']});

test('Actual UI: independent clients, offline CRUD, automatic upload, conflict banner and resolution',async()=>{
 const ServerDB=PouchDB.defaults({adapter:'memory',prefix:'ui-test-'});
 const backend=express();let requestCount=0;backend.use((req,res,next)=>{requestCount++;next();});
 backend.use(expressPouchDB(ServerDB,{mode:'minimumForPouchDB',inMemoryConfig:true,logPath:'/tmp/q15-v2-ui.log'}));
 const remote=new ServerDB('movies');await remote.put({_id:'parent',docs:[movie('update'),movie('delete'),movie('conflict')]});
 const backendServer=await listen(backend),frontend=express();frontend.use(express.static(path.join(__dirname,'../public')));const frontendServer=await listen(frontend);
 const remoteURL=`http://127.0.0.1:${backendServer.address().port}/movies`,appURL=`http://127.0.0.1:${frontendServer.address().port}`;
 const factory=new IDBFactory();const windows=[];const scriptErrors=[];
 async function client(name){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>scriptErrors.push(e.message));
  const dom=await JSDOM.fromURL(`${appURL}/?client=${name}`,{resources:'usable',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.indexedDB=factory;w.IDBKeyRange=IDBKeyRange;w.structuredClone=structuredClone;w.fetch=fetch;w.Headers=Headers;w.Request=Request;w.Response=Response;w.AbortController=AbortController;w.confirm=()=>true;}});
  const w=dom.window;windows.push(w);await until(()=>typeof w.MovieStore==='function','scripts loaded');
  const $=id=>w.document.getElementById(id);$('remote').value=remoteURL;$('parentId').value='parent';$('password').value='test';$('connection').requestSubmit();
  await until(()=>$('lastSync').textContent.includes('pull and push completed'),'initial UI synchronization');return {w,$};
 }
 function offline(c,value){c.$('offline').checked=value;c.$('offline').dispatchEvent(new c.w.Event('change'));}
 async function edit(c,id,title){c.$('search').value=id;c.$('search').dispatchEvent(new c.w.Event('input'));await until(()=>c.$('movies').rows.length===1&&c.$('movies').rows[0].cells[0].textContent===id,'search');c.$('movies').rows[0].querySelector('button').click();await until(()=>c.$('movieId').value===id,'edit opened');c.$('title').value=title;c.$('movieForm').requestSubmit();await until(()=>c.$('message').textContent.includes('Updated movie '+id),'edit saved');}
 try{
  const a=await client('A');
  offline(a,true);await sleep(200);const before=requestCount;
  a.$('movieId').value='created';a.$('title').value='Created offline';a.$('movieForm').requestSubmit();await until(()=>a.$('message').textContent.includes('Created movie created'),'offline create');
  await edit(a,'update','Updated offline');
  a.$('search').value='delete';a.$('search').dispatchEvent(new a.w.Event('input'));await until(()=>a.$('movies').rows.length===1&&a.$('movies').rows[0].cells[0].textContent==='delete','delete row');a.$('movies').rows[0].querySelectorAll('button')[1].click();await until(()=>a.$('message').textContent.includes('Deleted movie delete'),'offline delete');
  await sleep(300);assert.equal(requestCount,before,'UI offline mode sends zero HTTP requests');
  let doc=await remote.get('parent');assert.equal(doc.docs.length,3);assert.equal(doc.docs.find(m=>m._id==='update').title,'update');
  offline(a,false);await until(async()=>{const d=await remote.get('parent');return d.docs.some(m=>m._id==='created')&&!d.docs.some(m=>m._id==='delete')&&d.docs.find(m=>m._id==='update').title==='Updated offline';},'offline CRUD reaches CouchDB-compatible endpoint');
  const b=await client('B');
  // Wait for A to receive the same revision before editing two copies independently.
  await until(async()=>(await a.w.eval('db.get("parent")'))._rev===(await remote.get('parent'))._rev,'shared base revision');
  offline(a,true);await edit(a,'conflict','LOCAL CHOICE');await edit(b,'conflict','REMOTE CHOICE');
  await until(async()=>(await remote.get('parent')).docs.find(m=>m._id==='conflict').title==='REMOTE CHOICE','client B uploaded');
  offline(a,false);await until(()=>!a.$('conflictSection').hidden,'conflict banner');
  a.$('conflictList').querySelector('button').click();await until(()=>a.$('conflictViewer').querySelectorAll('.version').length===2,'two conflict versions');
  const chosen=[...a.$('conflictViewer').querySelectorAll('.version')].find(x=>x.textContent.includes('LOCAL CHOICE'));assert.ok(chosen);chosen.querySelector('button').click();
  await until(()=>a.$('message').textContent.includes('Conflict resolution saved locally'),'resolution saved');
  await until(async()=>{const d=await remote.get('parent',{conflicts:true});return !d._conflicts&&d.docs.find(m=>m._id==='conflict').title==='LOCAL CHOICE';},'resolved content uploaded');
  a.$('verifyId').value='conflict';a.$('verifyForm').requestSubmit();await until(()=>a.$('remoteResult').textContent.includes('LOCAL CHOICE'),'remote verification');
  assert.match(a.$('remoteResult').textContent,/READ FROM COUCHDB/);
  // Reopen the same IndexedDB with a new PouchDB instance; local data is durable.
  const persisted=await a.w.eval('(async()=>{const second=new PouchDB(db.name);const d=await second.get("parent");await second.close();return d;})()');
  assert.ok(persisted.docs.some(m=>m._id==='created'));
  assert.deepEqual(scriptErrors,[]);
 }finally{
  for(const w of windows){try{await w.eval('(async()=>{replication?.disconnect();changeFeed?.cancel();if(db)await db.close();})()');}catch{}w.close();}
  await remote.destroy();backendServer.closeAllConnections();frontendServer.closeAllConnections();await Promise.all([new Promise(r=>backendServer.close(r)),new Promise(r=>frontendServer.close(r))]);
 }
});
