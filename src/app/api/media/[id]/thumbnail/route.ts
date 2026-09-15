import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { streamStoredFile } from "@/lib/mediaStream";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media?.thumbnailKey || !media.thumbnailKind) {
    return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
  }
  return streamStoredFile({
    storageKey: media.thumbnailKey,
    storageKind: media.thumbnailKind,
    mimeType: "image/jpeg",
    range: null,
  });
}
