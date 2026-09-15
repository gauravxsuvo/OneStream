"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatDuration } from "@/lib/format";
import { playerPrefs } from "@/lib/playerPrefs";
import { AUDIO_LADDER, VIDEO_LADDER } from "@/lib/qualityLadder";
import { useUsageQuota } from "@/lib/useUsageQuota";
import type { MediaItem, RenditionInfo } from "@/lib/types";
import { StatsOverlay } from "@/components/StatsOverlay";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  GearIcon,
  InfoIcon,
  PauseIcon,
  PipIcon,
  PlayIcon,
  SpinnerIcon,
  VolumeIcon,
} from "@/components/icons";

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

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function pickAutoLabel(media: MediaItem, renditions: RenditionInfo[]): string | null {
  const ladder = media.type === "VIDEO" ? VIDEO_LADDER : AUDIO_LADDER;
  for (let i = ladder.length - 1; i >= 0; i--) {
    const r = renditions.find((x) => x.label === ladder[i].label);
    if (r?.status === "READY") return ladder[i].label;
  }
  return null;
}

function resolveEffectiveLabel(
  quality: string,
  media: MediaItem,
  renditions: RenditionInfo[]
): string | null {
  if (quality === "original") return null;
  if (quality === "auto") return pickAutoLabel(media, renditions);
  const match = renditions.find((r) => r.label === quality);
  if (match?.status === "READY") return quality;
  return pickAutoLabel(media, renditions);
}

function srcFor(media: MediaItem, effectiveLabel: string | null): string {
  return effectiveLabel ? `/api/media/${media.id}?rendition=${effectiveLabel}` : `/api/media/${media.id}`;
}

