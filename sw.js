const CACHE='btb-v31';
self.addEventListener('install',e=>{
  e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  // Never cache btb-url.js or HTML — always fetch fresh
  if(url.pathname.endsWith('/btb-url.js')||e.request.mode==='navigate'){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)));
    return;
  }
  // Cross-origin requests are live API calls (GG.deals price checks, Steam
  // lookups, the Apps Script backend) — never static assets. Letting these
  // fall into the cache-first branch below means a repeat request with the
  // same URL (e.g. the same wishlist appids on the next price check) can
  // silently serve a stale cached response instead of hitting the network,
  // so route them straight to the network instead of caching them at all.
  if(url.origin!==self.location.origin){
    e.respondWith(fetch(e.request));
    return;
  }
  // Cache-first for static assets (JS, CSS, images, fonts)
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fresh=fetch(e.request).then(r=>{
        if(r&&r.status===200){
          const rc=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,rc));
        }
        return r;
      }).catch(()=>cached);
      return cached||fresh;
    })
  );
});
