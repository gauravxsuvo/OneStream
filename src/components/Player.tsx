"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { MediaItem } from "@/lib/types";

export type PlayerHandle = {
  applyPlay: (positionSec: number, at: number) => void;
  applyPause: (positionSec: number) => void;
  applySeek: (positionSec: number, at?: number) => void;
};

type Props = {
  media: MediaItem | null;
  initial: { isPlaying: boolean; positionSec: number; updatedAt: string };
  onLocalPlay: (positionSec: number) => void;
  onLocalPause: (positionSec: number) => void;
  onLocalSeek: (positionSec: number) => void;
};

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { media, initial, onLocalPlay, onLocalPause, onLocalSeek },
  ref
) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const suppressRef = useRef(false);

  function withSuppressed(fn: () => void) {
    suppressRef.current = true;
    fn();
    window.setTimeout(() => {
      suppressRef.current = false;
    }, 300);
  }

  useImperativeHandle(ref, () => ({
    applyPlay(positionSec, at) {
      const el = mediaRef.current;
      if (!el) return;
      withSuppressed(() => {
        const elapsed = (Date.now() - at) / 1000;
        el.currentTime = Math.max(0, positionSec + elapsed);
        el.play().catch(() => {});
      });
    },
    applyPause(positionSec) {
      const el = mediaRef.current;
      if (!el) return;
      withSuppressed(() => {
        el.currentTime = positionSec;
        el.pause();
      });
    },
    applySeek(positionSec, at) {
      const el = mediaRef.current;
      if (!el) return;
      withSuppressed(() => {
        const elapsed = at ? (Date.now() - at) / 1000 : 0;
        el.currentTime = Math.max(0, positionSec + elapsed);
      });
    },
  }));

  // Apply the room's current position/play-state once this media item is ready.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !media) return;

    function applyInitial() {
      if (!el) return;
      const elapsed = initial.isPlaying
        ? (Date.now() - new Date(initial.updatedAt).getTime()) / 1000
        : 0;
      el.currentTime = Math.max(0, initial.positionSec + elapsed);
      if (initial.isPlaying) el.play().catch(() => {});
    }

    if (el.readyState >= 1) {
      applyInitial();
      return;
    }
    el.addEventListener("loadedmetadata", applyInitial, { once: true });
    return () => el.removeEventListener("loadedmetadata", applyInitial);
    // Only re-run when the media item itself changes; initial is a one-shot baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.id]);

  if (!media) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
        Pick something from the library to start watching.
      </div>
    );
  }

  const src = `/api/media/${media.id}`;

  function onPlay() {
    if (suppressRef.current) return;
    onLocalPlay(mediaRef.current?.currentTime ?? 0);
  }
  function onPause() {
    if (suppressRef.current) return;
    onLocalPause(mediaRef.current?.currentTime ?? 0);
  }
  function onSeeked() {
    if (suppressRef.current) return;
    onLocalSeek(mediaRef.current?.currentTime ?? 0);
  }

  if (media.type === "VIDEO") {
    return (
      <video
        key={media.id}
        ref={mediaRef}
        src={src}
        controls
        className="w-full rounded-xl bg-black"
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-8">
      <span className="text-4xl">🎵</span>
      <p className="text-sm font-medium">{media.title}</p>
      <audio
        key={media.id}
        ref={mediaRef}
        src={src}
        controls
        className="w-full max-w-md"
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
      />
    </div>
  );
});
