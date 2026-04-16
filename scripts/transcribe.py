#!/usr/bin/env python3
"""
TQG Content Studio — WhisperX transcription runner.

Called by lib/whisper.ts as a subprocess. Writes structured JSON to an
output file (never stdout) so the Node wrapper reads it after process
exit rather than parsing a noisy stream.

Usage:
    python transcribe.py \
        --audio path/to/audio.wav \
        --output path/to/result.json \
        --model large-v3 \
        --device cuda \
        --compute-type float16 \
        --batch-size 16 \
        --language auto

On success: exits 0, result.json contains { "segments": [...], "language": "..." }
On failure: exits 1, writes { "error": str, "traceback": str } to result.json
            (stderr is also captured by the Node wrapper for diagnostics).
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path


def write_error(output_path: Path, exc: BaseException) -> None:
    payload = {
        "error": f"{type(exc).__name__}: {exc}",
        "traceback": traceback.format_exc(),
    }
    try:
        output_path.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        # Last resort: dump to stderr. Node wrapper keeps last 20 lines.
        print(json.dumps(payload), file=sys.stderr, flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="WhisperX transcribe runner")
    parser.add_argument("--audio", required=True, help="Path to input audio (wav)")
    parser.add_argument("--output", required=True, help="Path to JSON output")
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="float16")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument(
        "--language",
        default="auto",
        help="Language code (en/ar/...) or 'auto' to detect",
    )
    parser.add_argument(
        "--no-align",
        action="store_true",
        help="Skip wav2vec2 forced alignment (faster, no word timestamps)",
    )
    args = parser.parse_args()

    audio_path = Path(args.audio)
    output_path = Path(args.output)

    if not audio_path.exists():
        write_error(output_path, FileNotFoundError(f"Audio not found: {audio_path}"))
        return 1

    try:
        # Import lazily so --help doesn't require CUDA/torch to be installed
        import whisperx  # type: ignore

        print(f"Loading model: {args.model} on {args.device}", file=sys.stderr, flush=True)
        model = whisperx.load_model(
            args.model,
            device=args.device,
            compute_type=args.compute_type,
        )

        print(f"Loading audio: {audio_path}", file=sys.stderr, flush=True)
        audio = whisperx.load_audio(str(audio_path))

        lang = None if args.language == "auto" else args.language
        print("Transcribing...", file=sys.stderr, flush=True)
        result = model.transcribe(
            audio,
            batch_size=args.batch_size,
            language=lang,
        )
        detected_language = result.get("language") or lang or "unknown"

        # Forced alignment for word-level timestamps.
        if not args.no_align:
            try:
                print(
                    f"Aligning (language={detected_language})...",
                    file=sys.stderr,
                    flush=True,
                )
                align_model, align_metadata = whisperx.load_align_model(
                    language_code=detected_language,
                    device=args.device,
                )
                result = whisperx.align(
                    result["segments"],
                    align_model,
                    align_metadata,
                    audio,
                    device=args.device,
                    return_char_alignments=False,
                )
            except Exception as align_err:  # noqa: BLE001
                # Alignment can fail for rare languages or short clips.
                # Keep segment-level transcript; note the failure.
                print(
                    f"Alignment failed ({align_err}); returning segment-level only",
                    file=sys.stderr,
                    flush=True,
                )

        payload = {
            "language": detected_language,
            "segments": result.get("segments", []),
            "model": args.model,
            "aligned": not args.no_align,
        }
        output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        print("Done.", file=sys.stderr, flush=True)
        return 0
    except BaseException as exc:  # noqa: BLE001
        write_error(output_path, exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
