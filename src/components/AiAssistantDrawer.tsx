"use client";

import { useMemo, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnsplashResult } from "@/lib/unsplash";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  images?: UnsplashResult[];
};

type Voice = "personal" | "tqg";

type SendResp = {
  available: boolean;
  reply?: string;
  imageQuery?: string | null;
  images?: UnsplashResult[];
  error?: string;
};

export function AiAssistantDrawer({
  postId,
  draft,
  figureName,
  hadithCount = 0,
  onInsert,
  onSelectImage,
}: {
  postId: string;
  draft: string;
  figureName?: string | null;
  hadithCount?: number;
  onInsert?: (text: string) => void;
  onSelectImage?: (url: string, rationale: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<Voice>("tqg");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I can punch up hooks, rewrite sections, check for AI slop, or suggest visuals. Share what you need.",
    },
  ]);

  const hasContext = useMemo(
    () => Boolean(figureName) || hadithCount > 0,
    [figureName, hadithCount]
  );

  const send = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    setError(null);
    const userTurn: ChatMessage = { role: "user", content: input.trim() };
    const optimisticAssistant: ChatMessage = {
      role: "assistant",
      content: "Thinking…",
      pending: true,
    };
    const history = [...messages, userTurn, optimisticAssistant];
    setMessages(history);
    setInput("");
    try {
      const res = await fetch("/api/claude/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userTurn.content,
          voice,
          post_id: postId,
          draft,
          history: history
            .filter((m) => !m.pending)
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const j: SendResp = await res.json();
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? {
                role: "assistant",
                content:
                  j.available && j.reply
                    ? j.reply
                    : j.error || "Assistant unavailable right now.",
                images: j.images || [],
              }
            : m
        )
      );
      if (!j.available) {
        setError("Anthropic is not configured. Copy text into Claude instead.");
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? {
                role: "assistant",
                content: (err as Error).message,
              }
            : m
        )
      );
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-50 hover:from-emerald-500/25 hover:to-cyan-500/25 hover:border-emerald-400/50 transition-all duration-200"
      >
        <Sparkles className="w-4 h-4 text-emerald-200" />
        AI Assistant
      </button>

      <div
        className={cn(
          "fixed inset-0 z-40 transition-all duration-200",
          open ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute right-0 top-0 h-full w-full max-w-[420px] bg-white/[0.06] backdrop-blur-md border-l border-white/[0.08] shadow-2xl shadow-black/40 flex flex-col",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.08]">
            <div>
              <div className="text-[12px] font-semibold text-white/85">
                Dual-voice assistant
              </div>
              <div className="text-[11px] text-white/45">
                Context-aware · responds in chat
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[11px] text-white/50 hover:text-white/85"
            >
              Close
            </button>
          </header>

          <div className="px-4 py-3 border-b border-white/[0.08] flex items-center gap-2">
            <button
              onClick={() => setVoice("personal")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] border transition-all duration-200",
                voice === "personal"
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-50"
                  : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:border-white/[0.15]"
              )}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Personal voice
            </button>
            <button
              onClick={() => setVoice("tqg")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] border transition-all duration-200",
                voice === "tqg"
                  ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-50"
                  : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:border-white/[0.15]"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              TQG voice
            </button>
          </div>

          <div className="px-4 py-2 text-[11px] text-white/50 flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-2 py-1 border border-white/[0.06]">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Live draft
            </span>
            {hasContext ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-2 py-1 border border-white/[0.06]">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                {figureName ? `${figureName}` : "Figure / Hadith attached"}
                {hadithCount > 0 ? ` · ${hadithCount} hadith` : null}
              </span>
            ) : (
              <span className="text-white/40">No figure or hadith linked</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, idx) => (
              <div
                key={`${m.role}-${idx}-${m.content.slice(0, 12)}`}
                className={cn(
                  "rounded-xl p-3 border",
                  m.role === "user"
                    ? "bg-white/[0.04] border-white/[0.08]"
                    : "bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border-emerald-500/30"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] uppercase tracking-wide text-white/45">
                    {m.role === "user" ? "You" : "Assistant"}
                  </span>
                  {m.pending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white/60" />
                  ) : null}
                </div>
                <div className="text-[13px] text-white/85 whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>

                {m.images && m.images.length > 0 ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {m.images.map((img) => (
                      <button
                        key={img.id}
                        className="group relative rounded-lg overflow-hidden border border-white/[0.1] hover:border-emerald-400/60 transition-all"
                        onClick={() =>
                          onSelectImage?.(
                            img.urls.regular,
                            `Photo by ${img.photographer} on Unsplash (${img.photographer_url})`
                          )
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.urls.small}
                          alt={img.alt}
                          className="w-full h-28 object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white/80 line-clamp-2 text-left">
                          <span className="inline-flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded">
                            <ImageIcon className="w-3 h-3" />
                            Use in post
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {m.role === "assistant" && !m.pending ? (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-white/60">
                    {onInsert ? (
                      <button
                        onClick={() => onInsert(m.content)}
                        className="px-2 py-1 rounded border border-white/[0.12] hover:border-emerald-400/50 hover:text-emerald-100 transition-all"
                      >
                        Insert into draft
                      </button>
                    ) : null}
                    <button
                      onClick={() => navigator.clipboard.writeText(m.content)}
                      className="px-2 py-1 rounded border border-white/[0.08] hover:border-white/[0.16]"
                    >
                      Copy
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <footer className="border-t border-white/[0.08] p-3 space-y-2">
            {error ? (
              <div className="text-[12px] text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded px-2 py-1">
                {error}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask for hooks, rewrites, visuals…"
                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-white/85 placeholder-white/35 focus:outline-none focus:border-emerald-400/60"
                rows={2}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="shrink-0 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-[12px] font-semibold text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-40 transition-all"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </footer>
        </aside>
      </div>
    </>
  );
}
