export type RenditionStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type RenditionInfo = {
  label: string;
  status: RenditionStatus;
  height: number | null;
  bitrateKbps: number | null;
  size: number | null;
};

export type MediaItem = {
  id: string;
  title: string;
  type: "AUDIO" | "VIDEO";
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  thumbnailKey: string | null;
  renditions: RenditionInfo[];
};

export type RoomState = {
  code: string;
  name: string;
  isPlaying: boolean;
  positionSec: number;
  updatedAt: string;
  currentMedia: MediaItem | null;
};

export type ChatMsg = {
  sender: string;
  text: string;
  createdAt: string;
};
