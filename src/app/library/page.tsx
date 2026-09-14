"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadForm } from "@/components/UploadForm";
import { MediaList } from "@/components/MediaList";
import type { MediaItem } from "@/lib/types";

export default function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/media");
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetch-on-mount: there's no server-provided initial list (this page is a client
    // component), so an effect is the right place to kick off the first load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete(media: MediaItem) {
    if (!confirm(`Delete "${media.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/media/${media.id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((m) => m.id !== media.id));
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted">
          Everything uploaded here is shared with everyone who has the passcode.
        </p>
      </div>

      <UploadForm onUploaded={(media) => setItems((prev) => [media, ...prev])} />

      <div className="card p-5">
        <h2 className="mb-1 text-sm font-medium">Uploaded media</h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Loading…</p>
        ) : (
          <MediaList items={items} onDelete={handleDelete} />
        )}
      </div>
    </main>
  );
}
