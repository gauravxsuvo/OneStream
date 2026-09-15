import { prisma } from "@/lib/prisma";

// OneStream is single-room: everyone who has the passcode shares one room, so
// there's no create/join flow. Kept as a real `code` (rather than dropping the
// Room table) because server.js's realtime state and DB row both key off it.
// Mirrored as a literal in server.js — keep the two in sync if this ever changes.
export const ROOM_CODE = "MAIN";

export async function ensureRoom() {
  return prisma.room.upsert({
    where: { code: ROOM_CODE },
    update: {},
    create: { code: ROOM_CODE, name: "OneStream" },
  });
}
