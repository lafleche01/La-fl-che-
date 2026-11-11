const V="lf-v5",SHELL=["./","index.html","config.js","shim.js","logo_la_fleche.png","logo_mark.png","icon_180.png","icon_192.png","icon_512.png","favicon.png","manifest.webmanifest"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==location.origin||/\/(tuto|lp)_[^/]*$/.test(u.pathname))return;
  // réseau d'abord (toujours la dernière version), cache si hors ligne
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match("index.html"))))});
self.addEventListener("push",e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||"La Flèche",{body:d.body||"",icon:"icon_192.png",badge:"icon_192.png",tag:d.tag||undefined,renotify:!!d.tag,data:{url:d.url||"./"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||"./";
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{const c=l[0];if(c){return(c.navigate?c.navigate(url).catch(()=>c):Promise.resolve(c)).then(x=>(x||c).focus())}return self.clients.openWindow(url)}))});
