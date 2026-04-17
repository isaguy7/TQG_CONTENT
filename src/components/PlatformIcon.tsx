import { cn } from "@/lib/utils";

type Props = {
  platform: string;
  size?: "xs" | "sm" | "md";
  className?: string;
};

const LETTER: Record<string, string> = {
  linkedin: "in",
  x: "X",
  instagram: "IG",
  facebook: "f",
};

const TONE: Record<string, string> = {
  linkedin: "bg-sky-500/20 text-sky-300 border-sky-400/30",
  x: "bg-white/10 text-white/85 border-white/20",
  instagram: "bg-pink-500/20 text-pink-300 border-pink-400/30",
  facebook: "bg-indigo-500/20 text-indigo-300 border-indigo-400/30",
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  xs: "w-4 h-4 text-[8px]",
  sm: "w-[18px] h-[18px] text-[9px]",
  md: "w-5 h-5 text-[10px]",
};

export function PlatformIcon({ platform, size = "sm", className }: Props) {
  const letter = LETTER[platform] || platform.slice(0, 2).toUpperCase();
  const tone = TONE[platform] || "bg-white/10 text-white/75 border-white/15";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded font-bold uppercase border",
        SIZE[size],
        tone,
        className
      )}
    >
      {letter}
    </span>
  );
}
