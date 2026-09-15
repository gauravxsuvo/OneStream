import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteUpload } from "@/lib/storage";
import { streamStoredFile } from "@/lib/mediaStream";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const range = req.headers.get("range");
  const renditionLabel = req.nextUrl.searchParams.get("rendition");

  if (renditionLabel && renditionLabel !== "original") {
    const rendition = await prisma.mediaRendition.findUnique({
      where: { mediaId_label: { mediaId: id, label: renditionLabel } },
    });
    if (!rendition || rendition.status !== "READY" || !rendition.storageKey || !rendition.mimeType) {
      return NextResponse.json({ error: "Rendition not ready" }, { status: 404 });
    }
    return streamStoredFile({
      storageKey: rendition.storageKey,
      storageKind: rendition.storageKind,
      mimeType: rendition.mimeType,
      range,
    });
  }

  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return streamStoredFile({
    storageKey: media.storageKey,
    storageKind: media.storageKind,
    mimeType: media.mimeType,
    range,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await prisma.media.findUnique({ where: { id }, include: { renditions: true } });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteUpload(media.storageKey);
  if (media.thumbnailKey) await deleteUpload(media.thumbnailKey);
  for (const rendition of media.renditions) {
    if (rendition.storageKey) await deleteUpload(rendition.storageKey);
  }

  await prisma.media.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
