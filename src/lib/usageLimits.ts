import { prisma } from "@/lib/prisma";
import type { MediaType } from "@prisma/client";

/** Why these exist at all: Portways sits fully behind Cloudflare, and
 * Cloudflare's terms of service prohibit using their standard CDN/proxy to
 * stream video regardless of volume -- there's no dollar bill for bandwidth,
 * but sustained heavy streaming risks them throttling the hostname with no
 * warning beyond an email. These caps don't make that risk zero (a friends
 * group watching in good faith still isn't "supposed" to stream video through
 * a plain Cloudflare proxy at all), but they bound how much exposure a single
 * day of enthusiastic friends can rack up, both per person and in aggregate.
 *
 * Video costs far more bandwidth per hour than audio (a 1080p stream can run
 * 1-3+ GB/hour; 320kbps audio is ~140MB/hour, over 10x less) -- that's why
 * the audio budget is double the video one in hours and still a fraction of
 * the bytes.
 */
function hours(n: number) {
  return n * 3600;
}

const PER_VIEWER_LIMIT_SEC: Record<MediaType, number> = {
  VIDEO: hours(Number(process.env.DAILY_VIDEO_HOURS ?? 3)),
  AUDIO: hours(Number(process.env.DAILY_AUDIO_HOURS ?? 6)),
};

// The real Cloudflare-relevant number is aggregate usage across everyone,
// not any one person's total -- this is the backstop that matters even if
// per-viewer tracking gets reset (cleared cookies, a new browser, ...).
const GLOBAL_LIMIT_SEC: Record<MediaType, number> = {
  VIDEO: hours(Number(process.env.DAILY_VIDEO_HOURS_GLOBAL ?? 12)),
  AUDIO: hours(Number(process.env.DAILY_AUDIO_HOURS_GLOBAL ?? 24)),
};

// Bounds peak simultaneous bandwidth (a movie night with everyone watching
// something different is a bigger spike than the same hours spread out).
const CONCURRENT_LIMIT: Record<MediaType, number> = {
  VIDEO: Number(process.env.CONCURRENT_VIDEO_LIMIT ?? 4),
  AUDIO: Number(process.env.CONCURRENT_AUDIO_LIMIT ?? 8),
};

const ACTIVE_WINDOW_MS = 20_000;
// A single heartbeat call is trusted for at most this many seconds, so a
// tampered or delayed client can't credit itself a huge chunk in one call.
const MAX_HEARTBEAT_SEC = 30;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export type QuotaStatus = {
  mediaType: MediaType;
  usedSeconds: number;
  limitSeconds: number;
  remainingSeconds: number;
  globalUsedSeconds: number;
  globalLimitSeconds: number;
  globalRemainingSeconds: number;
  concurrentCount: number;
  concurrentLimit: number;
  allowed: boolean;
  reason: string | null;
};

async function globalUsedSeconds(mediaType: MediaType, date: string): Promise<number> {
  const rows = await prisma.usageHeartbeat.aggregate({
    where: { mediaType, date },
    _sum: { secondsUsed: true },
  });
  return rows._sum.secondsUsed ?? 0;
}

async function concurrentCount(mediaType: MediaType, excludeViewerId?: string): Promise<number> {
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const count = await prisma.usageHeartbeat.count({
    where: {
      mediaType,
      lastSeenAt: { gte: since },
      ...(excludeViewerId ? { viewerId: { not: excludeViewerId } } : {}),
    },
  });
  return count;
}

export async function getQuotaStatus(viewerId: string, mediaType: MediaType): Promise<QuotaStatus> {
  const date = todayKey();
  const [row, globalUsed, concurrent] = await Promise.all([
    prisma.usageHeartbeat.findUnique({
      where: { viewerId_date_mediaType: { viewerId, date, mediaType } },
    }),
    globalUsedSeconds(mediaType, date),
    concurrentCount(mediaType, viewerId),
  ]);

  const usedSeconds = row?.secondsUsed ?? 0;
  const limitSeconds = PER_VIEWER_LIMIT_SEC[mediaType];
  const globalLimitSeconds = GLOBAL_LIMIT_SEC[mediaType];
  const concurrentLimit = CONCURRENT_LIMIT[mediaType];

  let reason: string | null = null;
  if (usedSeconds >= limitSeconds) {
    reason = `Daily ${mediaType.toLowerCase()} watch-time limit reached. Resumes tomorrow.`;
  } else if (globalUsed >= globalLimitSeconds) {
    reason = `Today's shared ${mediaType.toLowerCase()} streaming budget for everyone is used up. Resumes tomorrow.`;
  } else if (concurrent >= concurrentLimit) {
    reason = `Too many ${mediaType.toLowerCase()} streams running at once -- try again in a bit.`;
  }

  return {
    mediaType,
    usedSeconds,
    limitSeconds,
    remainingSeconds: Math.max(0, limitSeconds - usedSeconds),
    globalUsedSeconds: globalUsed,
    globalLimitSeconds,
    globalRemainingSeconds: Math.max(0, globalLimitSeconds - globalUsed),
    concurrentCount: concurrent,
    concurrentLimit,
    allowed: reason === null,
    reason,
  };
}

/** Records actual playing time and returns the post-write quota status in one
 * round trip, so the player can act on `allowed` immediately without a
 * second request. `seconds` is clamped so one call can't self-report an
 * unbounded amount. */
export async function recordHeartbeat(
  viewerId: string,
  mediaType: MediaType,
  seconds: number
): Promise<QuotaStatus> {
  const date = todayKey();
  const clamped = Math.max(0, Math.min(MAX_HEARTBEAT_SEC, Math.floor(seconds)));

  await prisma.usageHeartbeat.upsert({
    where: { viewerId_date_mediaType: { viewerId, date, mediaType } },
    create: { viewerId, date, mediaType, secondsUsed: clamped },
    update: { secondsUsed: { increment: clamped } },
  });

  return getQuotaStatus(viewerId, mediaType);
}
