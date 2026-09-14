"use client";

import { useRef, useState } from "react";
import { useDisplayName } from "@/lib/useDisplayName";
import type { MediaItem } from "@/lib/types";

export function UploadForm({ onUploaded }: { onUploaded: (media: MediaItem) => void }) {
  const { name } = useDisplayName();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setError("");
    setProgress(0);

    const form = new FormData();
    form.append("title", title || file.name);
    form.append("uploadedBy", name || "Someone");
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) setProgress(Math.round((evt.loaded / evt.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        const media = JSON.parse(xhr.responseText) as MediaItem;
        onUploaded(media);
        setTitle("");
        if (fileRef.current) fileRef.current.value = "";
      } else {
        try {
          setError(JSON.parse(xhr.responseText).error || "Upload failed");
        } catch {
          setError("Upload failed");
        }
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed");
    };
    xhr.send(form);
  }

  return (
    <form onSubmit={upload} className="card flex flex-col gap-3 p-5">
      <h2 className="text-sm font-medium">Upload music or a video</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="input"
      />
      <input
        ref={fileRef}
        type="file"
        accept="audio/*,video/*"
        required
        className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-hover file:px-3 file:py-2 file:text-sm file:text-foreground"
      />
      {progress !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={progress !== null} className="btn-primary">
        {progress !== null ? `Uploading… ${progress}%` : "Upload"}
      </button>
    </form>
  );
}
