"use client";

import { useRef, useState } from "react";
import { useDisplayName } from "@/lib/useDisplayName";
import type { MediaItem } from "@/lib/types";

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

  function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = pendingFile ?? fileRef.current?.files?.[0];
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
        setPendingFile(null);
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
