"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMsg } from "@/lib/types";

export function Chat({ messages, onSend }: { messages: ChatMsg[]; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="card flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-sm text-muted">No messages yet — say hi.</p>}
        {messages.map((m, i) => (
          <div key={i} className="text-sm">
            <span className="font-medium text-accent">{m.sender}</span>{" "}
            <span className="text-foreground/90">{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message"
          className="input"
          maxLength={500}
        />
        <button type="submit" className="btn-primary px-4">
          Send
        </button>
      </form>
    </div>
  );
}
