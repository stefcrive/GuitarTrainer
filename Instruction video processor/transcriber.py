from __future__ import annotations

from pathlib import Path
import hashlib
from typing import Any

from config import AppConfig
from utils import seconds_to_hhmmss, write_text
from persistent_cache import atomic_json


class TranscriptionError(RuntimeError):
    pass


def transcribe_audio(audio_path: str | Path, config: AppConfig) -> dict[str, Any]:
    try:
        from faster_whisper import WhisperModel, BatchedInferencePipeline
    except ImportError as exc:
        raise TranscriptionError(
            "faster-whisper is not installed. Install requirements.txt before processing videos."
        ) from exc

    language = None if config.language == "auto" else config.language
    model = WhisperModel(
        config.whisper_model,
        device=config.whisper_device,
        compute_type=config.whisper_compute_type,
        cpu_threads=max(1, int(config.whisper_cpu_threads)),
        num_workers=max(1, int(config.whisper_num_workers)),
    )
    if config.transcription_mode == "fast":
        segments_iter, info = BatchedInferencePipeline(model=model).transcribe(
            str(audio_path), language=language, vad_filter=True, batch_size=4, beam_size=5,
            without_timestamps=False)
    else:
        segments_iter, info = model.transcribe(str(audio_path), language=language, vad_filter=True, beam_size=5)
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
        if idx % 25 == 0:
            print(f"MARKER_PHASE: Transcribed through {seconds_to_hhmmss(segment.end)}", flush=True)
    return {
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "segments": segments,
    }


def save_transcript_outputs(video_id: int, transcript: dict[str, Any], output_folder: str | Path) -> dict[str, Path]:
    base = Path(output_folder) / "transcripts"
    json_path = base / f"{video_id}.json"
    txt_path = base / f"{video_id}.txt"
    if json_path.exists():
        # Keep legacy copies too, including transcripts made before the archive existed.
        previous = json_path.read_bytes()
        version_path = base / "versions" / f"{video_id}-{hashlib.sha256(previous).hexdigest()}.json"
        version_path.parent.mkdir(parents=True, exist_ok=True)
        if not version_path.exists():
            version_path.write_bytes(previous)
    atomic_json(json_path, transcript)
    lines = []
    for segment in transcript.get("segments", []):
        start = seconds_to_hhmmss(segment.get("start_seconds", 0))
        end = seconds_to_hhmmss(segment.get("end_seconds", 0))
        text = segment.get("text", "")
        lines.append(f"[{start} - {end}] {text}".rstrip())
    write_text(txt_path, "\n".join(lines) + ("\n" if lines else ""))
    return {"json": json_path, "txt": txt_path}
