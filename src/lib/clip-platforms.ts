export type ClipPlatformId =
  | "x"
  | "instagram_reels"
  | "youtube_shorts"
  | "facebook";

export type ClipPlatformPreset = {
  id: ClipPlatformId;
  label: string;
  width: number;
  height: number;
  aspectLabel: string;
  maxSeconds: number;
};

export const CLIP_PLATFORMS: Record<ClipPlatformId, ClipPlatformPreset> = {
  x: {
    id: "x",
    label: "X (Twitter)",
    width: 1080,
    height: 1080,
    aspectLabel: "1:1",
    maxSeconds: 20,
  },
  instagram_reels: {
    id: "instagram_reels",
    label: "Instagram Reels",
    width: 1080,
    height: 1920,
    aspectLabel: "9:16",
    maxSeconds: 60,
  },
  youtube_shorts: {
    id: "youtube_shorts",
    label: "YouTube Shorts",
    width: 1080,
    height: 1920,
    aspectLabel: "9:16",
    maxSeconds: 60,
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    width: 1080,
    height: 1080,
    aspectLabel: "1:1",
    maxSeconds: 20,
  },
};

export function getClipPlatform(
  id: string | null | undefined
): ClipPlatformPreset {
  if (id && id in CLIP_PLATFORMS)
    return CLIP_PLATFORMS[id as ClipPlatformId];
  return CLIP_PLATFORMS.x;
}
