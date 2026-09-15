"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function EnterForm() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        const dest = params.get("next") || "/";
        router.replace(dest);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Wrong passcode");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center gap-6 px-6">
      <div className="flex flex-col items-center text-center">
        <svg viewBox="0 0 160 160" className="mb-3 h-10 w-10 fill-accent" aria-hidden>
          <path d="M80,49.49c16.83,0,30.51,13.69,30.51,30.51s-13.69,30.51-30.51,30.51-30.51-13.69-30.51-30.51,13.69-30.51,30.51-30.51M80,24.49c-30.66,0-55.51,24.85-55.51,55.51s24.85,55.51,55.51,55.51,55.51-24.85,55.51-55.51-24.85-55.51-55.51-55.51h0Z" />
        </svg>
        <h1 className="text-2xl font-semibold tracking-tight">
          One<span className="text-accent">Stream</span>
        </h1>
        <p className="mt-1 text-sm text-muted">This room has one passcode. Enter it to join.</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          className="input"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={loading || !passcode} className="btn-primary">
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
