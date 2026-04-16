#!/usr/bin/env python3
"""
TQG Content Studio — WhisperX transcription runner (streaming).

Streams segments to stderr as they're decoded so the Node wrapper can
forward them to the client in real time. Each decoded segment is
emitted as a marker line:

    TQG_META:{"duration": 123.45, "language": "en"}
    TQG_SEGMENT:{"start": 0.0, "end": 3.2, "text": "..."}
    TQG_SEGMENT:{"start": 3.2, "end": 6.7, "text": "..."}
    ...
    TQG_ALIGN_START
    TQG_DONE

On success, writes the final aligned payload to --output and exits 0.
On failure, writes {"error", "traceback"} to --output and exits 1.
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path


def emit(tag: str, data=None) -> None:
    if data is None:
        print(tag, file=sys.stderr, flush=True)
    else:
        print(f"{tag}:{json.dumps(data, ensure_ascii=False)}", file=sys.stderr, flush=True)


def write_error(output_path: Path, exc: BaseException) -> None:
    payload = {
        "error": f"{type(exc).__name__}: {exc}",
        "traceback": traceback.format_exc(),
    }
    try:
        output_path.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        print(json.dumps(payload), file=sys.stderr, flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="WhisperX streaming transcribe runner")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="int8_float16")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--language", default="auto")
    parser.add_argument("--no-align", action="store_true")
    args = parser.parse_args()

    audio_path = Path(args.audio)
    output_path = Path(args.output)

    if not audio_path.exists():
        write_error(output_path, FileNotFoundError(f"Audio not found: {audio_path}"))
        return 1

    try:
        from faster_whisper import WhisperModel  # type: ignore

        print(f"Loading model: {args.model} on {args.device}", file=sys.stderr, flush=True)
        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute_type,
        )

        print(f"Loading audio: {audio_path}", file=sys.stderr, flush=True)
        lang = None if args.language == "auto" else args.language

        # Stream segments as they're decoded. faster-whisper returns a generator
        # that yields Segment objects lazily; iterating drives decoding.
        segments_iter, info = model.transcribe(
            str(audio_path),
            language=lang,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )

        detected_language = info.language or lang or "unknown"
        total_duration = float(info.duration) if info.duration else 0.0

        emit(
            "TQG_META",
            {
                "duration": total_duration,
                "language": detected_language,
                "model": args.model,
            },
        )

        all_segments = []
        for seg in segments_iter:
            seg_dict = {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": seg.text,
            }
            all_segments.append(seg_dict)
            emit("TQG_SEGMENT", seg_dict)

        if not all_segments:
            emit("TQG_DONE")
            payload = {
                "language": detected_language,
                "segments": [],
                "model": args.model,
                "aligned": False,
            }
            output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            return 0

        # Word-level alignment via WhisperX.
        if not args.no_align:
            emit("TQG_ALIGN_START")
            try:
                import whisperx  # type: ignore

                audio = whisperx.load_audio(str(audio_path))
                align_model, align_metadata = whisperx.load_align_model(
                    language_code=detected_language,
                    device=args.device,
                )
                aligned = whisperx.align(
                    all_segments,
                    align_model,
                    align_metadata,
                    audio,
                    device=args.device,
                    return_char_alignments=False,
                )
                all_segments = aligned.get("segments", all_segments)
                aligned_flag = True
            except Exception as align_err:  # noqa: BLE001
                print(
                    f"Alignment failed ({align_err}); returning segment-level only",
                    file=sys.stderr,
                    flush=True,
                )
                aligned_flag = False
        else:
            aligned_flag = False

        payload = {
            "language": detected_language,
            "segments": all_segments,
            "model": args.model,
            "aligned": aligned_flag,
        }
        output_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        emit("TQG_DONE")
        return 0
    except BaseException as exc:  # noqa: BLE001
        write_error(output_path, exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
