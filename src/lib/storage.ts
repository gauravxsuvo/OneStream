import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

/** Streams the upload straight to its destination (disk or S3) without buffering it in memory. */
export async function storeUpload(
  key: string,
  stream: Readable,
  contentType: string
): Promise<number> {
  if (usingS3) {
    const upload = new Upload({
      client: getS3(),
      params: { Bucket: bucket(), Key: key, Body: stream, ContentType: contentType },
    });
    await upload.done();
    const head = await getS3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return head.ContentLength ?? 0;
  }

  ensureDataDir();
  const dest = fs.createWriteStream(path.join(/* turbopackIgnore: true */ DATA_DIR, key));
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
