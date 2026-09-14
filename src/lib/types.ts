export type MediaItem = {
  id: string;
  title: string;
  type: "AUDIO" | "VIDEO";
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
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
