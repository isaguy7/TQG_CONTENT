"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { FigureForm } from "@/components/figures/FigureForm";

export default function NewFigurePage() {
  const router = useRouter();
  return (
    <PageShell
      title="Add figure"
      description="Create a new entry in the Islamic figures library."
    >
      <Link
        href="/figures"
        className="inline-flex items-center gap-1 text-[12px] text-zinc-400 hover:text-white mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        All figures
      </Link>
      <FigureForm
        mode="create"
        onSuccess={(slug) => router.push(`/figures/${slug}`)}
        onCancel={() => router.push("/figures")}
      />
    </PageShell>
  );
}
