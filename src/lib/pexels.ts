/**
 * Thin wrapper for Pexels video search. The Pexels API is free and
 * straightforward — header-based auth with a single key.
 * Docs: https://www.pexels.com/api/documentation/#videos
 */

export type PexelsVideoFile = {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
};

export type PexelsVideoPicture = {
  id: number;
  picture: string;
  nr: number;
};

export type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
  video_pictures: PexelsVideoPicture[];
  user?: { id: number; name: string; url: string };
};

export type PexelsSearchResponse = {
  videos: PexelsVideo[];
  total_results: number;
  per_page: number;
};

function apiKey(): string | null {
  const v = process.env.PEXELS_API_KEY?.trim();
  return v && v.length > 0 ? v : null;
}

export function pexelsAvailable(): boolean {
  return apiKey() !== null;
}

/**
 * Compact representation returned to the client — enough to render a
 * picker and download the selected file later without re-hitting Pexels.
 */
export type StockVideo = {
  id: number;
  duration: number;
  width: number;
  height: number;
  thumbnail: string;
  preview_url: string;
  download_url: string; // picks the closest HD quality file
  credit: {
    user: string;
    user_url: string;
    source_url: string;
  };
};

function pickBestFile(
  files: PexelsVideoFile[],
  targetWidth: number,
  targetHeight: number
): PexelsVideoFile | null {
  if (files.length === 0) return null;
  // Prefer mp4, then closest match to the requested dimensions without
  // going smaller than the target. Fall back to the largest available.
  const mp4 = files.filter((f) => f.file_type === "video/mp4");
  const pool = mp4.length > 0 ? mp4 : files;
  const acceptable = pool.filter(
    (f) => f.width >= targetWidth && f.height >= targetHeight
  );
  const ranked = (acceptable.length > 0 ? acceptable : pool).slice().sort(
    (a, b) => {
      const aDiff = Math.abs(a.width - targetWidth);
      const bDiff = Math.abs(b.width - targetWidth);
      return aDiff - bDiff;
    }
  );
  return ranked[0] || null;
}

export async function searchPexelsVideos(
  query: string,
  opts: {
    perPage?: number;
    orientation?: "landscape" | "portrait" | "square";
    targetWidth?: number;
    targetHeight?: number;
  } = {}
): Promise<StockVideo[]> {
  const key = apiKey();
  if (!key) return [];
  const perPage = Math.min(24, Math.max(3, opts.perPage ?? 6));
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(perPage));
  if (opts.orientation) url.searchParams.set("orientation", opts.orientation);

  const res = await fetch(url.toString(), {
    headers: { Authorization: key },
  });
  if (!res.ok) {
    throw new Error(
      `Pexels ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`
    );
  }
  const data = (await res.json()) as PexelsSearchResponse;
  const tw = opts.targetWidth ?? 1080;
  const th = opts.targetHeight ?? 1080;

  return (data.videos || []).map((v) => {
    const best = pickBestFile(v.video_files, tw, th);
    return {
      id: v.id,
      duration: v.duration,
      width: v.width,
      height: v.height,
      thumbnail: v.image,
      preview_url: best?.link || v.video_files[0]?.link || v.image,
      download_url: best?.link || v.video_files[0]?.link || "",
      credit: {
        user: v.user?.name || "Pexels",
        user_url: v.user?.url || "https://pexels.com",
        source_url: v.url,
      },
    };
  });
}
