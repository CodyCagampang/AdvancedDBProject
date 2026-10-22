const test=require('node:test');
const assert=require('node:assert/strict');
const PouchDB=require('pouchdb').plugin(require('pouchdb-adapter-memory'));
const express=require('express');
const expressPouchDB=require('express-pouchdb');
const {MovieStore}=require('../public/database.js');
const {MovieReplicator}=require('../public/replication.js');
const movie=(id,title=id)=>({_id:id,title,actors:['Actor'],genres:['Drama']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message){const end=Date.now()+12000;while(Date.now()<end){try{if(await fn())return;}catch{}await sleep(40);}throw new Error('Timed out: '+message);}

for(const mode of ['array','documents'])test(`${mode}: offline CRUD, reconnection, conflict detection/resolution and stale edit`,async()=>{
 const a=new PouchDB(`local-${mode}`,{adapter:'memory'}), b=new PouchDB(`remote-${mode}`,{adapter:'memory'});
 const store=new MovieStore(a,mode,'parent');
 try{
  if(mode==='array')await b.put({_id:'parent',docs:[movie('update'),movie('delete'),movie('conflict')]});
  else await b.bulkDocs([movie('update'),movie('delete'),movie('conflict')]);
  await a.replicate.from(b);
  await store.create(movie('created','Created offline'));
  await store.update(await store.snapshot('update'),{title:'Updated offline'});
  await store.remove(await store.snapshot('delete'));
  const remoteStore=new MovieStore(b,mode,'parent');
  const before=(await remoteStore.read()).movies;
  assert.equal(before.find(d=>d._id==='update').title,'update');
  assert.ok(before.some(d=>d._id==='delete'));assert.ok(!before.some(d=>d._id==='created'));
  const local=(await store.read()).movies;assert.ok(local.some(d=>d._id==='created'));assert.ok(!local.some(d=>d._id==='delete'));
  await a.sync(b);
  const after=(await remoteStore.read()).movies;
  assert.equal(after.find(d=>d._id==='update').title,'Updated offline');assert.ok(after.some(d=>d._id==='created'));assert.ok(!after.some(d=>d._id==='delete'));
  // Same shared revision, two independently edited copies.
  await store.update(await store.snapshot('conflict'),{title:'Local version'});
  await remoteStore.update(await remoteStore.snapshot('conflict'),{title:'Remote version'});
  await a.sync(b);
  const conflicts=(await store.read()).conflicts;assert.equal(conflicts.length,1);
  const versions=await store.versions(mode==='array'?'parent':'conflict');assert.equal(versions.revs.length,2);
  const chosen=versions.documents.find(d=>(mode==='array'?d.docs.find(m=>m._id==='conflict'):d).title==='Local version');
  assert.ok(chosen);assert.equal((await store.resolve(versions,chosen._rev)).remaining,0);
  await a.sync(b);
  assert.equal((await remoteStore.read()).conflicts.length,0);
  assert.equal((await remoteStore.read()).movies.find(d=>d._id==='conflict').title,'Local version');
  const stale=await store.snapshot('conflict');await store.update(await store.snapshot('conflict'),{title:'Newer'});
  await assert.rejects(store.update(stale,{title:'Stale overwrite'}),e=>e.status===409);
 }finally{await a.destroy();await b.destroy();}
});

test('HTTP replication controller: offline gate, auto reconnection, two directions and failure status',async()=>{
 const ServerDB=PouchDB.defaults({adapter:'memory',prefix:'http-test-'});
 const app=express();let requests=0,unavailable=false;
 app.use((req,res,next)=>{requests++;if(unavailable)return res.status(503).json({error:'unavailable',reason:'test outage'});next();});
 app.use(expressPouchDB(ServerDB,{mode:'minimumForPouchDB',inMemoryConfig:true,logPath:'/tmp/q15-v2-test.log'}));
 const serverDB=new ServerDB('movies');await serverDB.put(movie('base'));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const db=new PouchDB('http-client',{adapter:'memory'});const store=new MovieStore(db,'documents');
 let browserOnline=true,cycles=0,states={};
 const rep=new MovieReplicator({PouchDB,db,url:`http://127.0.0.1:${server.address().port}/movies`,mode:'documents',browserOnline:()=>browserOnline,interval:100,onEvent:console.log,onState:s=>states=s,onCycle:()=>cycles++});
 try{
  rep.connect('admin','test');await until(()=>cycles>0,'initial synchronization');
  assert.equal((await db.get('base')).title,'base');
  rep.setOffline(true);await sleep(200);const count=requests;
  await store.create(movie('offline-create'));await store.update(await store.snapshot('base'),{title:'offline-update'});rep.wake();
  await sleep(400);assert.equal(requests,count,'No HTTP requests while forced offline');assert.equal((await serverDB.get('base')).title,'base');
  await assert.rejects(serverDB.get('offline-create'),e=>e.status===404);
  await assert.rejects(rep.guardedFetch('http://example.invalid'),/Offline mode/);
  const prior=cycles;rep.setOffline(false);
  await until(async()=>cycles>prior&&(await serverDB.get('base')).title==='offline-update','auto reconnect upload');await serverDB.get('offline-create');
  browserOnline=false;rep.networkChanged();await sleep(100);const count2=requests;
  await store.remove(await store.snapshot('offline-create'));rep.wake();await sleep(250);assert.equal(requests,count2);
  browserOnline=true;rep.networkChanged();await until(async()=>{try{await serverDB.get('offline-create');return false;}catch(e){return e.status===404;}},'automatic deletion replication');
  unavailable=true;rep.wake();await until(()=>states.push.includes('NOT synchronized'),'visible server failure');
  assert.ok(!states.push.startsWith('OK'));
  await store.create(movie('after-outage'));unavailable=false;
  await until(async()=>!!(await serverDB.get('after-outage')),'automatic retry after server outage');
 }finally{rep.disconnect();await sleep(100);await db.destroy();await serverDB.destroy();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
