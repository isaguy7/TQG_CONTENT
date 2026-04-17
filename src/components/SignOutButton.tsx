"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      onClick={handle}
      disabled={busy}
      className="px-3 py-1.5 rounded-md text-[12px] border border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04] disabled:opacity-40"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
