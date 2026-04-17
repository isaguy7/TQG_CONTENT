"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartPostButton({ figureId }: { figureId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figure_id: figureId }),
      });
      const body = await res.json();
      if (!res.ok || !body.post?.id) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.push(`/content/${body.post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={onClick}
        disabled={pending}
        className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Creating..." : "Start post about this figure"}
      </button>
      {error ? (
        <p className="text-[11px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
