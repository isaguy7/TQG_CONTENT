/**
 * Detect whether we're running locally (with GPU / binary access) or on a
 * hosted platform like Vercel (web-only mode). Local instances can invoke
 * ffmpeg / WhisperX / yt-dlp subprocesses; hosted ones must refuse the
 * GPU-bound routes cleanly.
 */

export function isHosted(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

export function gpuAvailable(): boolean {
  if (isHosted()) return false;
  return true;
}

export function ffmpegAvailable(): boolean {
  if (isHosted()) return false;
  return true;
}

export function ytdlpAvailable(): boolean {
  if (isHosted()) return false;
  return true;
}
