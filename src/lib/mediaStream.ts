import { NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { getSignedMediaUrl, localFilePath } from "@/lib/storage";
import type { StorageKind } from "@prisma/client";

/** Serves a stored file (local disk or S3) with HTTP range support, so seeking
 * in the <video>/<audio> element works without downloading the whole file. */
export async function streamStoredFile(opts: {
  storageKey: string;
  storageKind: StorageKind;
  mimeType: string;
  range: string | null;
}): Promise<NextResponse> {
  const { storageKey, storageKind, mimeType, range } = opts;

  if (storageKind === "S3") {
    const url = await getSignedMediaUrl(storageKey);
    return NextResponse.redirect(url);
  }

  const filePath = localFilePath(storageKey);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
  const stat = fs.statSync(filePath);

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    const safeEnd = Math.min(end, stat.size - 1);
    const chunkSize = safeEnd - start + 1;
    const stream = fs.createReadStream(filePath, { start, end: safeEnd });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${safeEnd}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": mimeType,
        "Cache-Control": "no-store",
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    },
  });
}
