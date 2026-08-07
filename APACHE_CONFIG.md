# Apache caching config for strype.org

This documents the `Cache-Control` policy the production Apache server
(`strype.org/editor`) should apply. It's **not** applied via a `.htaccess`
file in this repo — add it to the main server/vhost config instead. Requires
`mod_headers`.

## Why

Investigating a report of the Run button getting permanently stuck on
"Initialising..." (2026-08-07) traced back to: a tab left open across a
deploy, whose already-loaded page still referenced a JS chunk by the
content hash of the *previous* build. When Strype tried to spin up a new
background Pyodide worker using that stale URL, the file no longer existed
on the server (GitHub Pages' single-deployment scheme replaces the whole
site on every deploy) — a permanent, unrecoverable 404 with no way for the
client to fix it locally.

Checking the live server (`curl -I`) at the time showed the deeper cause:
**every** asset on `strype.org/editor`, including the content-hashed chunks
that are supposed to be safe to cache forever, was being served with
`Cache-Control: public, no-cache, max-age=0, must-revalidate`. That forces a
revalidation round-trip on every fetch — for a page that's stayed open a
while, that's a real chance of asking the server for a file whose hash has
since rotated out from under it, and getting a 404 with nothing to fall
back to. It's also just wasteful: the Pyodide runtime alone is tens of MB
that gets revalidated (or fully re-fetched, depending on the client's own
cache) on every load.

The **goal** is that once a page has fully loaded, Strype should never need
to talk to the server again during normal operation (loading a new data
file or library is the one deliberate exception) — matching how
content-hashed build output is meant to be cached.

## What to change

Scoped to `/editor/` and `/microbit/` specifically -- the two Strype
platform builds actually deployed on this server -- rather than a
server-wide rule, since the same Apache instance serves other things too
that this policy has no business touching. Split by file type within that
scope, rather than one blanket rule for everything under those paths:

```apache
<LocationMatch "^/(editor|microbit)/">
    # --- Vite's content-hashed build output: safe to cache forever ---
    # Vite names every hashed JS/CSS chunk "<name>-<hash>.<ext>" (e.g.
    # index-QHEbX0xQ.js, python-execution-Dmw0KcAm.js) -- the hash changes
    # whenever the content does, so the browser can keep a cached copy
    # indefinitely without ever serving stale content.
    #
    # Deliberately does NOT match files without a hash suffix, e.g. the
    # Pyodide files vite-plugin-static-copy copies into assets/ unmodified
    # (see viteStaticCopyPyodide() in vite.config.mjs) -- their filenames
    # never change even when their content does, so they must NOT get this
    # treatment.
    <FilesMatch "-[A-Za-z0-9_]{6,12}\.(js|css)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>
</LocationMatch>

# --- The Pyodide runtime: also safe to cache forever, once versioned ---
# public/pyodide/<version>/ (built by scripts/download-pyodide-libs.cjs,
# referenced via indexURL in src/workers/python-execution.ts) is scoped by
# Pyodide's own version, so a future upgrade lands at a brand new path
# rather than overwriting this one in place -- nothing will ever change at
# a URL a browser has already fetched. (Only /editor/ actually ships this
# today -- micro:bit runs on-device, not via Pyodide -- but matching both
# costs nothing and doesn't need updating if that ever changes.)
<LocationMatch "^/(editor|microbit)/pyodide/[^/]+/">
    Header set Cache-Control "public, max-age=31536000, immutable"
</LocationMatch>
```

Everything else — `index.html`, `compiled-service-worker.js`, any other
unhashed file, and anything outside `/editor/` or `/microbit/` entirely —
should keep the existing short/no-cache handling. That's deliberate, not
an oversight: those are exactly the files that must always be fetched
fresh, since they're what tell the browser which hashed filenames (and
which Pyodide version) are current. Caching *those* long would defeat the
whole point, leaving a browser with no way to ever discover a new build.

`<LocationMatch>` needs to live in the main server config (`<VirtualHost>`
block or included file) — it isn't valid inside `.htaccess`.

## What this does not fully solve

Even with this in place, "never talk to the server again" is *very likely*
rather than absolutely guaranteed: a browser can still evict a cached
response under storage pressure (Safari in particular is aggressive about
this), which would send that one request back to the network. A page that
survives that would hit the same live-server assets (since nothing on the
server has moved), so it would very likely just succeed — but it's not a
hard guarantee the way a service-worker precache (Cache Storage, not the
HTTP cache) would be. That's a bigger, separate piece of work (Workbox is
already an unused dependency in `package.json`, left over from an earlier
implementation, and would be the natural tool) that hasn't been done here.

## Out of scope: the GitHub Pages test site

`k-pet-group.github.io/Strype` (`build-pages-test-site.yml`) is capped at
`max-age=600` on everything — a hard GitHub Pages platform limitation, since
it doesn't support custom response headers at all. Not fixable from this
repo; probably an acceptable tradeoff for a fast-moving CI preview site.
