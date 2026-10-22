'use strict';
const $ = id => document.getElementById(id);
const client = new URLSearchParams(location.search).get('client') === 'B' ? 'B' : 'A';
const configKey = `q15-v2-settings-${client}`;
const offlineKey = `q15-v2-offline-${client}`;
let db, store, replication, changeFeed, config, edit = null, page = 0, renderId = 0, conflictSnapshot = null;
let writeCounter = 0;
const PAGE_SIZE = 25;
$('clientLabel').textContent = `— Client ${client}`;
$('clientLink').href = `/?client=${client === 'A' ? 'B' : 'A'}`;
$('clientLink').textContent = `Open independent client ${client === 'A' ? 'B' : 'A'} for the conflict test`;
function log(text) { $('log').textContent = `[${new Date().toLocaleTimeString()}] ${text}\n` + $('log').textContent.slice(0,22000); }
function notify(text) { $('message').textContent = text; log(text); }
function fail(error) { notify(error.status === 409 ? 'STALE EDIT: the document changed since you opened it. Your values are still in the form. Reopen the movie before saving again.' : `ERROR: ${error.message || error}`); }
function button(text, fn) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
  b.onclick = async () => { b.disabled = true; try { await fn(); } catch(e) { fail(e); } finally { b.disabled = false; } };
  return b;
}
function networkLabel() {
  const offline = $('offline').checked || !navigator.onLine;
  $('network').textContent = $('offline').checked ? 'OFFLINE MODE: replication blocked. CRUD saves only to this browser.' : !navigator.onLine ? 'OFFLINE: browser reports no network. CRUD saves only to this browser.' : 'Network available. See both replication directions below for connection results.';
  $('network').className = offline ? 'offline' : 'online';
  $('verify').disabled = offline || !replication?.enabled;
}
function resetEditor() { edit = null; $('movieForm').reset(); $('movieId').disabled = false; $('editorTitle').textContent = '2. Add a movie'; }
function markWrite(result, verb, id) {
  writeCounter++;
  notify(`${verb} movie ${id} LOCALLY. Document revision: ${result.rev}. ${replication?.allowed() ? 'Automatic replication scheduled.' : 'Awaiting reconnection; no upload requested.'}`);
  $('lastSync').textContent = 'Local change saved — awaiting a completed replication cycle';
  replication?.wake();
}
function readConfig() {
  const url = new URL($('remote').value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.split('/').filter(Boolean).length !== 1) throw new Error('Use only the database URL, e.g. http://localhost:5984/movies-schema-a. Enter credentials separately.');
  const mode = $('mode').value, parentId = $('parentId').value.trim();
  if (mode === 'array' && (!parentId || parentId.startsWith('_'))) throw new Error('Enter the ID of the existing parent document containing docs.');
  return {url:url.href.replace(/\/$/, ''), mode, parentId, username:$('username').value};
}
async function openWorkspace(settings) {
  config = settings;
  // Separate local storage for each target, schema layout and independent client.
  const key = encodeURIComponent(JSON.stringify([settings.url, settings.mode, settings.mode === 'array' ? settings.parentId : '', client]));
  db = new PouchDB(`q15-v2-${key}`);
  store = new MovieStore(db, settings.mode, settings.parentId);
  const copy = {url:settings.url,mode:settings.mode,parentId:settings.parentId,username:settings.username};
  localStorage.setItem(configKey, JSON.stringify(copy));
  ['remote','mode','parentId'].forEach(id => $(id).disabled = true);
  $('workspace').textContent = `Client ${client} | Target: ${settings.url} | ${settings.mode === 'array' ? 'Parent document: ' + settings.parentId : 'Separate movie documents'}`;
  let syncWriteCounter = 0;
  replication = new MovieReplicator({PouchDB,db,...settings,
    browserOnline:() => navigator.onLine,
    onState:states => {
      $('push').textContent = states.push; $('pull').textContent = states.pull;
      networkLabel();
    },
    onEvent:log,
    onStart:() => { syncWriteCounter = writeCounter; },
    onPull:async () => {
      if (settings.mode === 'array') await store.parent();
      await render();
    },
    onCycle:async () => {
      // This timestamp reports a completed cycle, not a claim that concurrent edits cannot occur.
      $('lastSync').textContent = `${new Date().toLocaleTimeString()} — pull and push completed. ${syncWriteCounter === writeCounter ? 'Use the remote check below to verify a particular movie.' : 'A local edit happened during this cycle; another cycle is scheduled.'}`;
      await render();
    }
  });
  replication.setOffline($('offline').checked);
  changeFeed = db.changes({since:'now',live:true}).on('change', () => render().catch(fail)).on('error',fail);
  await render(); networkLabel();
}
$('connection').onsubmit = async event => {
  event.preventDefault(); $('connect').disabled = true;
  try {
    if (!db) await openWorkspace(readConfig());
    replication.connect($('username').value, $('password').value);
    log(`Automatic replication enabled for ${config.url}. Storage: ${config.mode}${config.mode === 'array' ? '; parent ' + config.parentId : ''}.`);
  } catch(e) { fail(e); } finally { $('connect').disabled = false; networkLabel(); }
};
$('change').onclick = async () => {
  if (db && !confirm('Switch connection settings? Existing local data is retained in its own workspace.')) return;
  replication?.disconnect(); changeFeed?.cancel();
  if (db) await db.close();
  db = null; store = null; replication = null; config = null; renderId++;
  localStorage.removeItem(configKey);
  ['remote','mode','parentId'].forEach(id => $(id).disabled = false);
  resetEditor(); $('editor').disabled = true; $('movies').replaceChildren(); $('conflictSection').hidden = true;
  $('workspace').textContent = 'Enter the database settings and connect.'; $('count').textContent = ''; networkLabel();
};
$('mode').onchange = () => { $('parentLabel').hidden = $('mode').value !== 'array'; };
$('offline').checked = localStorage.getItem(offlineKey) === 'true';
$('offline').onchange = () => {
  localStorage.setItem(offlineKey, String($('offline').checked));
  replication?.setOffline($('offline').checked); networkLabel();
  notify($('offline').checked ? 'OFFLINE enabled: active replication cancelled and new CouchDB requests blocked. Local editing remains available.' : 'OFFLINE disabled: automatic synchronization resumes if you have connected this session.');
};
for (const event of ['offline','online']) window.addEventListener(event, () => { replication?.networkChanged(); networkLabel(); log(`Browser network event: ${event}.`); });
$('cancel').onclick = resetEditor;
$('movieForm').onsubmit = async event => {
  event.preventDefault(); $('save').disabled = true;
  try {
    const fields = {title:$('title').value.trim(), actors:$('actors').value.split(',').map(x=>x.trim()).filter(Boolean), genres:$('genres').value.split(',').map(x=>x.trim()).filter(Boolean)};
    const id = edit ? edit.movie._id : $('movieId').value.trim() || `movie-${crypto.randomUUID()}`;
    const result = edit ? await store.update(edit,fields) : await store.create({_id:id,...fields});
    markWrite(result, edit ? 'Updated' : 'Created', id); resetEditor(); await render();
  } catch(e) { fail(e); } finally { $('save').disabled = false; }
};
async function render() {
  if (!store) return;
  const sequence = ++renderId, data = await store.read();
  if (sequence !== renderId) return;
  $('editor').disabled = !data.ready || (config.mode === 'array' && data.conflicts.length > 0);
  $('storageNote').textContent = !data.ready ? 'First connection required: download the existing parent document before editing offline. Check its ID above.' : config.mode === 'array' ? 'Edits change movies inside the parent document’s docs array. Those parent-document revisions replicate to CouchDB.' : data.hasWrapper ? 'This database also contains a docs wrapper. This workspace edits only separate movie documents; use array mode to edit the wrapper.' : 'Each movie is a separate local document.';
  const query = $('search').value.toLowerCase().trim();
  const movies = data.movies.filter(d => `${d._id} ${d.title}`.toLowerCase().includes(query)).sort((a,b)=>a._id.localeCompare(b._id,undefined,{numeric:true}));
  const maxPage = Math.max(0,Math.ceil(movies.length/PAGE_SIZE)-1); page = Math.min(page,maxPage);
  $('count').textContent = `(${data.movies.length})`;
  $('pageLabel').textContent = `Page ${page+1} of ${maxPage+1} · ${movies.length} matching`;
  $('previous').disabled = page === 0; $('next').disabled = page === maxPage;
  $('movies').replaceChildren();
  for (const movie of movies.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)) {
    const row = document.createElement('tr');
    for (const text of [movie._id,movie.title,movie.actors.join(', '),movie.genres.join(', ')]) { const cell=document.createElement('td'); cell.textContent=text; row.append(cell); }
    const actions=document.createElement('td');
    actions.append(button('Edit',async()=>{
      edit=await store.snapshot(movie._id); $('movieId').value=edit.movie._id; $('movieId').disabled=true;
      $('title').value=edit.movie.title; $('actors').value=edit.movie.actors.join(', '); $('genres').value=edit.movie.genres.join(', ');
      $('editorTitle').textContent=`2. Edit ${movie._id} · base revision ${edit.document._rev}`; $('title').focus();
    }),button('Delete',async()=>{
      const snapshot=await store.snapshot(movie._id);
      if (!confirm(`Delete ${snapshot.movie.title}? This saves locally and replicates when connected.`)) return;
      const result=await store.remove(snapshot); markWrite(result,'Deleted',movie._id); if(edit?.movie._id===movie._id) resetEditor(); await render();
    }),button('Check CouchDB',async()=>{ $('verifyId').value=movie._id; await verify(); }));
    row.append(actions); $('movies').append(row);
  }
  $('conflictSection').hidden = !data.conflicts.length;
  $('conflictHeading').textContent = `Conflicts detected in ${data.conflicts.length} document(s)`;
  $('conflictList').replaceChildren();
  for (const doc of data.conflicts) $('conflictList').append(button(`Inspect ${doc._id}: ${doc._conflicts.length+1} versions`,()=>showConflict(doc._id)));
  if (!data.conflicts.length) { $('conflictViewer').replaceChildren(); conflictSnapshot=null; }
}
$('search').oninput=()=>{page=0;render().catch(fail);};
$('previous').onclick=()=>{page--;render().catch(fail);};
$('next').onclick=()=>{page++;render().catch(fail);};
async function showConflict(id) {
  const snapshot=await store.versions(id); conflictSnapshot=snapshot;
  const viewer=$('conflictViewer'); viewer.replaceChildren();
  if (snapshot.revs.length<2) { await render(); return; }
  const intro=document.createElement('p');intro.textContent=config.mode==='array' ? 'Array mode: this conflict covers the WHOLE parent document. Choosing a version replaces the entire movie array, including any other edits in that version. Differences are listed below.' : 'Choose which complete movie version to keep.'; viewer.append(intro);
  let changedIds=[];
  if(config.mode==='array') {
    const maps=snapshot.documents.map(d=>new Map((d.docs||[]).map(m=>[m._id,m])));
    const ids=new Set(maps.flatMap(m=>[...m.keys()]));
    changedIds=[...ids].filter(id=>new Set(maps.map(m=>JSON.stringify(m.get(id)??null))).size>1);
  }
  for(const doc of snapshot.documents) {
    const box=document.createElement('div');box.className='version';
    const heading=document.createElement('strong');heading.textContent=`${doc._rev===snapshot.winner?'Database winner':'Conflicting version'} — ${doc._rev}`;
    const pre=document.createElement('pre');pre.textContent=JSON.stringify(config.mode==='array' ? changedIds.map(id=>({movieId:id,movie:doc.docs?.find(m=>m._id===id)??'DELETED / ABSENT'})) : doc,null,2);
    box.append(heading,pre,button(config.mode==='array'?'Keep this entire document version':'Keep this movie version',async()=>{
      if(!confirm('Keep this content and delete the other observed conflicting branches?'))return;
      const result=await store.resolve(snapshot,doc._rev);writeCounter++;resetEditor();
      notify(`Conflict resolution saved locally. Remaining conflicts: ${result.remaining}. Synchronization will replicate the resolution.`);
      replication.wake();await render();
    }));viewer.append(box);
  }
}
async function verify() {
  if(!replication?.allowed())throw new Error('Remote checking is unavailable offline. Reconnect first.');
  const id=$('verifyId').value.trim();if(!id)throw new Error('Enter a movie ID to check.');
  const target=config.mode==='array'?config.parentId:id;
  const url=`${config.url}/${encodeURIComponent(target)}?conflicts=true`;
  try {
    const remoteDoc=await replication.remote.get(target,{conflicts:true});
    const movie=config.mode==='array'?remoteDoc.docs?.find(m=>m._id===id):remoteDoc;
    $('remoteResult').textContent=`READ FROM COUCHDB: ${url}\nParent/document revision: ${remoteDoc._rev}\nConflicting branches: ${remoteDoc._conflicts?.length||0}\n\n${movie?JSON.stringify(movie,null,2):'Movie '+id+' is ABSENT from the remote docs array.'}`;
    log(`Remote check: movie ${id} ${movie?'found':'absent'} in ${config.url}.`);
  } catch(e) {
    if(e.status===404) { $('remoteResult').textContent=`READ FROM COUCHDB: ${url}\nDocument absent (404 ${e.reason||e.message}).`;log(`Remote check: ${target} absent in ${config.url}.`); }
    else throw e;
  }
}
$('verifyForm').onsubmit=async e=>{e.preventDefault();$('verify').disabled=true;try{await verify();}catch(error){fail(error);}finally{networkLabel();}};
(async()=>{
  try {
    const saved=localStorage.getItem(configKey) || (client==='B'?localStorage.getItem('q15-v2-settings-A'):null);
    if(saved){const settings=JSON.parse(saved);$('remote').value=settings.url;$('mode').value=settings.mode;$('parentId').value=settings.parentId;$('username').value=settings.username||'admin';$('mode').onchange();await openWorkspace(settings);}
    networkLabel();
    if('serviceWorker' in navigator)await navigator.serviceWorker.register('/sw.js');
  }catch(e){fail(e);}
})();
