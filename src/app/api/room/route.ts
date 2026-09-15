import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureRoom } from "@/lib/room";

// OneStream has exactly one room — this is the only room endpoint. It's
// created on first request (or on server boot; see server.js) so there's
// nothing to create/join.
export async function GET() {
  const existing = await ensureRoom();
  const room = await prisma.room.findUnique({
    where: { id: existing.id },
    include: {
      currentMedia: {
        include: {
          renditions: {
            select: { label: true, status: true, height: true, bitrateKbps: true, size: true },
          },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  return NextResponse.json({ ...room, messages: room!.messages.reverse() });
}
