const CACHE_NAME = "project-hub-v3";
const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png"
];

// Install event - cache core assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch event - NETWORK-FIRST strategy for HTML/JS/CSS
// Ensures latest version is always fetched when online
self.addEventListener("fetch", (event) => {
    // Skip non-GET requests
    if (event.request.method !== "GET") return;

    // Skip external requests (CDN, APIs)
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;

    // Network-first for core assets (html, js, css)
    if (url.pathname.match(/\.(html|css|js)$/) || url.pathname === "/" || url.pathname.endsWith("/")) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    // Update cache with fresh response
                    if (networkResponse.ok) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Fallback to cache when offline
                    return caches.match(event.request).then((cached) => {
                        return cached || caches.match("./index.html");
                    });
                })
        );
        return;
    }

    // Cache-first for static assets (images, icons)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse.ok && url.pathname.match(/\.(png|json|ico|svg)$/)) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            if (event.request.destination === "document") {
                return caches.match("./index.html");
            }
        })
    );
});
