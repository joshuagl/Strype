/// <reference lib="webworker" />
import { serviceWorkerFetchListener } from "sync-message";
// Note: this worker is built before development run and production build and placed into
// public/compiled-service-worker.js.  Should you edit this file (which should be rare),
// you will need to restart the development server to see the changes.

declare let self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
    // Logged (temporarily -- see isServiceWorkerChannelResponsive() in shared_helpers.ts) to help
    // confirm whether the browser is silently terminating/respawning this worker mid-session even
    // while the controlled page stays foregrounded the whole time: a fresh "install" appearing
    // long after the page loaded, with no matching page reload, would indicate exactly that.
    console.info(`[SW ${new Date().toISOString()}] install`);
    self.skipWaiting(); // activate immediately
});

self.addEventListener("activate", (event) => {
    console.info(`[SW ${new Date().toISOString()}] activate`);
    // Claim clients immediately so pages are controlled without reload
    event.waitUntil(self.clients.claim());
});

// Re-claim all clients on demand — needed for Firefox where a new page
// that opens after the SW is already activated won't be auto-claimed:
self.addEventListener("message", (event) => {
    if (event.data === "claim") {
        self.clients.claim().then(() => {
            event.source?.postMessage("claimed");
        });
    }
});

const syncMessageFetchListener = serviceWorkerFetchListener();

self.addEventListener("fetch", (e) => {
    if (e instanceof FetchEvent) {
        syncMessageFetchListener(e);
    }
});
