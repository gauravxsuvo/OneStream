export type VideoTier = {
  label: string;
  height: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
};

export type AudioTier = {
  label: string;
  bitrateKbps: number;
};

// Ordered low -> high. Renditions above the source's own resolution/bitrate are
// skipped at transcode time (no upscaling, no fake quality).
export const VIDEO_LADDER: VideoTier[] = [
  { label: "144p", height: 144, videoBitrateKbps: 200, audioBitrateKbps: 64 },
  { label: "240p", height: 240, videoBitrateKbps: 400, audioBitrateKbps: 80 },
  { label: "360p", height: 360, videoBitrateKbps: 800, audioBitrateKbps: 96 },
  { label: "480p", height: 480, videoBitrateKbps: 1400, audioBitrateKbps: 128 },
  { label: "720p", height: 720, videoBitrateKbps: 2800, audioBitrateKbps: 128 },
  { label: "1080p", height: 1080, videoBitrateKbps: 5000, audioBitrateKbps: 192 },
];

export const AUDIO_LADDER: AudioTier[] = [
  { label: "128kbps", bitrateKbps: 128 },
  { label: "256kbps", bitrateKbps: 256 },
  { label: "320kbps", bitrateKbps: 320 },
];

export const VIDEO_LABELS = VIDEO_LADDER.map((t) => t.label);
export const AUDIO_LABELS = AUDIO_LADDER.map((t) => t.label);
