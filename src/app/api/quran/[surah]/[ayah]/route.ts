import { NextRequest, NextResponse } from "next/server";
import { getAyah } from "@/lib/quran-matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { surah: string; ayah: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const surah = Number(params.surah);
  const ayah = Number(params.ayah);
  if (
    !Number.isFinite(surah) ||
    !Number.isFinite(ayah) ||
    surah < 1 ||
    surah > 114 ||
    ayah < 1
  ) {
    return NextResponse.json(
      { error: "Invalid surah or ayah number" },
      { status: 400 }
    );
  }
  const row = await getAyah(surah, ayah);
  if (!row) {
    return NextResponse.json({ error: "Ayah not found" }, { status: 404 });
  }
  return NextResponse.json({ ayah: row });
}
