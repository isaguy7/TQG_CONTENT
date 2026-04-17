"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  labels: string[];
  onChange: (labels: string[]) => void;
};

/**
 * Deterministic colour pick for a label. Stable across renders so the
 * same tag gets the same tint every time.
 */
function labelTone(label: string): string {
  const palette = [
    "bg-emerald-500/15 text-emerald-200 border-emerald-400/30",
    "bg-sky-500/15 text-sky-200 border-sky-400/30",
    "bg-pink-500/15 text-pink-200 border-pink-400/30",
    "bg-amber-500/15 text-amber-200 border-amber-400/30",
    "bg-violet-500/15 text-violet-200 border-violet-400/30",
    "bg-indigo-500/15 text-indigo-200 border-indigo-400/30",
  ];
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

export function PostLabels({ labels, onChange }: Props) {
  const [input, setInput] = useState("");
  const [local, setLocal] = useState<string[]>(labels);

  useEffect(() => {
    setLocal(labels);
  }, [labels]);

  const commit = (next: string[]) => {
    setLocal(next);
    onChange(next);
  };

  const add = (raw: string) => {
    const v = raw.trim().replace(/^,+|,+$/g, "").trim();
    if (!v) return;
    if (local.includes(v)) return;
    commit([...local, v]);
    setInput("");
  };

  const remove = (label: string) => {
    commit(local.filter((l) => l !== label));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && !input && local.length > 0) {
      remove(local[local.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {local.map((l) => (
        <span
          key={l}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px]",
            labelTone(l)
          )}
        >
          {l}
          <button
            onClick={() => remove(l)}
            aria-label={`Remove label ${l}`}
            className="text-[12px] leading-none hover:text-white/90 opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (input.trim()) add(input);
        }}
        placeholder={local.length === 0 ? "Add labels…" : "+"}
        className="bg-transparent border-0 text-[12px] text-white/85 placeholder-white/30 focus:outline-none min-w-[80px] py-0.5"
      />
    </div>
  );
}
