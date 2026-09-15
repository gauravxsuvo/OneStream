"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socketClient";
import { useDisplayName } from "@/lib/useDisplayName";
import { Player, type PlayerHandle } from "@/components/Player";
import { Chat } from "@/components/Chat";
import { LibraryPanel } from "@/components/LibraryPanel";
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
          Join OneStream
        </button>
      </form>
    </main>
  );
}

function ConnectionDot({ status }: { status: "connected" | "connecting" | "disconnected" }) {
  const color =
    status === "connected" ? "bg-emerald-400" : status === "connecting" ? "bg-amber-400" : "bg-danger";
  const label = status === "connected" ? "Connected" : status === "connecting" ? "Reconnecting…" : "Disconnected";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={label}>
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function RoomView() {
  const { name, setName, ready } = useDisplayName();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [presence, setPresence] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [copied, setCopied] = useState(false);
  const [panelTab, setPanelTab] = useState<"library" | "chat">("library");
  const [connection, setConnection] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [unreadChat, setUnreadChat] = useState(0);
  const playerRef = useRef<PlayerHandle>(null);
  const panelTabRef = useRef(panelTab);

  function switchTab(tab: "library" | "chat") {
    panelTabRef.current = tab;
    setPanelTab(tab);
    if (tab === "chat") setUnreadChat(0);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/room").then(async (res) => {
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setRoom(data);
      setMessages(data.messages.map((m: ChatMsg) => ({ sender: m.sender, text: m.text, createdAt: m.createdAt })));
      switchTab(data.currentMedia ? "chat" : "library");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !name || loadError || !room) return;
    const socket = getSocket();

    function handlePresence(names: string[]) {
      setPresence(names);
    }
    function handleRoomState(state: RoomState) {
      setRoom(state);
    }
    function handleChat(msg: ChatMsg) {
      setMessages((prev) => [...prev, msg]);
      setUnreadChat((n) => (panelTabRef.current === "chat" ? 0 : n + 1));
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
    function onConnect() {
      setConnection("connected");
      socket.emit("room:join", { name });
    }
    function onDisconnect() {
      setConnection("disconnected");
    }
    function onReconnectAttempt() {
      setConnection("connecting");
    }

    socket.on("room:presence", handlePresence);
    socket.on("room:state", handleRoomState);
    socket.on("chat:message", handleChat);
    socket.on("player:play", handlePlay);
    socket.on("player:pause", handlePause);
    socket.on("player:seek", handleSeek);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    if (socket.connected) onConnect();

    return () => {
      socket.off("room:presence", handlePresence);
      socket.off("room:state", handleRoomState);
      socket.off("chat:message", handleChat);
      socket.off("player:play", handlePlay);
      socket.off("player:pause", handlePause);
      socket.off("player:seek", handleSeek);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
    };
    // `room` is intentionally excluded — it's updated by these very handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, name, loadError]);

  function selectMedia(media: MediaItem) {
    getSocket().emit("player:select", { mediaId: media.id });
    switchTab("chat");
  }

  function sendChat(text: string) {
    getSocket().emit("chat:message", { text });
  }

  function copyInvite() {
    navigator.clipboard?.writeText(window.location.origin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-[70dvh] max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-medium">Couldn&apos;t reach OneStream</p>
        <p className="text-sm text-muted">Check your connection and reload the page.</p>
      </main>
    );
  }

  if (!ready || !room) return null;

  if (!name) {
    return <NamePrompt onSubmit={setName} />;
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">OneStream</h1>
          <ConnectionDot status={connection} />
        </div>
        <button onClick={copyInvite} className="btn-secondary text-xs">
          {copied ? "Copied!" : "Copy invite link"}
        </button>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          <Player
            ref={playerRef}
            media={room.currentMedia}
            initial={{
              isPlaying: room.isPlaying,
              positionSec: room.positionSec,
              updatedAt: room.updatedAt,
            }}
            onLocalPlay={(pos) => getSocket().emit("player:play", { positionSec: pos })}
            onLocalPause={(pos) => getSocket().emit("player:pause", { positionSec: pos })}
            onLocalSeek={(pos) => getSocket().emit("player:seek", { positionSec: pos })}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => switchTab("library")} className="btn-secondary text-sm">
              {room.currentMedia ? "Change what's playing" : "Pick something to play"}
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">
                {presence.length} watching
              </span>
              {presence.slice(0, 6).map((n, i) => (
                <span key={`${n}-${i}`} className="rounded-full bg-surface-hover px-2.5 py-1 text-xs text-foreground">
                  {n}
                </span>
              ))}
              {presence.length > 6 && (
                <span className="text-xs text-muted">+{presence.length - 6} more</span>
              )}
            </div>
          </div>
        </div>

        <div className="card flex h-[30rem] flex-col overflow-hidden sm:h-[34rem] lg:h-[calc(100vh-11rem)] lg:min-h-[28rem]">
          <div className="flex border-b border-border">
            <button
              onClick={() => switchTab("library")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                panelTab === "library" ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              Library
              {panelTab === "library" && <span className="mt-1.5 block h-0.5 rounded-full bg-accent" />}
            </button>
            <button
              onClick={() => switchTab("chat")}
              className={`relative flex-1 px-4 py-2.5 text-sm font-medium transition ${
                panelTab === "chat" ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              Chat
              {unreadChat > 0 && panelTab !== "chat" && (
                <span className="absolute right-4 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                  {unreadChat}
                </span>
              )}
              {panelTab === "chat" && <span className="mt-1.5 block h-0.5 rounded-full bg-accent" />}
            </button>
          </div>

          <div className="min-h-0 flex-1 p-3">
            {panelTab === "library" ? (
              <LibraryPanel onSelect={selectMedia} currentMediaId={room.currentMedia?.id} />
            ) : (
              <Chat messages={messages} onSend={sendChat} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
