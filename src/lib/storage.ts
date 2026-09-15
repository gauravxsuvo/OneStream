import fs from "node:fs";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data", "uploads");

export const usingS3 = Boolean(
  process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
);

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

function bucket(): string {
  return process.env.S3_BUCKET!;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** Local keys can contain "/" (renditions/<id>/720p.mp4, thumbnails/<id>.jpg),
 * so the destination's parent directory isn't guaranteed to exist yet. */
function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** Streams the upload straight to its destination (disk or S3) without buffering it in memory. */
export async function storeUpload(
  key: string,
  stream: Readable,
  contentType: string
): Promise<number> {
  if (usingS3) {
    // Deliberately not a follow-up HeadObjectCommand on the same client:
    // reusing that connection for a HEAD immediately after a multipart
    // Upload completes reliably 403s behind Portways' Cloudflare/Traefik
    // routing (confirmed live -- a fresh client's HeadObjectCommand alone
    // always succeeds, so this is a keep-alive connection-reuse desync in
    // the proxy chain, not a permissions issue). Counting bytes as they
    // pass through mirrors what the local-disk branch below already does
    // and needs no second round trip at all.
    let size = 0;
    const counter = new PassThrough({
      transform(chunk: Buffer, _enc, callback) {
        size += chunk.length;
        callback(null, chunk);
      },
    });
    stream.pipe(counter);
    const upload = new Upload({
      client: getS3(),
      params: { Bucket: bucket(), Key: key, Body: counter, ContentType: contentType },
    });
    await upload.done();
    return size;
  }

  ensureDataDir();
  const destPath = path.join(/* turbopackIgnore: true */ DATA_DIR, key);
  ensureParentDir(destPath);
  const dest = fs.createWriteStream(destPath);
  let size = 0;
  stream.on("data", (chunk: Buffer) => {
    size += chunk.length;
  });
  await new Promise<void>((resolve, reject) => {
    stream.pipe(dest);
    dest.on("finish", () => resolve());
    dest.on("error", reject);
    stream.on("error", reject);
  });
  return size;
}

/** Uploads a file already sitting on local disk (e.g. an ffmpeg output) to the
 * configured destination (S3 or the local data dir), then leaves the source
 * file for the caller to clean up. */
export async function storeUploadFromFile(
  key: string,
  filePath: string,
  contentType: string
): Promise<number> {
  const stat = fs.statSync(filePath);

  if (usingS3) {
    const upload = new Upload({
      client: getS3(),
      params: {
        Bucket: bucket(),
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentType: contentType,
      },
    });
    await upload.done();
    return stat.size;
  }

  ensureDataDir();
  const destPath = path.join(/* turbopackIgnore: true */ DATA_DIR, key);
  ensureParentDir(destPath);
  await fs.promises.copyFile(filePath, destPath);
  return stat.size;
}

export async function deleteUpload(key: string): Promise<void> {
  if (usingS3) {
    await getS3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return;
  }
  const filePath = path.join(/* turbopackIgnore: true */ DATA_DIR, key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export async function getSignedMediaUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(getS3(), command, { expiresIn: 60 * 60 });
}

export function localFilePath(key: string): string {
  return path.join(/* turbopackIgnore: true */ DATA_DIR, key);
}
