// ═══════════════════════════════════════════════════════════════════════════════
// PUSH-ONLY SERVICE WORKER — wakes a CLOSED / backgrounded phone for an incoming
// call so Entrevoz can ring even when the app isn't open (the whole point of the
// store-and-forward ring: the push wakes the tab, the tab pulls the invite).
//
// CRITICAL: this worker has NO fetch handler and does NO caching. The previous
// stale-while-revalidate SW froze phones on old JS and was the root cause of the
// entire calling-reliability saga. A push-only worker can NEVER serve app code,
// so it cannot resurrect that failure mode.
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Belt-and-suspenders: delete any caches a legacy SW left behind.
    try {
      const names = await caches.keys()
      await Promise.all(names.map((n) => caches.delete(n)))
    } catch {}
    try { await self.clients.claim() } catch {}
  })())
})

// An incoming-call push. Payload is JSON: { room, type, fromName, fromLang, fromDevice }.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  const room = typeof data.room === 'string' ? data.room : ''
  const type = data.type === 'audio' ? 'audio' : 'video'
  const fromName = (typeof data.fromName === 'string' && data.fromName) || 'Someone'
  const title = `📞 ${fromName}`
  const body =
    type === 'audio'
      ? 'Incoming call · Llamada entrante'
      : 'Incoming video call · Videollamada entrante'
  const url =
    `/?ring=${encodeURIComponent(room)}&ctype=${type}` +
    (typeof data.fromDevice === 'string' && data.fromDevice
      ? `&from=${encodeURIComponent(data.fromDevice)}`
      : '')

  event.waitUntil(
    (async () => {
      // If a tab is already open (just backgrounded), tell it to ring NOW rather
      // than waiting for the user to tap — matches the "phone rings in your hand".
      try {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const c of clients) {
          try { c.postMessage({ type: 'entrevoz-ring-wake', room, ctype: type }) } catch {}
        }
      } catch {}
      await self.registration.showNotification(title, {
        body,
        tag: room ? `call-${room}` : 'call',
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [250, 120, 250, 120, 250],
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url, room, type },
        actions: [
          { action: 'answer', title: 'Answer' },
          { action: 'decline', title: 'Decline' },
        ],
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'decline') return
  const d = event.notification.data || {}
  const url = d.url || '/'
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clients) {
        if ('focus' in c) {
          try { c.postMessage({ type: 'entrevoz-ring-wake', room: d.room, ctype: d.type }) } catch {}
          try { await c.focus(); return } catch {}
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url)
    })(),
  )
})
