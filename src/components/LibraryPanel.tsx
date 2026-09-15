"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadForm } from "@/components/UploadForm";
import { MediaList } from "@/components/MediaList";
import type { MediaItem } from "@/lib/types";

type SortKey = "newest" | "oldest" | "title" | "size";

export function LibraryPanel({
  onSelect,
  currentMediaId,
}: {
  onSelect: (media: MediaItem) => void;
  currentMediaId?: string | null;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filter, setFilter] = useState<"ALL" | "VIDEO" | "AUDIO">("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/media");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(media: MediaItem) {
    if (!confirm(`Delete "${media.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/media/${media.id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((m) => m.id !== media.id));
  }

  const visible = useMemo(() => {
    let list = items;
    if (filter !== "ALL") list = list.filter((m) => m.type === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((m) => m.title.toLowerCase().includes(q) || m.uploadedBy.toLowerCase().includes(q));
    }
    const sorted = [...list];
    switch (sort) {
      case "oldest":
        sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "size":
        sorted.sort((a, b) => b.size - a.size);
        break;
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [items, query, sort, filter]);

  return (
    <div className="flex h-full flex-col gap-4">
      <UploadForm onUploaded={(media) => setItems((prev) => [media, ...prev])} />

      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search library…"
            className="input flex-1 min-w-[8rem] text-sm"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-lg border border-border bg-surface px-2 py-2 text-xs text-foreground outline-none focus:border-accent"
          >
            <option value="ALL">All</option>
            <option value="VIDEO">Video</option>
            <option value="AUDIO">Audio</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-border bg-surface px-2 py-2 text-xs text-foreground outline-none focus:border-accent"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
            <option value="size">Size</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto pr-0.5">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted">Loading…</p>
          ) : (
            <MediaList
              items={visible}
              onSelect={onSelect}
              onDelete={handleDelete}
              currentMediaId={currentMediaId}
              emptyLabel={
                items.length === 0
                  ? "Nothing uploaded yet, add something above to get started."
                  : "No matches."
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
