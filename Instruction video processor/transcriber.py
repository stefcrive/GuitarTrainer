from __future__ import annotations

from pathlib import Path
from typing import Any

from config import AppConfig
from utils import seconds_to_hhmmss, write_json, write_text


class TranscriptionError(RuntimeError):
    pass


def transcribe_audio(audio_path: str | Path, config: AppConfig) -> dict[str, Any]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise TranscriptionError(
            "faster-whisper is not installed. Install requirements.txt before processing videos."
        ) from exc

    language = None if config.language == "auto" else config.language
    model = WhisperModel(config.whisper_model)
    segments_iter, info = model.transcribe(str(audio_path), language=language, vad_filter=True)
    segments: list[dict[str, Any]] = []
    for idx, segment in enumerate(segments_iter):
        confidence = None
        if getattr(segment, "avg_logprob", None) is not None:
            confidence = float(segment.avg_logprob)
        segments.append(
            {
                "segment_index": idx,
                "start_seconds": float(segment.start),
                "end_seconds": float(segment.end),
                "text": segment.text.strip(),
                "confidence": confidence,
            }
        )
    return {
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "segments": segments,
    }


def save_transcript_outputs(video_id: int, transcript: dict[str, Any], output_folder: str | Path) -> dict[str, Path]:
    base = Path(output_folder) / "transcripts"
    json_path = base / f"{video_id}.json"
    txt_path = base / f"{video_id}.txt"
    write_json(json_path, transcript)
    lines = []
    for segment in transcript.get("segments", []):
        start = seconds_to_hhmmss(segment.get("start_seconds", 0))
        end = seconds_to_hhmmss(segment.get("end_seconds", 0))
        text = segment.get("text", "")
        lines.append(f"[{start} - {end}] {text}".rstrip())
    write_text(txt_path, "\n".join(lines) + ("\n" if lines else ""))
    return {"json": json_path, "txt": txt_path}

