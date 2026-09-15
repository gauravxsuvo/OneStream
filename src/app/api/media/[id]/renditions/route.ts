import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Polled by the player while a rendition is still transcoding, so the quality
// menu can light up as each tier finishes without needing a socket round-trip.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const renditions = await prisma.mediaRendition.findMany({
    where: { mediaId: id },
    select: { label: true, status: true, height: true, bitrateKbps: true, size: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(renditions);
}
