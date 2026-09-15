import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Busboy from "busboy";
import { prisma } from "@/lib/prisma";
import { storeUpload, usingS3 } from "@/lib/storage";
import { processUpload } from "@/lib/transcode";
import { AUTH_COOKIE, isAuthenticated } from "@/lib/authHash";
import type { Media } from "@prisma/client";

export const runtime = "nodejs";

type UploadResult = { ok: true; media: Media } | { ok: false; error: string; status: number };

export async function POST(req: NextRequest) {
  // This route is deliberately excluded from middleware.ts's matcher (see the
  // comment there) so Next's proxy layer never buffers the upload body. That
  // means the passcode check has to happen here instead.
  if (!(await isAuthenticated(req.cookies.get(AUTH_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  if (!req.body) {
    return NextResponse.json({ error: "Missing request body" }, { status: 400 });
  }

  const nodeStream = Readable.fromWeb(req.body as import("stream/web").ReadableStream<Uint8Array>);

  const result = await new Promise<UploadResult>((resolve) => {
    const bb = Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fileSize: 20 * 1024 * 1024 * 1024 },
    });

    let title = "";
    let uploadedBy = "Someone";
    let fileHandled = false;
    let uploadPromise: Promise<number> | null = null;
    let storageKey = "";
    let mimeType = "";
    let mediaType: "AUDIO" | "VIDEO" = "VIDEO";
    let originalName = "upload";
    let settled = false;

    function settle(r: UploadResult) {
      if (settled) return;
      settled = true;
      resolve(r);
    }

    bb.on("field", (name, value) => {
      if (name === "title") title = value.slice(0, 200);
      if (name === "uploadedBy") uploadedBy = value.slice(0, 100) || "Someone";
    });

    bb.on("file", (_name, fileStream, info) => {
      fileHandled = true;
      originalName = info.filename || "upload";
      mimeType = info.mimeType || "application/octet-stream";
      mediaType = mimeType.startsWith("audio/") ? "AUDIO" : "VIDEO";
      const ext = path.extname(originalName);
      storageKey = `${randomUUID()}${ext}`;
      uploadPromise = storeUpload(storageKey, fileStream, mimeType);
    });

    bb.on("error", (err) => {
      settle({ ok: false, error: (err as Error)?.message || "Upload failed", status: 400 });
    });

    bb.on("close", async () => {
      if (!fileHandled || !uploadPromise) {
        settle({ ok: false, error: "No file received", status: 400 });
        return;
      }
      try {
        const size = await uploadPromise;
        const media = await prisma.media.create({
          data: {
            title: title || originalName,
            type: mediaType,
            storageKey,
            storageKind: usingS3 ? "S3" : "LOCAL",
            mimeType,
            size,
            uploadedBy,
          },
        });
        settle({ ok: true, media });
      } catch (err) {
        settle({ ok: false, error: (err as Error)?.message || "Failed to save upload", status: 500 });
      }
    });

    nodeStream.pipe(bb);
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // Probing + transcoding happens in the background — the original file is
  // already playable, so the upload response doesn't wait on any of it.
  void processUpload(result.media.id).catch((err) =>
    console.error(`[onestream] processUpload failed for ${result.media.id}:`, err)
  );
  // No renditions exist yet at creation time — include the empty array so the
  // response matches the MediaItem shape the client expects everywhere else.
  return NextResponse.json({ ...result.media, renditions: [] }, { status: 201 });
}
