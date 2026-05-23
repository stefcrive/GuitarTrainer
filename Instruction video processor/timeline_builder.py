from __future__ import annotations

from typing import Any


ALLOWED_SEGMENT_TYPES = {
    "speech_explanation",
    "guitar_demonstration",
    "guitar_exercise",
    "guitar_performance",
    "short_example",
    "mixed_speech_and_guitar",
    "tuning_or_setup",
    "backing_track",
    "silence_or_transition",
    "noise_or_unclear",
    "other",
}


def build_timeline(
    transcript_segments: list[dict[str, Any]],
    audio_events: list[dict[str, Any]],
    *,
    duration_seconds: float | None,
    filename: str,
    relative_path: str,
) -> list[dict[str, Any]]:
    if not audio_events and transcript_segments:
        return [_timeline_from_transcript(segment, idx) for idx, segment in enumerate(transcript_segments)]

    groups = _merge_audio_windows(audio_events)
    timeline: list[dict[str, Any]] = []
    for group in groups:
        overlapping_transcript = _collect_transcript_segments(
            group["start_seconds"],
            group["end_seconds"],
            transcript_segments,
        )
        transcript_text = " ".join(segment["text"] for segment in overlapping_transcript)
        segment_type = _infer_segment_type(group, bool(transcript_text))
        title = _title_for(segment_type, filename)
        timeline.append(
            {
                "start_seconds": group["start_seconds"],
                "end_seconds": group["end_seconds"],
                "segment_type": segment_type,
                "title": title,
                "summary": "",
                "confidence": group["confidence"],
                "source_evidence": f"Audio labels: {', '.join(group['audio_labels'])}; transcript present: {bool(transcript_text)}",
                "transcript_text": transcript_text,
                "transcript_segments": overlapping_transcript,
                "audio_labels": group["audio_labels"],
                "tags": [],
                "filename": filename,
                "relative_path": relative_path,
            }
        )

    if not timeline and duration_seconds:
        timeline.append(
            {
                "start_seconds": 0.0,
                "end_seconds": duration_seconds,
                "segment_type": "other",
                "title": filename,
                "summary": "",
                "confidence": 0.2,
                "source_evidence": "No transcript or audio events were available.",
                "transcript_text": "",
                "audio_labels": [],
                "tags": [],
                "filename": filename,
                "relative_path": relative_path,
            }
        )
    return timeline


def _timeline_from_transcript(segment: dict[str, Any], idx: int) -> dict[str, Any]:
    return {
        "start_seconds": float(segment.get("start_seconds", 0)),
        "end_seconds": float(segment.get("end_seconds", 0)),
        "segment_type": "speech_explanation",
        "title": f"Speech section {idx + 1}",
        "summary": "",
        "confidence": 0.65,
        "source_evidence": "Whisper transcript segment.",
        "transcript_text": segment.get("text", ""),
        "transcript_segments": [
            {
                "start_seconds": float(segment.get("start_seconds", 0)),
                "end_seconds": float(segment.get("end_seconds", 0)),
                "text": segment.get("text", ""),
            }
        ],
        "audio_labels": ["speech"],
        "tags": [],
    }


def _merge_audio_windows(audio_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for event in audio_events:
        dominant = _dominant_audio_type(event)
        labels = list(event.get("top_labels", []))
        if current and current["dominant"] == dominant and event["start_seconds"] <= current["end_seconds"] + 2.0:
            current["end_seconds"] = max(current["end_seconds"], event["end_seconds"])
            current["audio_labels"] = _merge_labels(current["audio_labels"], labels)
            current["confidence"] = max(current["confidence"], _dominant_score(event))
            continue
        if current:
            groups.append(current)
        current = {
            "start_seconds": float(event.get("start_seconds", 0)),
            "end_seconds": float(event.get("end_seconds", 0)),
            "dominant": dominant,
            "audio_labels": labels,
            "confidence": _dominant_score(event),
        }
    if current:
        groups.append(current)
    return [group for group in groups if group["end_seconds"] - group["start_seconds"] >= 0.5]


def _dominant_audio_type(event: dict[str, Any]) -> str:
    scores = {
        "speech": float(event.get("speech_score") or 0),
        "music": float(event.get("music_score") or 0),
        "guitar": float(event.get("guitar_or_instrument_score") or 0),
        "noise": float(event.get("silence_or_noise_score") or 0),
    }
    if scores["speech"] >= 0.45 and max(scores["music"], scores["guitar"]) >= 0.18:
        return "mixed"
    return max(scores, key=scores.get)


def _dominant_score(event: dict[str, Any]) -> float:
    return max(
        float(event.get("speech_score") or 0),
        float(event.get("music_score") or 0),
        float(event.get("guitar_or_instrument_score") or 0),
        float(event.get("silence_or_noise_score") or 0),
    )


def _merge_labels(a: list[str], b: list[str]) -> list[str]:
    result = []
    for label in a + b:
        if label not in result:
            result.append(label)
    return result[:8]


def _collect_transcript(start: float, end: float, segments: list[dict[str, Any]]) -> str:
    return " ".join(segment["text"] for segment in _collect_transcript_segments(start, end, segments))


def _collect_transcript_segments(start: float, end: float, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    parts = []
    for segment in segments:
        seg_start = float(segment.get("start_seconds", 0))
        seg_end = float(segment.get("end_seconds", 0))
        if seg_start < end and seg_end > start:
            text = segment.get("text", "").strip()
            if text:
                parts.append(
                    {
                        "start_seconds": seg_start,
                        "end_seconds": seg_end,
                        "text": text,
                    }
                )
    return parts


def _infer_segment_type(group: dict[str, Any], has_transcript: bool) -> str:
    dominant = group["dominant"]
    labels = " ".join(group.get("audio_labels", [])).lower()
    if dominant == "mixed":
        return "mixed_speech_and_guitar"
    if dominant == "speech":
        return "speech_explanation"
    if dominant in {"music", "guitar"}:
        if "backing" in labels:
            return "backing_track"
        return "guitar_demonstration" if has_transcript else "guitar_performance"
    if dominant == "noise":
        return "silence_or_transition"
    return "other"


def _title_for(segment_type: str, filename: str) -> str:
    titles = {
        "speech_explanation": "Explanation",
        "guitar_demonstration": "Guitar demonstration",
        "guitar_exercise": "Guitar exercise",
        "guitar_performance": "Performance or music section",
        "mixed_speech_and_guitar": "Explanation with guitar",
        "silence_or_transition": "Transition",
        "noise_or_unclear": "Unclear audio",
    }
    return titles.get(segment_type, filename)

