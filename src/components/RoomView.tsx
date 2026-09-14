"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSocket } from "@/lib/socketClient";
import { useDisplayName } from "@/lib/useDisplayName";
import { Player, type PlayerHandle } from "@/components/Player";
import { Chat } from "@/components/Chat";
import { ParticipantList } from "@/components/ParticipantList";
import { MediaList } from "@/components/MediaList";
import type { ChatMsg, MediaItem, RoomState } from "@/lib/types";

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center gap-4 px-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">What should we call you?</h1>
        <p className="mt-1 text-sm text-muted">This is shown to others in the room.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim().slice(0, 40);
          if (trimmed) onSubmit(trimmed);
        }}
        className="flex flex-col gap-3"
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          className="input"
        />
        <button type="submit" disabled={!value.trim()} className="btn-primary">
          Continue
        </button>
      </form>
    </main>
  );
}

export function RoomView({ code }: { code: string }) {
  const { name, setName, ready } = useDisplayName();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [presence, setPresence] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [libraryItems, setLibraryItems] = useState<MediaItem[]>([]);
  const [copied, setCopied] = useState(false);
  const playerRef = useRef<PlayerHandle>(null);

  // Initial room fetch (also resumes chat history + last known playback state).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${code}`).then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setRoom(data);
      setMessages(data.messages.map((m: ChatMsg) => ({ sender: m.sender, text: m.text, createdAt: m.createdAt })));
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Socket wiring, once we know who's joining.
  useEffect(() => {
    if (!ready || !name || notFound || !room) return;
    const socket = getSocket();

    function handlePresence(names: string[]) {
      setPresence(names);
    }
    function handleRoomState(state: RoomState) {
      setRoom(state);
    }
    function handleChat(msg: ChatMsg) {
      setMessages((prev) => [...prev, msg]);
    }
    function handlePlay({ positionSec, at }: { positionSec: number; at: number }) {
      playerRef.current?.applyPlay(positionSec, at);
      setRoom((r) => (r ? { ...r, isPlaying: true, positionSec } : r));
    }
    function handlePause({ positionSec }: { positionSec: number }) {
      playerRef.current?.applyPause(positionSec);
      setRoom((r) => (r ? { ...r, isPlaying: false, positionSec } : r));
    }
    function handleSeek({ positionSec, at }: { positionSec: number; at: number }) {
      playerRef.current?.applySeek(positionSec, at);
      setRoom((r) => (r ? { ...r, positionSec } : r));
    }

    socket.on("room:presence", handlePresence);
    socket.on("room:state", handleRoomState);
    socket.on("chat:message", handleChat);
    socket.on("player:play", handlePlay);
    socket.on("player:pause", handlePause);
    socket.on("player:seek", handleSeek);

    socket.emit("room:join", { code, name });

    return () => {
      socket.off("room:presence", handlePresence);
      socket.off("room:state", handleRoomState);
      socket.off("chat:message", handleChat);
      socket.off("player:play", handlePlay);
      socket.off("player:pause", handlePause);
      socket.off("player:seek", handleSeek);
    };
    // `room` is intentionally excluded — it's updated by these very handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, name, notFound, code]);

  async function openPicker() {
    setShowPicker(true);
    if (libraryItems.length === 0) {
      const res = await fetch("/api/media");
      if (res.ok) setLibraryItems(await res.json());
    }
  }

  function selectMedia(media: MediaItem) {
    getSocket().emit("player:select", { code, mediaId: media.id });
    setShowPicker(false);
  }

  function sendChat(text: string) {
    getSocket().emit("chat:message", { code, text });
  }

  function copyInvite() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (notFound) {
    return (
      <main className="mx-auto flex min-h-[70dvh] max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-medium">Room not found</p>
        <p className="text-sm text-muted">The code “{code}” doesn’t match any active room.</p>
        <Link href="/" className="btn-secondary mt-2">
          Back home
        </Link>
      </main>
    );
  }

  if (!ready || !room) return null;

  if (!name) {
    return <NamePrompt onSubmit={setName} />;
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{room.name}</h1>
          <p className="text-sm text-muted">
            Room code <span className="font-mono tracking-widest">{room.code}</span>
          </p>
        </div>
        <button onClick={copyInvite} className="btn-secondary text-xs">
          {copied ? "Copied!" : "Copy invite link"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Player
            ref={playerRef}
            media={room.currentMedia}
            initial={{
              isPlaying: room.isPlaying,
              positionSec: room.positionSec,
              updatedAt: room.updatedAt,
            }}
            onLocalPlay={(pos) => getSocket().emit("player:play", { code, positionSec: pos })}
            onLocalPause={(pos) => getSocket().emit("player:pause", { code, positionSec: pos })}
            onLocalSeek={(pos) => getSocket().emit("player:seek", { code, positionSec: pos })}
          />
          <div>
            <button onClick={openPicker} className="btn-secondary text-sm">
              {room.currentMedia ? "Change what's playing" : "Pick something to play"}
            </button>
          </div>
          <ParticipantList names={presence} />
        </div>

        <div className="h-[28rem] lg:h-auto">
          <Chat messages={messages} onSend={sendChat} />
        </div>
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-h-[80vh] w-full max-w-lg overflow-y-auto p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Choose from the library</h2>
              <button onClick={() => setShowPicker(false)} className="btn-ghost px-2 py-1 text-xs">
                Close
              </button>
            </div>
            <MediaList
              items={libraryItems}
              onSelect={selectMedia}
              emptyLabel="Nothing uploaded yet — add media from the Library page first."
            />
          </div>
        </div>
      )}
    </main>
  );
}
