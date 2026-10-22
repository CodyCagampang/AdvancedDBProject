const CACHE='schema-a-movies-v2-shell-1';
const FILES=['/','/index.html','/style.css','/app.js','/database.js','/replication.js','/vendor/pouchdb.min.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  // Never intercept CouchDB traffic or cache database responses.
  if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).catch(()=>caches.match(e.request,{ignoreSearch:true})));
});
