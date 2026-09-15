"use client";

import { useState } from "react";
import { formatBytes, formatDuration } from "@/lib/format";
import type { MediaItem } from "@/lib/types";

function ReadyTierCount(item: MediaItem): number {
  return item.renditions.filter((r) => r.status === "READY").length;
}

function MediaThumb({ item }: { item: MediaItem }) {
  const [errored, setErrored] = useState(false);
  if (item.type === "VIDEO" && item.thumbnailKey && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served from our own range-capable API, not next/image territory
      <img
        src={`/api/media/${item.id}/thumbnail`}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-hover text-2xl">
      {item.type === "AUDIO" ? "🎵" : "🎬"}
    </div>
  );
}

export function MediaList({
  items,
  onSelect,
  onDelete,
  currentMediaId,
  emptyLabel = "No media uploaded yet.",
}: {
  items: MediaItem[];
  onSelect?: (media: MediaItem) => void;
  onDelete?: (media: MediaItem) => void;
  currentMediaId?: string | null;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 lg:grid-cols-2">
      {items.map((item) => {
        const isPlaying = item.id === currentMediaId;
        const readyTiers = ReadyTierCount(item);
        const processing = item.renditions.some((r) => r.status === "PENDING" || r.status === "PROCESSING");
        return (
          <li key={item.id}>
            <div
              className={`group relative flex flex-col overflow-hidden rounded-lg border transition ${
                isPlaying ? "border-accent" : "border-border hover:border-white/20"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect?.(item)}
                disabled={!onSelect}
                className="relative block aspect-video w-full overflow-hidden bg-black text-left"
              >
                <MediaThumb item={item} />
                {item.durationSec != null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 font-mono text-[10px] text-white">
                    {formatDuration(item.durationSec)}
                  </span>
                )}
                {isPlaying && (
                  <span className="absolute left-1 top-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                    Now playing
                  </span>
                )}
                {onSelect && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-black">Play</span>
                  </span>
                )}
              </button>

              <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
                <p className="truncate text-xs font-medium text-foreground sm:text-sm">{item.title}</p>
                <p className="truncate text-[11px] text-muted">
                  {item.uploadedBy} · {formatBytes(item.size)}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted">
                    {processing
                      ? "Processing…"
                      : readyTiers > 0
                        ? `${readyTiers} quality tier${readyTiers === 1 ? "" : "s"}`
                        : "Original only"}
                  </span>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(item)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-muted opacity-100 transition hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
