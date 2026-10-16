// SELF-DESTRUCT SERVICE WORKER.
//
// The previous SW cached JS chunks with stale-while-revalidate. On a real-time
// CALLING app that ships critical fixes continuously, that was pure harm:
// installed phones kept running whatever JavaScript they first cached (dead
// ring listeners, no telemetry), and every fix silently never reached them —
// the single reason one device could stay broken while the other updated fine.
//
// This version takes over from any previously-installed SW (browsers fetch
// sw.js fresh on every update check, independent of the stale app bundle),
// deletes ALL caches, unregisters itself, and reloads controlled tabs so the
// next load comes straight from the network with no SW at all.

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys()
      await Promise.all(names.map((n) => caches.delete(n)))
    } catch {}
    try { await self.registration.unregister() } catch {}
    try {
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach((c) => { try { c.navigate(c.url) } catch {} })
    } catch {}
  })())
})

// No fetch handler — never intercept, never serve from cache.
