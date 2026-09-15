import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Where in-flight chunked uploads are reassembled before being handed to
 * storeUpload(). Ephemeral container-local disk on purpose -- a chunk session
 * never needs to survive a restart, and it's deleted the moment /complete
 * (or a stale sweep) finishes with it. */
const TEMP_DIR = path.join(os.tmpdir(), "onestream-chunked-uploads");

const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isValidUploadId(id: string): boolean {
  return UPLOAD_ID_RE.test(id);
}

function ensureTempDir() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export function tempPath(uploadId: string): string {
  return path.join(TEMP_DIR, uploadId);
}

/** A tab closed mid-upload (or a crashed client) leaves its partial file
 * behind forever with nothing else to clean it up -- these can be
 * multi-gigabyte, so a periodic app-level cron is overkill for how rarely
 * this happens; sweeping once per /init call is cheap and sufficient. */
export function sweepStaleUploads() {
  ensureTempDir();
  const cutoff = Date.now() - STALE_AFTER_MS;
  for (const name of fs.readdirSync(TEMP_DIR)) {
    const p = path.join(TEMP_DIR, name);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    } catch {
      // already gone -- another request's /complete or /cleanup won the race
    }
  }
}

export function createUploadSession(): string {
  ensureTempDir();
  sweepStaleUploads();
  const uploadId = randomUUID();
  fs.writeFileSync(tempPath(uploadId), Buffer.alloc(0));
  return uploadId;
}

export function removeUploadSession(uploadId: string) {
  try {
    fs.unlinkSync(tempPath(uploadId));
  } catch {
    // already cleaned up
  }
}
