# Signaling relay

WebRTC needs a rendezvous point for peers to exchange connection info before
they can talk directly. This is that — the stock `y-webrtc-signaling` binary
(from the `y-webrtc` package), nothing custom. It never sees game state, only
connection setup traffic, and (when clients pass a `password`) that traffic is
encrypted anyway.

## Local dev

```
npm install
npm run dev
```

Runs on `ws://localhost:4444`. Point the client at it via `client/.env`
(`VITE_SIGNALING_URLS=ws://localhost:4444`, see `client/.env.example`).

## Deploying (free tier)

`npm start` binds to `process.env.PORT`, which is what Render/Fly.io set
automatically — no extra config needed beyond deploying this directory with
that as the start command.

Manual steps (do these yourself — an agent shouldn't be scripting account
creation or deploys):

1. Create a free account on [Render](https://render.com) or
   [Fly.io](https://fly.io).
2. New Web Service, point it at this repo/subdirectory, build command
   `npm install`, start command `npm start`.
3. Once deployed you'll get a `wss://<your-app>.onrender.com` (or similar)
   URL — put that in the client's `VITE_SIGNALING_URLS`.

Render's free tier sleeps after ~15 minutes of inactivity, so the first
connection after a lull will be slow while it wakes up. That's expected, not
a bug.
