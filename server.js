const { createServer } = require("node:http");
const crypto = require("node:crypto");
const next = require("next");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const socketPath = "/socket.io";

// OneStream is single-room: every passcode holder shares one room, so there's
// no create/join flow. Mirrors ROOM_CODE in src/lib/room.ts — keep both in
// sync if this ever changes (server.js can't import the TS module directly).
const ROOM_CODE = "MAIN";

const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// socketId -> displayName, kept in-memory since this app runs as a single container.
const members = new Map();
const ROOM_CHANNEL = `room:${ROOM_CODE}`;

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function parseCookie(header, name) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

function presence() {
  return Array.from(members.values());
}

// Kept alongside the room queries below so the currentMedia payload always
// matches the MediaItem shape the client expects (renditions included).
const CURRENT_MEDIA_INCLUDE = {
  include: {
    renditions: {
      select: { label: true, status: true, height: true, bitrateKbps: true, size: true },
    },
  },
};

function serializeRoom(room) {
  return {
    code: room.code,
    name: room.name,
    isPlaying: room.isPlaying,
    positionSec: room.positionSec,
    updatedAt: room.updatedAt,
    currentMedia: room.currentMedia,
  };
}

async function persistState(patch) {
  try {
    await prisma.room.update({ where: { code: ROOM_CODE }, data: { ...patch, updatedAt: new Date() } });
  } catch (err) {
    console.error(`[onestream] failed to persist room state:`, err.message);
  }
}

app.prepare().then(async () => {
  // Make sure the single room row exists before anyone connects.
  await prisma.room.upsert({
    where: { code: ROOM_CODE },
    update: {},
    create: { code: ROOM_CODE, name: "OneStream" },
  });

  const httpServer = createServer((req, res) => {
    // Let socket.io's own request listener (registered below) handle its own path;
    // everything else goes through Next.
    if (req.url && req.url.startsWith(socketPath)) return;
    handle(req, res);
  });

  const io = new Server(httpServer, { path: socketPath });

  io.use((socket, next2) => {
    const passcode = process.env.ONESTREAM_PASSCODE;
    if (!passcode) return next2();
    const token = parseCookie(socket.handshake.headers.cookie, "onestream_auth");
    if (token && token === sha256Hex(passcode)) return next2();
    next2(new Error("unauthorized"));
  });

  io.on("connection", (socket) => {
    socket.on("room:join", async ({ name }) => {
      const displayName = String(name || "Guest").slice(0, 40);
      members.set(socket.id, displayName);
      socket.join(ROOM_CHANNEL);
      io.to(ROOM_CHANNEL).emit("room:presence", presence());

      const room = await prisma.room.findUnique({
        where: { code: ROOM_CODE },
        include: { currentMedia: CURRENT_MEDIA_INCLUDE },
      });
      if (room) socket.emit("room:state", serializeRoom(room));
    });

    socket.on("player:play", async ({ positionSec }) => {
      await persistState({ isPlaying: true, positionSec });
      socket.to(ROOM_CHANNEL).emit("player:play", { positionSec, at: Date.now() });
    });

    socket.on("player:pause", async ({ positionSec }) => {
      await persistState({ isPlaying: false, positionSec });
      socket.to(ROOM_CHANNEL).emit("player:pause", { positionSec });
    });

    socket.on("player:seek", async ({ positionSec }) => {
      await persistState({ positionSec });
      socket.to(ROOM_CHANNEL).emit("player:seek", { positionSec, at: Date.now() });
    });

    socket.on("player:select", async ({ mediaId }) => {
      const room = await prisma.room.update({
        where: { code: ROOM_CODE },
        data: { currentMediaId: mediaId, isPlaying: false, positionSec: 0 },
        include: { currentMedia: CURRENT_MEDIA_INCLUDE },
      });
      io.to(ROOM_CHANNEL).emit("room:state", serializeRoom(room));
    });

    socket.on("chat:message", async ({ text }) => {
      if (!text || !text.trim()) return;
      const name = members.get(socket.id) || "Guest";
      const room = await prisma.room.findUnique({ where: { code: ROOM_CODE } });
      if (!room) return;
      const msg = await prisma.chatMessage.create({
        data: { roomId: room.id, sender: name, text: text.slice(0, 500) },
      });
      io.to(ROOM_CHANNEL).emit("chat:message", {
        sender: msg.sender,
        text: msg.text,
        createdAt: msg.createdAt,
      });
    });

    // Round-trip ping for the "stats for nerds" overlay — just echoes the
    // client's timestamp straight back so it can compute RTT/2.
    socket.on("ping:rtt", (sentAt) => {
      socket.emit("pong:rtt", sentAt);
    });

    socket.on("disconnect", () => {
      members.delete(socket.id);
      io.to(ROOM_CHANNEL).emit("room:presence", presence());
    });
  });

  httpServer.listen(port, () => {
    console.log(`> OneStream ready on port ${port}`);
  });
});
