"use client";

import { formatBytes } from "@/lib/format";
import type { MediaItem } from "@/lib/types";

export function MediaList({
  items,
  onSelect,
  onDelete,
  emptyLabel = "No media uploaded yet.",
}: {
  items: MediaItem[];
  onSelect?: (media: MediaItem) => void;
  onDelete?: (media: MediaItem) => void;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-3">
          <span className="text-lg">{item.type === "AUDIO" ? "🎵" : "🎬"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="truncate text-xs text-muted">
              {item.uploadedBy} · {formatBytes(item.size)}
            </p>
          </div>
          {onSelect && (
            <button onClick={() => onSelect(item)} className="btn-secondary px-3 py-1.5 text-xs">
              Play in room
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(item)}
              className="btn-ghost px-3 py-1.5 text-xs text-danger hover:text-danger"
            >
              Delete
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
