"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName || "Watch Party" }),
      });
      if (!res.ok) throw new Error("Could not create room");
      const room = await res.json();
      router.push(`/room/${room.code}`);
    } catch {
      setError("Something went wrong creating the room.");
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (!res.ok) {
        setError("No room with that code.");
        return;
      }
      router.push(`/room/${code}`);
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Watch &amp; listen together
        </h1>
        <p className="mt-2 text-muted">
          Upload your own music and movies, then sync playback with your friends in a room.
        </p>
      </div>

      {error && (
        <p className="mx-auto rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <form onSubmit={createRoom} className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-medium">Start a new room</h2>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Room name (e.g. Friday Movie Night)"
            className="input"
          />
          <button type="submit" disabled={creating} className="btn-primary">
            {creating ? "Creating…" : "Create room"}
          </button>
        </form>

        <form onSubmit={joinRoom} className="card flex flex-col gap-3 p-5">
          <h2 className="text-sm font-medium">Join an existing room</h2>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={5}
            className="input uppercase tracking-widest"
          />
          <button type="submit" disabled={joining || !joinCode} className="btn-secondary">
            {joining ? "Joining…" : "Join room"}
          </button>
        </form>
      </div>

      <div className="text-center text-sm text-muted">
        Want to add media first?{" "}
        <a href="/library" className="text-accent hover:underline">
          Go to the library
        </a>
      </div>
    </main>
  );
}
