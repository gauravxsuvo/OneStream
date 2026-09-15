import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { prisma } from "@/lib/prisma";
import { getSignedMediaUrl, localFilePath, storeUploadFromFile, usingS3 } from "@/lib/storage";
import { AUDIO_LADDER, VIDEO_LADDER } from "@/lib/qualityLadder";
import type { Media } from "@prisma/client";

const FFMPEG = ffmpegPath;
const FFPROBE = ffprobeStatic.path;

// Renditions are transcoded one at a time by default — predictable CPU load on
// a small single-container host beats finishing faster but starving playback.
const CONCURRENCY = Math.max(1, parseInt(process.env.TRANSCODE_CONCURRENCY || "1", 10));

type ProbeResult = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  audioBitrateKbps: number | null;
};

function run(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 32 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.slice(-2000) || err.message));
      else resolve({ stdout, stderr });
    });
  });
}

/** Reads duration/resolution/audio bitrate from the source so we know which
 * rendition tiers make sense (no point transcoding a 240p upload to "1080p"). */
export async function probeMedia(input: string): Promise<ProbeResult> {
  try {
    const { stdout } = await run(FFPROBE, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      input,
    ]);
    const data = JSON.parse(stdout);
    const streams: Array<Record<string, unknown>> = data.streams || [];
    const video = streams.find((s) => s.codec_type === "video");
    const audio = streams.find((s) => s.codec_type === "audio");
    const durationSec = parseFloat(data.format?.duration) || null;
    const audioBps = audio?.bit_rate ? parseInt(String(audio.bit_rate), 10) : null;
    const overallBps = data.format?.bit_rate ? parseInt(String(data.format.bit_rate), 10) : null;

    return {
      durationSec,
      width: video?.width ? Number(video.width) : null,
      height: video?.height ? Number(video.height) : null,
      audioBitrateKbps: audioBps
        ? Math.round(audioBps / 1000)
        : overallBps && !video
          ? Math.round(overallBps / 1000)
          : null,
    };
  } catch (err) {
    console.error("[onestream] ffprobe failed:", (err as Error).message);
    return { durationSec: null, width: null, height: null, audioBitrateKbps: null };
  }
}

function tempFile(ext: string) {
  return path.join(os.tmpdir(), `onestream-${randomUUID()}${ext}`);
}

/** Local path for LOCAL-stored media, or an https URL ffmpeg can read directly
 * for S3-stored media — either way, no need to fully buffer the source. */
async function ffmpegInputFor(media: Pick<Media, "storageKey" | "storageKind">): Promise<string> {
  if (media.storageKind === "S3") return getSignedMediaUrl(media.storageKey);
  return localFilePath(media.storageKey);
}

async function cleanup(...files: string[]) {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) await fs.promises.unlink(f);
    } catch {
      // best effort
    }
  }
}

export async function generateThumbnail(media: Media): Promise<void> {
  if (media.type !== "VIDEO") return;
  const out = tempFile(".jpg");
  try {
    const input = await ffmpegInputFor(media);
    const seek = media.durationSec ? Math.min(3, media.durationSec * 0.1) : 1;
    await run(FFMPEG, [
      "-ss",
      String(seek),
      "-i",
      input,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      "-q:v",
      "4",
      "-y",
      out,
    ]);
    const key = `thumbnails/${media.id}.jpg`;
    await storeUploadFromFile(key, out, "image/jpeg");
    await prisma.media.update({
      where: { id: media.id },
      data: { thumbnailKey: key, thumbnailKind: usingS3 ? "S3" : "LOCAL" },
    });
  } catch (err) {
    console.error(`[onestream] thumbnail failed for ${media.id}:`, (err as Error).message);
  } finally {
    await cleanup(out);
  }
}

type Job = { mediaId: string; label: string };
const queue: Job[] = [];
let active = 0;

function pump() {
  while (active < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    active++;
    runJob(job.mediaId, job.label)
      .catch((err) => console.error("[onestream] transcode job failed:", err))
      .finally(() => {
        active--;
        pump();
      });
  }
}

