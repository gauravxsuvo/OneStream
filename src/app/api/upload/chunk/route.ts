import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AUTH_COOKIE, isAuthenticated } from "@/lib/authHash";
import { isValidUploadId, tempPath } from "@/lib/uploadSessions";

export const runtime = "nodejs";

// The client sends chunks sequentially and awaits each response before
// sending the next, so a plain append is enough to keep them in order --
// no byte-range bookkeeping needed for a single in-flight uploader per file.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req.cookies.get(AUTH_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploadId = req.headers.get("x-upload-id") || "";
  if (!isValidUploadId(uploadId)) {
    return NextResponse.json({ error: "Invalid upload id" }, { status: 400 });
  }

  const dest = tempPath(uploadId);
  if (!fs.existsSync(dest)) {
    return NextResponse.json({ error: "Unknown or expired upload session" }, { status: 404 });
  }

  if (!req.body) {
    return NextResponse.json({ error: "Missing chunk body" }, { status: 400 });
  }

  try {
    const chunkStream = Readable.fromWeb(req.body as import("stream/web").ReadableStream<Uint8Array>);
    const out = fs.createWriteStream(dest, { flags: "a" });
    await pipeline(chunkStream, out);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error)?.message || "Failed to write chunk" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
