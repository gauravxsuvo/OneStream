# OneStream

A small, self-hosted watch-together / listen-together app for a private group of friends.
Upload music and videos, drop into a room, and playback stays in sync for everyone in it —
plus a lightweight chat.

## How it works

- **Next.js (App Router)** for the UI and API routes.
- A **custom Node server** (`server.js`) wraps Next.js and attaches **Socket.IO** to the same
  HTTP server, so playback sync, presence, and chat are all real-time over one connection.
- **Prisma + PostgreSQL** stores media metadata, rooms, and chat history.
- **One shared passcode** (`ONESTREAM_PASSCODE`) gates the whole app — there are no user
  accounts. Everyone who has the passcode picks a display name and shares the library and rooms.
- Uploads stream straight to disk (or S3-compatible object storage, if configured) without ever
  buffering the whole file in memory, so movie-sized files work fine on a small container.

## Project layout

```
server.js                    custom server: Next.js + Socket.IO + the room/presence/chat logic
middleware.ts                passcode gate (protects every route except /enter)
prisma/schema.prisma         Media, Room, ChatMessage models
src/app/                     pages: / (home), /library, /room/[code], /enter, /api/*
src/components/              Player, Chat, RoomView, UploadForm, MediaList, ...
src/lib/storage.ts           local-disk / S3 upload + streaming abstraction
```

## Local development

1. **Start Postgres** (Docker required):
   ```
   docker compose up -d
   ```
2. **Configure env vars** — copy `.env.example` to `.env` (already done if you're continuing
   from setup) and set at least `ONESTREAM_PASSCODE`. The default `DATABASE_URL` matches the
   `docker compose` service above.
3. **Install deps and sync the schema**:
   ```
   npm install
   npx prisma db push
   ```
4. **Run it**:
   ```
   npm run dev
   ```
   Open http://localhost:3000, enter your passcode, upload something in the Library, then
   create a room and share the code/link with a friend (open a second browser/incognito window
   to try it solo).

## Deploying on Portways

This repo is a plain Node/`package.json` project, so Portways builds it with no extra
configuration: `npm install` → `npm run build` (runs `next build`) → `npm start` (applies the
Prisma schema, then starts `server.js`, which listens on `process.env.PORT` as required).

Steps:

1. **Create the project** pointing at this repo (root directory = repo root).
2. **Link a Postgres add-on** to the project *before the first deploy* — `DATABASE_URL` is
   injected automatically, and `npm start` runs `prisma db push` against it on every boot.
3. **Link an Object Storage (S3) add-on** too (Databases tab → create one → link it to this
   project) — see below. Recommended, not required.
4. **Set env vars** (Env tab): at minimum `ONESTREAM_PASSCODE`.
5. Deploy. Since there's no `Dockerfile`, Portways just needs `package.json` at the root, which
   is already the case.

### Storage: local disk vs. object storage

By default, uploads are written to `./data/uploads` inside the container. **That's fine for a
single always-on container, but it is *not* durable across redeploys** — Portways recreates the
container's filesystem on every deploy, so a redeploy (e.g. shipping a bug fix) wipes the media
library.

For anything you want to keep, link a Portways **Object Storage (S3)** add-on to the project —
it's a self-hosted, S3-compatible bucket, created and linked the same way as the Postgres add-on.
Linking injects `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
and `S3_FORCE_PATH_STYLE` automatically — `src/lib/storage.ts` picks these up with zero extra
config, and uploads/playback switch from disk to the bucket immediately. No external provider
needed, though any other S3-compatible service (AWS S3, Cloudflare R2, Backblaze B2, ...) works
too if you'd rather set the same six vars by hand — see `.env.example`.

### Don't turn on autoscaling

Room presence and Socket.IO connections are kept in-memory in `server.js` for simplicity. That's
correct for the single-container mode Portways uses by default, but it **breaks under
autoscaling** — with two replicas, "who's in the room" and playback sync would only be visible
to whichever replica each person happened to land on. Keep this project in single-container
mode. (If you ever outgrow that, the fix is the Socket.IO Redis adapter plus moving room state
out of `server.js`'s in-memory `Map` — not implemented here, in the interest of staying
lightweight.)

## Notes / intentional simplifications

- **No user accounts.** A shared passcode plus a per-browser display name (stored in
  `localStorage`) is the whole auth model — appropriate for a small trusted friend group, not a
  public product.
- **`prisma db push` instead of migrations.** There's no `prisma/migrations` history; the schema
  is pushed directly on every boot. Simpler for a single-developer project; switch to
  `prisma migrate` if you want migration history later.
- **No queue.** A room has one "now playing" item at a time, picked from the shared library.
  Anyone in the room can change it.
- **Sync strategy is intentionally simple**: play/pause/seek broadcast immediately to the room,
  with a small clock-based correction for network latency. There's no continuous drift
  correction — fine for casual watch parties, not frame-accurate.
