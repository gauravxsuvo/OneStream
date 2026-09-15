import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { storeUpload, usingS3 } from "@/lib/storage";
import { processUpload } from "@/lib/transcode";
import { AUTH_COOKIE, isAuthenticated } from "@/lib/authHash";
import { isValidUploadId, removeUploadSession, tempPath } from "@/lib/uploadSessions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req.cookies.get(AUTH_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const uploadId = body?.uploadId;
  if (typeof uploadId !== "string" || !isValidUploadId(uploadId)) {
    return NextResponse.json({ error: "Invalid upload id" }, { status: 400 });
  }

  const source = tempPath(uploadId);
  if (!fs.existsSync(source)) {
    return NextResponse.json({ error: "Unknown or expired upload session" }, { status: 404 });
  }

  const title = (typeof body?.title === "string" ? body.title : "").slice(0, 200);
  const uploadedBy = (typeof body?.uploadedBy === "string" ? body.uploadedBy : "").slice(0, 100) || "Someone";
  const mimeType =
    typeof body?.mimeType === "string" && body.mimeType ? body.mimeType : "application/octet-stream";
  const originalName = typeof body?.originalName === "string" ? body.originalName : "upload";
  const mediaType = mimeType.startsWith("audio/") ? "AUDIO" : "VIDEO";
  const ext = path.extname(originalName);
  const storageKey = `${randomUUID()}${ext}`;

  try {
    const size = await storeUpload(storageKey, fs.createReadStream(source), mimeType);
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
    void processUpload(media.id).catch((err) =>
      console.error(`[onestream] processUpload failed for ${media.id}:`, err)
    );
    return NextResponse.json({ ...media, renditions: [] }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error)?.message || "Failed to save upload" },
      { status: 500 }
    );
  } finally {
    removeUploadSession(uploadId);
  }
}