async function runJob(mediaId: string, label: string): Promise<void> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;

  await prisma.mediaRendition.updateMany({
    where: { mediaId, label },
    data: { status: "PROCESSING" },
  });

  const isVideo = media.type === "VIDEO";
  const tier = isVideo
    ? VIDEO_LADDER.find((t) => t.label === label)
    : AUDIO_LADDER.find((t) => t.label === label);
  if (!tier) return;

  const ext = isVideo ? ".mp4" : ".m4a";
  const out = tempFile(ext);

  try {
    const input = await ffmpegInputFor(media);

    if (isVideo) {
      const v = tier as (typeof VIDEO_LADDER)[number];
      await run(FFMPEG, [
        "-i",
        input,
        "-vf",
        `scale=-2:${v.height}`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-b:v",
        `${v.videoBitrateKbps}k`,
        "-maxrate",
        `${Math.round(v.videoBitrateKbps * 1.2)}k`,
        "-bufsize",
        `${v.videoBitrateKbps * 2}k`,
        "-c:a",
        "aac",
        "-b:a",
        `${v.audioBitrateKbps}k`,
        "-movflags",
        "+faststart",
        "-y",
        out,
      ]);
    } else {
      const a = tier as (typeof AUDIO_LADDER)[number];
      await run(FFMPEG, [
        "-i",
        input,
        "-map",
        "0:a:0",
        "-c:a",
        "aac",
        "-b:a",
        `${a.bitrateKbps}k`,
        "-movflags",
        "+faststart",
        "-y",
        out,
      ]);
    }

    const key = `renditions/${mediaId}/${label}${ext}`;
    const mimeType = isVideo ? "video/mp4" : "audio/mp4";
    const size = await storeUploadFromFile(key, out, mimeType);

    await prisma.mediaRendition.updateMany({
      where: { mediaId, label },
      data: {
        status: "READY",
        storageKey: key,
        storageKind: usingS3 ? "S3" : "LOCAL",
        mimeType,
        size,
        height: isVideo ? (tier as (typeof VIDEO_LADDER)[number]).height : undefined,
        bitrateKbps: isVideo
          ? (tier as (typeof VIDEO_LADDER)[number]).videoBitrateKbps
          : (tier as (typeof AUDIO_LADDER)[number]).bitrateKbps,
      },
    });
  } catch (err) {
    console.error(`[onestream] transcode failed (${mediaId} ${label}):`, (err as Error).message);
    await prisma.mediaRendition.updateMany({
      where: { mediaId, label },
      data: { status: "FAILED", error: (err as Error).message.slice(0, 500) },
    });
  } finally {
    await cleanup(out);
  }
}

/** Probes the upload, records duration/dimensions, and kicks off background
 * transcodes for every rendition tier the source actually supports (never
 * upscaling past the source's own resolution/bitrate). Fire-and-forget by
 * design — the original file is playable immediately either way. */
export async function processUpload(mediaId: string): Promise<void> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return;

  const input = await ffmpegInputFor(media);
  const probe = await probeMedia(input);

  await prisma.media.update({
    where: { id: mediaId },
    data: {
      durationSec: probe.durationSec ?? undefined,
      width: probe.width ?? undefined,
      height: probe.height ?? undefined,
    },
  });

  if (media.type === "VIDEO") {
    void generateThumbnail({ ...media, durationSec: probe.durationSec ?? media.durationSec });

    const sourceHeight = probe.height ?? Infinity;
    const tiers = VIDEO_LADDER.filter((t) => t.height <= sourceHeight + 16);
    // Always offer at least one rendition so tiny/odd sources aren't left with
    // only the (potentially huge) original file.
    if (tiers.length === 0 && VIDEO_LADDER.length > 0) tiers.push(VIDEO_LADDER[0]);

    for (const tier of tiers) {
      await prisma.mediaRendition.upsert({
        where: { mediaId_label: { mediaId, label: tier.label } },
        update: {},
        create: { mediaId, label: tier.label, status: "PENDING" },
      });
      queue.push({ mediaId, label: tier.label });
    }
  } else {
    const sourceKbps = probe.audioBitrateKbps ?? Infinity;
    const tiers = AUDIO_LADDER.filter((t) => t.bitrateKbps <= sourceKbps + 16);
    if (tiers.length === 0) tiers.push(AUDIO_LADDER[0]);

    for (const tier of tiers) {
      await prisma.mediaRendition.upsert({
        where: { mediaId_label: { mediaId, label: tier.label } },
        update: {},
        create: { mediaId, label: tier.label, status: "PENDING" },
      });
      queue.push({ mediaId, label: tier.label });
    }
  }

  pump();
}
