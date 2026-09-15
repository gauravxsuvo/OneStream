# OneStream

A small, self-hosted watch-together / listen-together app for a private group of friends.
There's one room, gated by one shared passcode. Anyone with the passcode picks a display name,
uploads music or video to the shared library, and playback stays in sync for everyone watching.
Chat included.

## How it works

- Next.js (App Router) for the UI and API routes.
- A custom Node server (`server.js`) wraps Next.js and attaches Socket.IO to the same HTTP
  server, so playback sync, presence, and chat are all real time over one connection.
- Prisma and PostgreSQL store media metadata, the room, and chat history.
- One shared passcode (`ONESTREAM_PASSCODE`) gates the whole app. No user accounts, no room
  codes, just the passcode and a display name.
- Uploads stream straight to disk (or S3-compatible object storage, if configured) without
  buffering the whole file in memory, so movie-sized files work fine on a small container.
- After upload, `ffmpeg-static` (bundled, no system install needed) probes the file and
  transcodes it in the background into a quality ladder: 144p up to 1080p for video, 128/256/320
  kbps for audio. Nothing above the source's own resolution or bitrate gets generated. The
  original file is playable right away while that runs, and a thumbnail gets pulled for video.
  Everyone picks their own playback quality independently, it's just a client-side choice like
  YouTube, not something that changes for the whole room.

## Project layout

```
server.js                    custom server: Next.js + Socket.IO + room/presence/chat/transcode wiring
middleware.ts                passcode gate (protects every route except /enter)
prisma/schema.prisma         Media, MediaRendition, Room, ChatMessage models
src/app/                     pages: / (the room), /enter, /api/*
src/components/              Player, Chat, RoomView, LibraryPanel, MediaList, StatsOverlay, ...
src/lib/transcode.ts         ffmpeg/ffprobe pipeline: probe, thumbnail, quality ladder
src/lib/storage.ts           local-disk / S3 upload + streaming abstraction
```

## Local development

1. Start Postgres (Docker required):
   ```
   docker compose up -d
   ```
2. Configure env vars: copy `.env.example` to `.env` (already done if you're continuing from
   setup) and set at least `ONESTREAM_PASSCODE`. The default `DATABASE_URL` matches the
   `docker compose` service above.
3. Install deps and sync the schema:
   ```
   npm install
   npx prisma db push
   ```
4. Run it:
   ```
   npm run dev
   ```
   Open http://localhost:3000, enter the passcode, pick a name, and upload something from the
   Library tab to start watching.

## Deploying on Portways

This repo is a plain Node / `package.json` project, so Portways builds it with no extra
configuration: `npm install`, then `npm run build` (generates the Prisma client, then runs
`next build`), then `npm start` (applies the Prisma schema, then starts `server.js`, which
listens on `process.env.PORT` as required).

`npm start` forces `NODE_ENV=production` itself (via `cross-env`, so it works the same on any
host) before starting `server.js`. That matters because `server.js` decides whether to serve the
already-built production output or boot Next's dev server off of `process.env.NODE_ENV`, and
Portways' auto-generated Dockerfile never sets it. Without this, the container would run in dev
mode, try to live-install missing dev tooling into a node_modules the build already pruned, and
the page would come back unstyled, which looks like a blank white screen for a dark-themed app.
You don't need to set `NODE_ENV` yourself anywhere, `npm start` already handles it.

`prisma generate` deliberately lives in the `build` script, not `postinstall`. Portways' Node
build copies `package*.json` and runs `npm install` before copying the rest of the source, so a
`postinstall` hook that needs `prisma/schema.prisma` fails with "schema not found." Running it as
the first half of `build` avoids that, since the full source is present by then.

Steps:

1. Create the project pointing at this repo (root directory = repo root).
2. Link a Postgres add-on to the project before the first deploy. `DATABASE_URL` gets injected
   automatically, and `npm start` runs `prisma db push` against it on every boot.
3. Link an Object Storage (S3) add-on too (Databases tab, create one, link it to this project).
   See below, recommended but not required.
4. Set env vars (Env tab): at minimum `ONESTREAM_PASSCODE`.
5. Deploy. There's no Dockerfile, Portways just needs `package.json` at the root, which is
   already the case.

`ffmpeg-static` and `ffprobe-static` download a prebuilt binary during `npm install`, no extra
setup needed on Portways' side. It adds real build time and disk (the binaries are tens of MB
each), and transcoding itself uses real CPU on every upload, so give the container enough
resources if uploads are frequent or large.

### Storage: local disk vs. object storage

By default, uploads (and their transcoded renditions and thumbnails) are written to
`./data/uploads` inside the container. That's fine for a single always-on container, but it is
not durable across redeploys. Portways recreates the container's filesystem on every deploy, so
a redeploy wipes the media library.

For anything you want to keep, link a Portways Object Storage (S3) add-on to the project, it's a
self-hosted, S3-compatible bucket, created and linked the same way as the Postgres add-on.
Linking injects `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
and `S3_FORCE_PATH_STYLE` automatically. `src/lib/storage.ts` picks these up with zero extra
config, and uploads, renditions, thumbnails, and playback all switch from disk to the bucket
immediately. No external provider needed, though any other S3-compatible service (AWS S3,
Cloudflare R2, Backblaze B2, ...) works too if you'd rather set the same six vars by hand, see
`.env.example`.

### Don't turn on autoscaling

Room presence, Socket.IO connections, and the transcode queue are all kept in-memory in
`server.js` for simplicity. That's correct for the single-container mode Portways uses by
default, but it breaks under autoscaling: with two replicas, "who's in the room" and playback
sync would only be visible to whichever replica each person landed on, and transcode jobs queued
on one replica would never run if the follow-up request lands on another. Keep this project in
single-container mode. (If you outgrow that, the fix is the Socket.IO Redis adapter plus moving
room and queue state out of `server.js`'s in-memory `Map`s, not implemented here, in the interest
of staying lightweight.)

## Notes and intentional simplifications

- No user accounts. A shared passcode plus a per-browser display name (stored in `localStorage`)
  is the whole auth model, appropriate for a small trusted friend group, not a public product.
- `prisma db push` instead of migrations. There's no `prisma/migrations` history, the schema is
  pushed directly on every boot. Simpler for a single-developer project, switch to
  `prisma migrate` if you want migration history later.
- No queue for what plays. The room has one "now playing" item at a time, picked from the shared
  library. Anyone in the room can change it.
- Sync strategy is intentionally simple: play/pause/seek broadcast immediately to the room, with
  a small clock-based correction for network latency. There's no continuous drift correction,
  fine for casual watch parties, not frame-accurate.
- Quality selection is manual, not adaptive. Each viewer picks a tier (or leaves it on Auto,
  which just means the highest ready tier at the moment they loaded the video). It won't
  downgrade mid-playback if their connection gets worse, the same tradeoff YouTube's older
  quality picker made before it defaulted to adaptive streaming.