function targetBitrateFor(media: MediaItem, label: string | null): number | null {
  if (!label) return null;
  if (media.type === "VIDEO") return VIDEO_LADDER.find((t) => t.label === label)?.videoBitrateKbps ?? null;
  return AUDIO_LADDER.find((t) => t.label === label)?.bitrateKbps ?? null;
}

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { media, initial, onLocalPlay, onLocalPause, onLocalSeek },
  ref
) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);
  const initialRef = useRef(initial);
  const lastMediaIdRef = useRef<string | null>(null);
  const hideControlsTimer = useRef<number | null>(null);

  const [renditions, setRenditions] = useState<RenditionInfo[]>(media?.renditions ?? []);
  const [quality, setQuality] = useState("auto");
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<"closed" | "root" | "speed" | "quality">("closed");
  const [statsOpen, setStatsOpen] = useState(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const quota = useUsageQuota(media?.type ?? null, playing);

  useEffect(() => {
    if (quota.blocked) mediaRef.current?.pause();
  }, [quota.blocked]);

  function canPlay(): boolean {
    return !quota.isBlocked();
  }

  useEffect(() => {
    initialRef.current = initial;
  }, [initial]);

  useEffect(() => {
    setRenditions(media?.renditions ?? []);
  }, [media?.id, media?.renditions]);

  useEffect(() => {
    const q = media?.type === "AUDIO" ? playerPrefs.getAudioQuality() : playerPrefs.getVideoQuality();
    setQuality(q);
    setSpeed(playerPrefs.getSpeed());
    setVolume(playerPrefs.getVolume());
    setMuted(playerPrefs.getMuted());
  }, [media?.id, media?.type]);

  const hasPending = useMemo(
    () => renditions.length === 0 || renditions.some((r) => r.status === "PENDING" || r.status === "PROCESSING"),
    [renditions]
  );

  useEffect(() => {
    if (!media || !hasPending) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/media/${media.id}/renditions`);
        if (res.ok && !cancelled) setRenditions(await res.json());
      } catch {
        // transient — next tick retries
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [media, hasPending]);

  const effectiveLabel = useMemo(
    () => (media ? resolveEffectiveLabel(quality, media, renditions) : null),
    [quality, media, renditions]
  );

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
      if (!el || !canPlay()) return;
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

  // Swap the actual <video>/<audio> source whenever the selected media or the
  // resolved quality tier changes. A same-media quality switch preserves the
  // local play position; a genuinely new media item applies the room's shared
  // position/play state instead.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !media) return;

    const nextSrc = new URL(srcFor(media, effectiveLabel), window.location.origin).toString();
    if (el.dataset.src === nextSrc) return;

    const isNewMedia = lastMediaIdRef.current !== media.id;
    lastMediaIdRef.current = media.id;
    const wasPlaying = !isNewMedia && !el.paused && !el.ended;
    const preserveTime = !isNewMedia ? el.currentTime : null;

    el.dataset.src = nextSrc;
    el.src = nextSrc;
    el.load();

    const onLoaded = () => {
      if (isNewMedia) {
        const init = initialRef.current;
        const elapsed = init.isPlaying ? (Date.now() - new Date(init.updatedAt).getTime()) / 1000 : 0;
        el.currentTime = Math.max(0, init.positionSec + elapsed);
        if (init.isPlaying && canPlay()) el.play().catch(() => {});
      } else {
        if (preserveTime != null) el.currentTime = preserveTime;
        if (wasPlaying && canPlay()) el.play().catch(() => {});
      }
    };
    el.addEventListener("loadedmetadata", onLoaded, { once: true });
    return () => el.removeEventListener("loadedmetadata", onLoaded);
    // canPlay() reads a ref (useUsageQuota's blockedRef), so it's always
    // current regardless of which render's closure this effect captured --
    // adding it here would only churn the effect on every render instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, effectiveLabel]);

  useEffect(() => {
    const el = mediaRef.current;
    if (el) {
      el.volume = volume;
      el.muted = muted;
      el.playbackRate = speed;
    }
  }, [volume, muted, speed, media?.id]);

  useEffect(() => {
    function onFsChange() {
      setFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function changeQuality(next: string) {
    setQuality(next);
    if (media?.type === "AUDIO") playerPrefs.setAudioQuality(next);
    else playerPrefs.setVideoQuality(next);
    setMenu("closed");
  }

  function changeSpeed(next: number) {
    setSpeed(next);
    playerPrefs.setSpeed(next);
    setMenu("closed");
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    playerPrefs.setMuted(next);
  }

  function changeVolume(next: number) {
    setVolume(next);
    playerPrefs.setVolume(next);
    if (next > 0 && muted) {
      setMuted(false);
      playerPrefs.setMuted(false);
    }
  }

  function togglePlay() {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      if (canPlay()) el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  function seekBy(deltaSec: number) {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(duration || Infinity, el.currentTime + deltaSec));
  }

  async function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current.requestFullscreen();
  }

  async function togglePip() {
    const el = mediaRef.current as unknown as HTMLVideoElement;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else if (document.pictureInPictureEnabled) {
        await el.requestPictureInPicture();
        setPipActive(true);
      }
    } catch {
      // PiP can reject (e.g. unsupported source) — non-fatal
    }
  }

  function wakeControls() {
    setControlsVisible(true);
    if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    if (media?.type === "VIDEO" && playing && menu === "closed") {
      hideControlsTimer.current = window.setTimeout(() => setControlsVisible(false), 2800);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!media) return;
    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        seekBy(-5);
        break;
      case "ArrowRight":
        e.preventDefault();
        seekBy(5);
        break;
      case "ArrowUp":
        e.preventDefault();
        changeVolume(Math.min(1, volume + 0.05));
        break;
      case "ArrowDown":
        e.preventDefault();
        changeVolume(Math.max(0, volume - 0.05));
        break;
      case "m":
        toggleMute();
        break;
      case "f":
        if (media.type === "VIDEO") toggleFullscreen();
        break;
    }
    wakeControls();
  }

  // Seek bar interaction (pointer-based so it works for mouse and touch alike).
  const seekBarRef = useRef<HTMLDivElement>(null);
  function ratioFromPointer(clientX: number): number {
    const rect = seekBarRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }
  function onSeekPointerDown(e: React.PointerEvent) {
    if (!duration) return;
    const ratio = ratioFromPointer(e.clientX);
    setDragRatio(ratio);
    function onMove(ev: PointerEvent) {
      setDragRatio(ratioFromPointer(ev.clientX));
    }
    function onUp(ev: PointerEvent) {
      const finalRatio = ratioFromPointer(ev.clientX);
      const el = mediaRef.current;
      if (el) el.currentTime = finalRatio * duration;
      setDragRatio(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  if (!media) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-sm text-muted">
        <span className="text-2xl">🍿</span>
        Pick something from the library to start watching.
      </div>
    );
  }

  const isVideo = media.type === "VIDEO";
  const displayTime = dragRatio != null ? dragRatio * duration : currentTime;
  const progressPct = duration > 0 ? (displayTime / duration) * 100 : 0;

  function onPlay() {
    setPlaying(true);
    if (!suppressRef.current) onLocalPlay(mediaRef.current?.currentTime ?? 0);
  }
  function onPause() {
    setPlaying(false);
    if (!suppressRef.current) onLocalPause(mediaRef.current?.currentTime ?? 0);
  }
  function onSeeked() {
    if (!suppressRef.current) onLocalSeek(mediaRef.current?.currentTime ?? 0);
  }

  const ladder = isVideo ? VIDEO_LADDER : AUDIO_LADDER;
  const autoResolved = pickAutoLabel(media, renditions);
  const qualityMenuLabel =
    quality === "auto"
      ? `Auto${autoResolved ? ` (${autoResolved})` : ""}`
      : quality === "original"
        ? "Original"
        : quality;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={wakeControls}
      onContextMenu={(e) => {
        e.preventDefault();
        setStatsOpen((v) => !v);
      }}
      className={`group relative w-full rounded-xl outline-none ${isVideo ? "aspect-video" : ""} ${
        fullscreen ? "fixed inset-0 z-50 rounded-none" : ""
      }`}
    >
      {/* Clips the video/audio surface to rounded corners without clipping the
          control bar's popovers, which need to overflow upward on short
          (mobile) players. */}
      <div className={`absolute inset-0 overflow-hidden bg-black ${fullscreen ? "" : "rounded-xl"}`}>
      {isVideo ? (
        <video
          ref={mediaRef}
          poster={media.thumbnailKey ? `/api/media/${media.id}/thumbnail` : undefined}
          playsInline
          className="h-full w-full"
          onPlay={onPlay}
          onPause={onPause}
          onSeeked={onSeeked}
          onTimeUpdate={(e) => !dragRatio && setCurrentTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration || media.durationSec || 0)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || media.durationSec || 0)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onClick={togglePlay}
        />
      ) : (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 bg-gradient-to-b from-surface to-black p-8 text-center sm:min-h-80">
          <span className="text-5xl">🎵</span>
          <p className="text-sm font-medium text-foreground">{media.title}</p>
          <p className="text-xs text-muted">{media.uploadedBy}</p>
          <audio
            ref={mediaRef}
            onPlay={onPlay}
            onPause={onPause}
            onSeeked={onSeeked}
            onTimeUpdate={(e) => !dragRatio && setCurrentTime(e.currentTarget.currentTime)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration || media.durationSec || 0)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || media.durationSec || 0)}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            className="hidden"
          />
        </div>
      )}

      {buffering && !quota.blocked && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <SpinnerIcon className="h-10 w-10 animate-spin text-white/80" />
        </div>
      )}

      {quota.blocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
          <span className="text-2xl">⏳</span>
          <p className="text-sm text-white">{quota.reason}</p>
        </div>
      )}
      </div>

      {statsOpen && (
        <StatsOverlay
          mediaEl={mediaRef.current}
          media={media}
          qualityLabel={qualityMenuLabel}
          bitrateKbps={targetBitrateFor(media, effectiveLabel)}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {/* Control bar */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2 pt-8 text-white transition-opacity duration-200 ${
          fullscreen ? "" : "rounded-b-xl"
        } ${controlsVisible || !isVideo || menu !== "closed" ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div
          ref={seekBarRef}
          onPointerDown={onSeekPointerDown}
          className="group/bar relative h-3 w-full cursor-pointer touch-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-accent opacity-0 transition-opacity group-hover/bar:opacity-100"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={togglePlay} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Play/Pause">
            {playing ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-1.5">
            <button onClick={toggleMute} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Mute">
              <VolumeIcon muted={muted} level={volume} className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className="volume-range hidden w-16 sm:block"
              aria-label="Volume"
            />
          </div>

          <span className="font-mono text-[11px] tabular-nums text-white/80 sm:text-xs">
            {formatDuration(displayTime)} / {formatDuration(duration || media.durationSec)}
          </span>
          {Number.isFinite(quota.remainingSeconds) && !quota.blocked && (
            <span className="hidden text-[11px] text-white/50 sm:inline">
              · {formatDuration(quota.remainingSeconds)} left today
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setMenu(menu === "closed" ? "root" : "closed")}
                className="rounded-full p-1.5 hover:bg-white/10"
                aria-label="Settings"
              >
                <GearIcon className="h-4 w-4" />
              </button>
              {menu !== "closed" && (
                <div className="absolute bottom-9 right-0 z-30 w-56 overflow-hidden rounded-lg bg-black/90 py-1 text-sm shadow-xl backdrop-blur-sm">
                  {menu === "root" && (
                    <>
                      <button
                        onClick={() => setMenu("speed")}
                        className="flex w-full items-center justify-between px-3 py-2 hover:bg-white/10"
                      >
                        <span>Playback speed</span>
                        <span className="flex items-center gap-1 text-white/60">
                          {speed}× <ChevronRightIcon className="h-3.5 w-3.5" />
                        </span>
                      </button>
                      <button
                        onClick={() => setMenu("quality")}
                        className="flex w-full items-center justify-between px-3 py-2 hover:bg-white/10"
                      >
                        <span>Quality</span>
                        <span className="flex items-center gap-1 text-white/60">
                          {qualityMenuLabel} <ChevronRightIcon className="h-3.5 w-3.5" />
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          setStatsOpen((v) => !v);
                          setMenu("closed");
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/10"
                      >
                        <InfoIcon className="h-4 w-4" /> Stats for nerds
                      </button>
                    </>
                  )}
                  {menu === "speed" && (
                    <>
                      <button
                        onClick={() => setMenu("root")}
                        className="flex w-full items-center gap-1 px-3 py-2 font-medium hover:bg-white/10"
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5" /> Playback speed
                      </button>
                      {SPEEDS.map((s) => (
                        <button
                          key={s}
                          onClick={() => changeSpeed(s)}
                          className="flex w-full items-center justify-between px-3 py-2 hover:bg-white/10"
                        >
                          <span>{s === 1 ? "Normal" : `${s}×`}</span>
                          {speed === s && <CheckIcon className="h-3.5 w-3.5 text-accent" />}
                        </button>
                      ))}
                    </>
                  )}
                  {menu === "quality" && (
                    <div className="max-h-72 overflow-y-auto">
                      <button
                        onClick={() => setMenu("root")}
                        className="flex w-full items-center gap-1 px-3 py-2 font-medium hover:bg-white/10"
                      >
                        <ChevronLeftIcon className="h-3.5 w-3.5" /> Quality
                      </button>
                      <button
                        onClick={() => changeQuality("auto")}
                        className="flex w-full items-center justify-between px-3 py-2 hover:bg-white/10"
                      >
                        <span>Auto{autoResolved ? ` (${autoResolved})` : ""}</span>
                        {quality === "auto" && <CheckIcon className="h-3.5 w-3.5 text-accent" />}
                      </button>
                      {[...ladder].reverse().map((tier) => {
                        const r = renditions.find((x) => x.label === tier.label);
                        // No rendition row at all means the server decided this
                        // tier doesn't apply (e.g. above the source's own
                        // resolution/bitrate) — omit it rather than show a
                        // spinner that will never resolve.
                        if (!r) return null;
                        const ready = r.status === "READY";
                        const failed = r.status === "FAILED";
                        const disabled = !ready;
                        return (
                          <button
                            key={tier.label}
                            disabled={disabled}
                            onClick={() => changeQuality(tier.label)}
                            className={`flex w-full items-center justify-between px-3 py-2 ${
                              disabled ? "cursor-default text-white/40" : "hover:bg-white/10"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {tier.label}
                              {!ready && !failed && <SpinnerIcon className="h-3 w-3 animate-spin" />}
                              {failed && <span className="text-[10px] text-danger">failed</span>}
                            </span>
                            {quality === tier.label && ready && <CheckIcon className="h-3.5 w-3.5 text-accent" />}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => changeQuality("original")}
                        className="flex w-full items-center justify-between border-t border-white/10 px-3 py-2 hover:bg-white/10"
                      >
                        <span>Original</span>
                        {quality === "original" && <CheckIcon className="h-3.5 w-3.5 text-accent" />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isVideo && typeof document !== "undefined" && document.pictureInPictureEnabled && (
              <button onClick={togglePip} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Picture in picture">
                <PipIcon className={`h-4 w-4 ${pipActive ? "text-accent" : ""}`} />
              </button>
            )}
            {isVideo && (
              <button onClick={toggleFullscreen} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Fullscreen">
                {fullscreen ? <ExitFullscreenIcon className="h-4 w-4" /> : <FullscreenIcon className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
