"use client";

import { useEffect, useRef, useState } from "react";

export type QuotaState = {
  remainingSeconds: number;
  globalRemainingSeconds: number;
  blocked: boolean;
  reason: string | null;
};

type QuotaResponse = {
  remainingSeconds: number;
  globalRemainingSeconds: number;
  allowed: boolean;
  reason: string | null;
};

const HEARTBEAT_MS = 15_000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Drives the daily watch-time quota for whichever media is loaded: an
 * up-front status check (so an already-exhausted budget disables Play before
 * anything streams) plus a heartbeat sent every ~15s of actual playing time,
 * which is also what the server credits against the daily total. `playing`
 * is expected to reflect the real media element state, not just "user
 * pressed play" -- pausing/ending stops the heartbeat loop immediately.
 *
 * This is the client's courtesy half of enforcement, meant to pause playback
 * before the user even notices a limit; the server-side check in
 * /api/media/[id] is what actually stops bytes regardless of whether this
 * ever ran (a stale tab, a direct reload, JS disabled, ...). */
export function useUsageQuota(mediaType: "VIDEO" | "AUDIO" | null, playing: boolean) {
  const DEFAULT_STATE: QuotaState = {
    remainingSeconds: Infinity,
    globalRemainingSeconds: Infinity,
    blocked: false,
    reason: null,
  };
  const [state, setState] = useState<QuotaState>(DEFAULT_STATE);
  const blockedRef = useRef(false);

  // Resetting here (during render, when mediaType has changed since the last
  // render) rather than in an effect avoids a render showing the *previous*
  // media's blocked/remaining state for one frame -- the "adjusting state
  // when a prop changes" pattern React's own docs recommend over an effect
  // for this exact case.
  const [trackedMediaType, setTrackedMediaType] = useState(mediaType);
  if (trackedMediaType !== mediaType) {
    setTrackedMediaType(mediaType);
    setState(DEFAULT_STATE);
  }

  function applyStatus(data: QuotaResponse | null) {
    if (!data) return;
    blockedRef.current = !data.allowed;
    setState({
      remainingSeconds: data.remainingSeconds,
      globalRemainingSeconds: data.globalRemainingSeconds,
      blocked: !data.allowed,
      reason: data.reason,
    });
  }

  // Up-front check whenever the loaded media (or its type) changes, so an
  // already-exhausted budget shows before the user hits Play at all.
  useEffect(() => {
    blockedRef.current = false;
    if (!mediaType) return;
    let cancelled = false;
    fetchJson<QuotaResponse>(`/api/usage/status?mediaType=${mediaType}`).then((data) => {
      if (!cancelled) applyStatus(data);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaType]);

  useEffect(() => {
    if (!mediaType || !playing || blockedRef.current) return;
    const interval = window.setInterval(async () => {
      const data = await fetchJson<QuotaResponse>("/api/usage/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaType, seconds: HEARTBEAT_MS / 1000 }),
      });
      applyStatus(data);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [mediaType, playing]);

  return { ...state, isBlocked: () => blockedRef.current };
}
