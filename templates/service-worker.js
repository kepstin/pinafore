const timestamp = '__timestamp__'
const ASSETS = `cache${timestamp}`

// `shell` is an array of all the files generated by webpack,
// `assets` is an array of everything in the `assets` directory
const to_cache = __shell__.concat(__assets__)
const cached = new Set(to_cache)

// `routes` is an array of `{ pattern: RegExp }` objects that
// match the pages in your app
const routes = __routes__

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then(cache => cache.addAll(to_cache))
      .then(() => {
        self.skipWaiting()
      })
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(async keys => {
      // delete old caches
      for (const key of keys) {
        if (key !== ASSETS) {
          await caches.delete(key)
        }
      }

      await self.clients.claim()
    })
  )
})

const NETWORK_ONLY = [
  '/oauth',
  '/api/v1/timelines'
]

const CACHE_FIRST = [
  '/system/accounts/avatars'
]

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)

  // don't try to handle e.g. data: URIs
  if (!url.protocol.startsWith('http')) {
  	return
  }

  // always serve assets and webpack-generated files from cache
  if (cached.has(url.pathname)) {
    event.respondWith(caches.match(req))
    return
  }

  // for pages, you might want to serve a shell `index.html` file,
  // which Sapper has generated for you. It's not right for every
  // app, but if it's right for yours then uncomment this section

  if (url.origin === self.origin && routes.find(route => route.pattern.test(url.pathname))) {
    event.respondWith(caches.match('/index.html'))
    return
  }

  // Non-GET and for certain endpoints (e.g. OAuth), go network-only
  if (req.method !== 'GET' ||
      NETWORK_ONLY.some(pattern => url.pathname.startsWith(pattern))) {
    //console.log('Using network-only for', url.href)
    event.respondWith(fetch(req))
    return
  }

  // For these, go cache-first.
  if (CACHE_FIRST.some(pattern => url.pathname.startsWith(pattern))) {
    //console.log('Using cache-first for', url.href)
    event.respondWith(caches
      .open(`offline${timestamp}`)
      .then(async cache => {
        let response = await cache.match(req)
        if (response) {
          // update asynchronously
          fetch(req).then(response => {
            cache.put(req, response.clone())
          })
          return response
        }
        response = await fetch(req)
        cache.put(req, response.clone())
        return response
      }))
    return
  }


  // for everything else, try the network first, falling back to
  // cache if the user is offline. (If the pages never change, you
  // might prefer a cache-first approach to a network-first one.)
  event.respondWith(caches
    .open(`offline${timestamp}`)
    .then(async cache => {
      try {
        //console.log('Using network-first for', url.href)
        const response = await fetch(req)
        cache.put(req, response.clone())
        return response
      } catch (err) {
        const response = await cache.match(req)
        if (response) {
          return response
        }

        throw err
      }
    })
  )
})
