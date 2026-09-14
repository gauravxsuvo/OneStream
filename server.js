const { createServer } = require("node:http");
const crypto = require("node:crypto");
const next = require("next");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const socketPath = "/socket.io";

const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// socketId -> { code, name }, kept in-memory since this app runs as a single container.
const members = new Map();

function roomChannel(code) {
  return `room:${code}`;
}

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

function presenceFor(code) {
  const names = [];
  for (const info of members.values()) {
    if (info.code === code) names.push(info.name);
  }
  return names;
}

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

async function persistState(code, patch) {
  try {
    await prisma.room.update({ where: { code }, data: { ...patch, updatedAt: new Date() } });
  } catch (err) {
    console.error(`[onestream] failed to persist state for room ${code}:`, err.message);
  }
}

app.prepare().then(() => {
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
    socket.on("room:join", async ({ code, name }) => {
      if (!code) return;
      const displayName = String(name || "Guest").slice(0, 40);
      members.set(socket.id, { code, name: displayName });
      socket.join(roomChannel(code));
      io.to(roomChannel(code)).emit("room:presence", presenceFor(code));

      const room = await prisma.room.findUnique({
        where: { code },
        include: { currentMedia: true },
      });
      if (room) socket.emit("room:state", serializeRoom(room));
    });

    socket.on("player:play", async ({ code, positionSec }) => {
      if (!code) return;
      await persistState(code, { isPlaying: true, positionSec });
      socket.to(roomChannel(code)).emit("player:play", { positionSec, at: Date.now() });
    });

    socket.on("player:pause", async ({ code, positionSec }) => {
      if (!code) return;
      await persistState(code, { isPlaying: false, positionSec });
      socket.to(roomChannel(code)).emit("player:pause", { positionSec });
    });

    socket.on("player:seek", async ({ code, positionSec }) => {
      if (!code) return;
      await persistState(code, { positionSec });
      socket.to(roomChannel(code)).emit("player:seek", { positionSec, at: Date.now() });
    });

    socket.on("player:select", async ({ code, mediaId }) => {
      if (!code) return;
      const room = await prisma.room.update({
        where: { code },
        data: { currentMediaId: mediaId, isPlaying: false, positionSec: 0 },
        include: { currentMedia: true },
      });
      io.to(roomChannel(code)).emit("room:state", serializeRoom(room));
    });

    socket.on("chat:message", async ({ code, text }) => {
      if (!code || !text || !text.trim()) return;
      const info = members.get(socket.id);
      const room = await prisma.room.findUnique({ where: { code } });
      if (!room) return;
      const msg = await prisma.chatMessage.create({
        data: { roomId: room.id, sender: info?.name || "Guest", text: text.slice(0, 500) },
      });
      io.to(roomChannel(code)).emit("chat:message", {
        sender: msg.sender,
        text: msg.text,
        createdAt: msg.createdAt,
      });
    });

    socket.on("disconnect", () => {
      const info = members.get(socket.id);
      members.delete(socket.id);
      if (info) io.to(roomChannel(info.code)).emit("room:presence", presenceFor(info.code));
    });
  });

  httpServer.listen(port, () => {
    console.log(`> OneStream ready on port ${port}`);
  });
});
