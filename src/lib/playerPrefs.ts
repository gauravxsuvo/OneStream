// Per-viewer playback preferences (quality/speed/volume). Deliberately
// per-browser localStorage, not room state — like YouTube, each person's
// quality/volume choice is their own, independent of what others in the
// room are doing.
const KEYS = {
  videoQuality: "onestream_video_quality",
  audioQuality: "onestream_audio_quality",
  speed: "onestream_speed",
  volume: "onestream_volume",
  muted: "onestream_muted",
};

function get(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function set(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

export const playerPrefs = {
  getVideoQuality: () => get(KEYS.videoQuality, "auto"),
  setVideoQuality: (v: string) => set(KEYS.videoQuality, v),
  getAudioQuality: () => get(KEYS.audioQuality, "auto"),
  setAudioQuality: (v: string) => set(KEYS.audioQuality, v),
  getSpeed: () => parseFloat(get(KEYS.speed, "1")) || 1,
  setSpeed: (v: number) => set(KEYS.speed, String(v)),
  getVolume: () => {
    const v = parseFloat(get(KEYS.volume, "1"));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  },
  setVolume: (v: number) => set(KEYS.volume, String(v)),
  getMuted: () => get(KEYS.muted, "false") === "true",
  setMuted: (v: boolean) => set(KEYS.muted, String(v)),
};
