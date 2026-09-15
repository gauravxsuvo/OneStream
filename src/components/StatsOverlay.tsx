"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socketClient";
import type { MediaItem } from "@/lib/types";

type NetworkInfo = { effectiveType?: string; downlinkMbps?: number };

type Stats = {
  currentTime: number;
  duration: number;
  bufferAheadSec: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  droppedFrames: number | null;
  totalFrames: number | null;
  viewport: string;
  nativeSize: string;
  network: NetworkInfo;
  latencyMs: number | null;
};

function readMediaStats(el: HTMLVideoElement | HTMLAudioElement | null): Omit<Stats, "network" | "latencyMs"> {
  const empty = {
    currentTime: 0,
    duration: 0,
    bufferAheadSec: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    droppedFrames: null,
    totalFrames: null,
    viewport: "",
    nativeSize: "",
  };
  if (!el) return empty;

  let bufferAheadSec = 0;
  try {
    if (el.buffered.length > 0) {
      bufferAheadSec = Math.max(0, el.buffered.end(el.buffered.length - 1) - el.currentTime);
    }
  } catch {
    // ranges can throw between updates; ignore
  }

  let droppedFrames: number | null = null;
  let totalFrames: number | null = null;
  const videoEl = el as HTMLVideoElement;
  if (typeof videoEl.getVideoPlaybackQuality === "function") {
    const q = videoEl.getVideoPlaybackQuality();
    droppedFrames = q.droppedVideoFrames;
    totalFrames = q.totalVideoFrames;
  }

  return {
    currentTime: el.currentTime || 0,
    duration: el.duration || 0,
    bufferAheadSec,
    volume: el.volume,
    muted: el.muted,
    playbackRate: el.playbackRate,
    droppedFrames,
    totalFrames,
    viewport: typeof window !== "undefined" ? `${window.innerWidth}×${window.innerHeight}` : "",
    nativeSize: videoEl.videoWidth ? `${videoEl.videoWidth}×${videoEl.videoHeight}` : "",
  };
}

function readNetworkInfo(): NetworkInfo {
  type NetworkInformation = { effectiveType?: string; downlink?: number };
  const nav = navigator as Navigator & { connection?: NetworkInformation };
  const conn = nav.connection;
  if (!conn) return {};
  return { effectiveType: conn.effectiveType, downlinkMbps: conn.downlink };
}

export function StatsOverlay({
  mediaEl,
  media,
  qualityLabel,
  bitrateKbps,
  onClose,
}: {
  mediaEl: HTMLVideoElement | HTMLAudioElement | null;
  media: MediaItem;
  qualityLabel: string;
  bitrateKbps: number | null;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<Stats>({
    ...readMediaStats(mediaEl),
    network: readNetworkInfo(),
    latencyMs: null,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStats((prev) => ({ ...prev, ...readMediaStats(mediaEl), network: readNetworkInfo() }));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [mediaEl]);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    function ping() {
      const sentAt = Date.now();
      socket.emit("ping:rtt", sentAt);
      socket.once("pong:rtt", (echoedAt: number) => {
        if (cancelled) return;
        setStats((prev) => ({ ...prev, latencyMs: Math.round((Date.now() - echoedAt) / 2) }));
      });
    }

    ping();
    const interval = window.setInterval(ping, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4">
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right text-white">{value}</dd>
    </div>
  );

  return (
    <div className="absolute left-2 top-2 z-20 w-[min(20rem,calc(100%-1rem))] rounded-lg bg-black/85 p-3 font-mono text-[11px] leading-relaxed text-white backdrop-blur-sm sm:text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-sans text-xs font-semibold tracking-wide">Stats for nerds</span>
        <button onClick={onClose} className="rounded px-1.5 text-white/60 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </div>
      <dl className="space-y-0.5">
        {row("Title", media.title)}
        {row("Type", media.type)}
        {row("Quality", qualityLabel)}
        {row("Target bitrate", bitrateKbps ? `${bitrateKbps} kbps` : "source")}
        {row("Codec", media.mimeType)}
        {media.type === "VIDEO" && row("Native size", stats.nativeSize || "n/a")}
        {row("Viewport", stats.viewport)}
        {row("Time", `${stats.currentTime.toFixed(1)}s / ${stats.duration.toFixed(1)}s`)}
        {row("Buffer ahead", `${stats.bufferAheadSec.toFixed(1)}s`)}
        {media.type === "VIDEO" &&
          row(
            "Dropped frames",
            stats.droppedFrames != null && stats.totalFrames != null
              ? `${stats.droppedFrames} / ${stats.totalFrames}`
              : "n/a"
          )}
        {row("Volume", `${Math.round(stats.volume * 100)}%${stats.muted ? " (muted)" : ""}`)}
        {row("Playback rate", `${stats.playbackRate}×`)}
        {row(
          "Network",
          stats.network.effectiveType
            ? `${stats.network.effectiveType}${stats.network.downlinkMbps ? ` · ~${stats.network.downlinkMbps} Mbps` : ""}`
            : "unknown"
        )}
        {row("Room sync latency", stats.latencyMs != null ? `${stats.latencyMs} ms` : "measuring…")}
      </dl>
    </div>
  );
}
