const CACHE_NAME = 'vanrakshak-shell-v2'

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const response = await fetch('/')
    if (!response.ok) throw new Error('App shell could not be cached')

    const html = await response.clone().text()
    await cache.put('/', response.clone())
    await cache.put('/index.html', response.clone())

    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)]
      .map(match => new URL(match[1], self.location.origin).href)
    await Promise.all(assets.map(async asset => {
      try {
        const assetResponse = await fetch(asset)
        if (assetResponse.ok) await cache.put(asset, assetResponse)
      } catch (_) {}
    }))

    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames
      .filter(name => name.startsWith('vanrakshak-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (/^\/(auth|incidents|danger-zones|rangers|weather|advisories|coverage|trips|identity)(\/|$)/.test(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (
      await caches.match('/index.html') || Response.error()
    )))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })())
  }
})