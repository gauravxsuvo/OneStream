"use client";

import { useRef, useState } from "react";
import { useDisplayName } from "@/lib/useDisplayName";
import type { MediaItem } from "@/lib/types";

// Kept well under the platform's ~100MB per-request proxy ceiling (Portways
// sits behind Cloudflare, which hard-caps any single request body there) --
// a whole file used to go up as one request and any video over that size
// failed outright. Chunking splits it into many small requests instead, none
// of which get anywhere near the limit.
const CHUNK_SIZE = 32 * 1024 * 1024;
const CHUNK_RETRIES = 2;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

async function sendChunk(uploadId: string, chunk: Blob) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt++) {
    try {
      const res = await fetch("/api/upload/chunk", {
        method: "POST",
        headers: { "x-upload-id": uploadId, "content-type": "application/octet-stream" },
        body: chunk,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Chunk failed (${res.status})`);
      }
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Chunk failed");
}

export function UploadForm({ onUploaded }: { onUploaded: (media: MediaItem) => void }) {
  const { name } = useDisplayName();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  function pickFile(file: File | undefined | null) {
    if (!file) return;
    setPendingFile(file);
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = pendingFile ?? fileRef.current?.files?.[0];
    if (!file) return;

    setError("");
    setProgress(0);

    try {
      const { uploadId } = await postJson<{ uploadId: string }>("/api/upload/init", {});

      const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      for (let i = 0; i < totalChunks; i++) {
        const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await sendChunk(uploadId, chunk);
        setProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      const media = await postJson<MediaItem>("/api/upload/complete", {
        uploadId,
        title: title || file.name,
        uploadedBy: name || "Someone",
        mimeType: file.type || "application/octet-stream",
        originalName: file.name,
      });

      onUploaded(media);
      setTitle("");
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <form onSubmit={upload} className="card flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="text-sm font-medium">Upload music or a video</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragOver ? "border-accent bg-accent/5" : "border-border hover:border-white/20"
        }`}
      >
        <span className="text-xl">{pendingFile ? "✅" : "📁"}</span>
        <p className="text-sm text-foreground">
          {pendingFile ? pendingFile.name : "Drag a file here, or click to browse"}
        </p>
        <p className="text-xs text-muted">Audio or video · up to 20GB</p>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/*"
          required
          onChange={(e) => pickFile(e.target.files?.[0])}
          className="hidden"
        />
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="input"
      />

      {progress !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={progress !== null || !pendingFile} className="btn-primary">
        {progress !== null ? `Uploading… ${progress}%` : "Upload"}
      </button>
    </form>
  );
}
