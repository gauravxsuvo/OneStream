"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useDisplayName } from "@/lib/useDisplayName";

export function SiteHeader() {
  const pathname = usePathname();
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
    <header className="flex items-center justify-between border-b border-border px-5 py-4">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        One<span className="text-accent">Stream</span>
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link
          href="/"
          className={`rounded-lg px-3 py-1.5 transition ${pathname === "/" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"}`}
        >
          Home
        </Link>
        <Link
          href="/library"
          className={`rounded-lg px-3 py-1.5 transition ${pathname === "/library" ? "bg-surface text-foreground" : "text-muted hover:text-foreground"}`}
        >
          Library
        </Link>
        {ready && (
          <div className="ml-2 border-l border-border pl-3">
            {editing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={save}
                  placeholder="Your name"
                  className="w-28 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
                />
              </form>
            ) : (
              <button
                onClick={startEditing}
                className="rounded-lg px-3 py-1.5 text-muted transition hover:text-foreground"
                title="Change your display name"
              >
                {name || "Set your name"}
              </button>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
