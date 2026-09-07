# Homarr widget - Hermes Feed

Homarr's **Custom API widget** renders its JSX template in a sandbox that
rejects `fetch`, `window`, `document`, `eval`, `Function`, `import`,
`require`, and `globalThis` outright - so a real checkbox that persists a
click has no way to call an API from that sandbox. Link-based workarounds
(navigating to a toggle endpoint) still miss the actual ask: an interactive
control that updates in place.

So this isn't a Custom API widget config. It's a real page in the app,
`/rss/widget` ([app/rss/widget/page.tsx](app/rss/widget/page.tsx)), embedded
in Homarr as an **iframe / Website widget** pointing at:

```
https://hermes.somi.<WEBSITE_HOST>/rss/widget
```

That page is a normal client-rendered React page with a real `<input
type="checkbox">` wired to `PATCH /rss/feed/[id]/seen` via same-origin
`fetch` - no sandbox, no CORS, instant visual feedback (checking a box dims
the card and strikes the title immediately, no waiting on a data refresh).
It polls `/rss/feed/all` every 5 minutes to pick up new items.

Lives under `/rss/` (not `/api/` or `/`) for the same reason as the JSON
feed: Caddy only excludes `/rss/*` from the Authentik forward_auth gate, and
an iframe can't do an interactive SSO login - see
[Caddyfile.site](Caddyfile.site).

In Homarr: add a **Website/iframe widget** (not Custom API), paste the URL
above, and size it - the page itself scrolls internally past its own header,
so any iframe height works.
