"use client";

import Link from "next/link";
import { useState } from "react";
import { useDisplayName } from "@/lib/useDisplayName";

export function SiteHeader() {
  const { name, setName, ready } = useDisplayName();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEditing() {
    setDraft(name);
    setEditing(true);
  }

  function save() {
    const trimmed = draft.trim().slice(0, 40);
    if (trimmed) setName(trimmed);
    setEditing(false);
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <svg viewBox="0 0 160 160" className="h-6 w-6 fill-accent" aria-hidden>
          <path d="M80,49.49c16.83,0,30.51,13.69,30.51,30.51s-13.69,30.51-30.51,30.51-30.51-13.69-30.51-30.51,13.69-30.51,30.51-30.51M80,24.49c-30.66,0-55.51,24.85-55.51,55.51s24.85,55.51,55.51,55.51,55.51-24.85,55.51-55.51-24.85-55.51-55.51-55.51h0Z" />
        </svg>
        <span>
          One<span className="text-accent">Stream</span>
        </span>
      </Link>

      {ready && (
        <div>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={save}
                placeholder="Your name"
                className="w-28 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent sm:w-36"
              />
            </form>
          ) : (
            <button
              onClick={startEditing}
              className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:bg-surface hover:text-foreground sm:text-sm"
              title="Change your display name"
            >
              {name || "Set your name"}
            </button>
          )}
        </div>
      )}
    </header>
  );
}
