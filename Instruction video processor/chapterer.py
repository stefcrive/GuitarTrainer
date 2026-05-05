from __future__ import annotations

import json
import os
from typing import Any

from config import AppConfig
from tagger import clean_llm_tags, infer_tags_from_text
from timeline_builder import ALLOWED_SEGMENT_TYPES
from utils import clamp, hhmmss_to_seconds, json_dumps, seconds_to_hhmmss


PROMPT = """You are analyzing a timestamped transcript and audio-event timeline from a guitar instructional video.

Your task is to create useful navigation chapters, semantic segment labels, and search metadata.

The video contains spoken explanation, guitar demonstration, exercises, performances, tuning/setup, and possibly backing tracks.

Use both transcript and audio evidence.

Rules:
- Use only information supported by the transcript, filename, folder path, or audio labels.
- Do not invent techniques, song names, chord names, or scale names unless explicitly spoken or strongly implied by filename/folder.
- Use timestamps from the provided timeline or nearest valid segment start.
- Prefer chapter boundaries where the instructional topic changes.
- Chapter titles must be concise and useful.
- Summaries must be one sentence.
- Tags must be specific and useful for search.
- Avoid generic tags like video, lesson, part, tutorial, music, guitar unless paired with a more specific tag.
- Distinguish speech explanation, guitar demonstration, guitar exercise, short example, performance, backing track, tuning/setup, and mixed speech+guitar when possible.
- If uncertain, use a conservative label and confidence below 0.6.
- Output valid JSON only.

Important classification guidance:
- A guitar performance is usually a longer continuous musical passage, often after phrases like "here is the full piece", "performance", "play-through", or "full tempo".
- A guitar exercise is usually short, repeated, technique-focused, slower, or introduced with phrases like "practice this", "repeat", "metronome", "slowly", "pattern", "exercise", "use your first finger", "alternate picking", etc.
- A guitar demonstration is a played example that illustrates a concept but is not necessarily a full performance or formal exercise.
- A short example is a brief played phrase used to explain a point.
- Mixed speech and guitar means the teacher talks while playing or alternates quickly between both.

Return JSON with this schema:
{
  "video_summary": "short overview of the video",
  "global_tags": ["tag1", "tag2", "tag3"],
  "timeline_segments": [
    {
      "start": "HH:MM:SS",
      "end": "HH:MM:SS",
      "type": "speech_explanation | guitar_demonstration | guitar_exercise | guitar_performance | short_example | mixed_speech_and_guitar | tuning_or_setup | backing_track | silence_or_transition | noise_or_unclear | other",
      "title": "short segment title",
      "summary": "one sentence",
      "confidence": 0.0,
      "tags": ["tag1", "tag2"],
      "evidence": "brief explanation based on transcript/audio evidence"
    }
  ],
  "chapters": [
    {
      "start": "HH:MM:SS",
      "end": "HH:MM:SS",
      "title": "chapter title",
      "summary": "one sentence summary",
      "confidence": 0.0,
      "tags": ["tag1", "tag2"]
    }
  ]
}

Input metadata:
{metadata}

Input timeline:
{timeline}
"""


class ChapteringError(RuntimeError):
    pass


def generate_chapters(
    metadata: dict[str, Any],
    timeline: list[dict[str, Any]],
    config: AppConfig,
) -> dict[str, Any]:
    duration = float(metadata.get("duration_seconds") or 0)
    chunks = _chunk_timeline(timeline, chunk_seconds=30 * 60)
    chunk_outputs: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_outputs.append(_call_or_fallback(metadata, chunk, config))
    merged = _merge_chunk_outputs(chunk_outputs, metadata, timeline)
    return validate_chapter_payload(merged, duration, config)


def validate_chapter_payload(payload: dict[str, Any], duration: float, config: AppConfig) -> dict[str, Any]:
    video_tags = clean_llm_tags(payload.get("global_tags", []), max_count=config.tag_max_count)
    timeline_segments = []
    for item in payload.get("timeline_segments", []):
        start = hhmmss_to_seconds(item.get("start", item.get("start_seconds", 0)))
        end = hhmmss_to_seconds(item.get("end", item.get("end_seconds", start)))
        if duration:
            start = clamp(start, 0, duration)
            end = clamp(end, 0, duration)
        if end <= start:
            continue
        segment_type = item.get("type") or item.get("segment_type") or "other"
        if segment_type not in ALLOWED_SEGMENT_TYPES:
            segment_type = "other"
        tags = clean_llm_tags(item.get("tags", []), max_count=config.tag_max_count)
        timeline_segments.append(
            {
                "start_seconds": start,
                "end_seconds": end,
                "segment_type": segment_type,
                "title": (item.get("title") or segment_type.replace("_", " ")).strip(),
                "summary": (item.get("summary") or "").strip(),
                "confidence": _confidence(item.get("confidence")),
                "source_evidence": (item.get("evidence") or item.get("source_evidence") or "").strip(),
                "transcript_text": item.get("transcript_text", ""),
                "audio_labels": item.get("audio_labels", []),
                "tags": tags,
            }
        )

    chapters = []
    for idx, item in enumerate(payload.get("chapters", [])):
        start = hhmmss_to_seconds(item.get("start", item.get("start_seconds", 0)))
        raw_end = item.get("end", item.get("end_seconds"))
        end = hhmmss_to_seconds(raw_end) if raw_end is not None else None
        if duration:
            start = clamp(start, 0, duration)
            if end is not None:
                end = clamp(end, 0, duration)
        if end is not None and end <= start:
            end = None
        tags = clean_llm_tags(item.get("tags", []), max_count=config.tag_max_count)
        chapters.append(
            {
                "start_seconds": start,
                "end_seconds": end,
                "title": (item.get("title") or f"Chapter {idx + 1}").strip(),
                "summary": (item.get("summary") or "").strip(),
                "confidence": _confidence(item.get("confidence")),
                "tags": tags,
            }
        )

    chapters = _repair_chapter_ends(chapters, duration)
    return {
        "video_summary": (payload.get("video_summary") or "").strip(),
        "global_tags": video_tags,
        "timeline_segments": timeline_segments,
        "chapters": chapters,
    }


def _call_or_fallback(metadata: dict[str, Any], timeline: list[dict[str, Any]], config: AppConfig) -> dict[str, Any]:
    if config.llm_provider.lower() != "openai" or not os.getenv("OPENAI_API_KEY"):
        return _fallback_chapters(metadata, timeline, config)
    try:
        return _call_openai(metadata, timeline, config)
    except Exception:
        return _fallback_chapters(metadata, timeline, config)


def _call_openai(metadata: dict[str, Any], timeline: list[dict[str, Any]], config: AppConfig) -> dict[str, Any]:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise ChapteringError("openai is not installed. Install requirements.txt.") from exc

    compact_timeline = [
        {
            "start": seconds_to_hhmmss(item.get("start_seconds", 0)),
            "end": seconds_to_hhmmss(item.get("end_seconds", 0)),
            "transcript": item.get("transcript_text", "")[:1800],
            "audio_labels": item.get("audio_labels", []),
            "broad_audio_type": item.get("segment_type", "other"),
            "evidence": item.get("source_evidence", ""),
        }
        for item in timeline
    ]
    prompt = PROMPT.replace("{metadata}", json_dumps(metadata)).replace(
        "{timeline}", json_dumps(compact_timeline)
    )
    client = OpenAI()
    response = client.chat.completions.create(
        model=config.llm_model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    content = response.choices[0].message.content or "{}"
    return json.loads(content)


def _fallback_chapters(metadata: dict[str, Any], timeline: list[dict[str, Any]], config: AppConfig) -> dict[str, Any]:
    context = f"{metadata.get('relative_path', '')} {metadata.get('filename', '')} " + " ".join(
        item.get("transcript_text", "") for item in timeline[:20]
    )
    tags = infer_tags_from_text(context, max_count=config.tag_max_count)
    chapters = []
    for idx, item in enumerate(_select_chapter_candidates(timeline, config)):
        chapters.append(
            {
                "start": seconds_to_hhmmss(item.get("start_seconds", 0)),
                "end": seconds_to_hhmmss(item.get("end_seconds", 0)),
                "title": item.get("title") or _fallback_title(item),
                "summary": item.get("summary") or "Automatically generated from transcript and audio evidence.",
                "confidence": min(0.55, float(item.get("confidence") or 0.4)),
                "tags": tags[:5],
            }
        )
    timeline_segments = [
        {
            "start": seconds_to_hhmmss(item.get("start_seconds", 0)),
            "end": seconds_to_hhmmss(item.get("end_seconds", 0)),
            "type": item.get("segment_type", "other"),
            "title": item.get("title") or _fallback_title(item),
            "summary": item.get("summary") or "",
            "confidence": min(0.55, float(item.get("confidence") or 0.4)),
            "tags": tags[:5],
            "evidence": item.get("source_evidence", "Fallback classification without LLM."),
        }
        for item in timeline
    ]
    return {
        "video_summary": "Fallback summary generated because the configured LLM was unavailable.",
        "global_tags": tags,
        "timeline_segments": timeline_segments,
        "chapters": chapters,
    }


def _select_chapter_candidates(timeline: list[dict[str, Any]], config: AppConfig) -> list[dict[str, Any]]:
    if not timeline:
        return []
    max_count = max(1, config.chapter_max_count)
    min_spacing = max(60, (timeline[-1].get("end_seconds", 0) - timeline[0].get("start_seconds", 0)) / max_count)
    selected = [timeline[0]]
    last_start = float(timeline[0].get("start_seconds", 0))
    for item in timeline[1:]:
        start = float(item.get("start_seconds", 0))
        if len(selected) >= max_count:
            break
        if start - last_start >= min_spacing or item.get("segment_type") != selected[-1].get("segment_type"):
            selected.append(item)
            last_start = start
    return selected[:max_count]


def _merge_chunk_outputs(outputs: list[dict[str, Any]], metadata: dict[str, Any], timeline: list[dict[str, Any]]) -> dict[str, Any]:
    tags: list[str] = []
    segments: list[dict[str, Any]] = []
    chapters: list[dict[str, Any]] = []
    summaries: list[str] = []
    for output in outputs:
        tags.extend(output.get("global_tags", []))
        segments.extend(output.get("timeline_segments", []))
        chapters.extend(output.get("chapters", []))
        if output.get("video_summary"):
            summaries.append(output["video_summary"])
    if not chapters:
        return _fallback_chapters(metadata, timeline, AppConfig())
    return {
        "video_summary": " ".join(summaries)[:500],
        "global_tags": tags,
        "timeline_segments": segments,
        "chapters": sorted(chapters, key=lambda x: hhmmss_to_seconds(x.get("start", x.get("start_seconds", 0)))),
    }


def _chunk_timeline(timeline: list[dict[str, Any]], chunk_seconds: float) -> list[list[dict[str, Any]]]:
    if not timeline:
        return [[]]
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    chunk_start = float(timeline[0].get("start_seconds", 0))
    for item in timeline:
        start = float(item.get("start_seconds", 0))
        if current and start - chunk_start >= chunk_seconds:
            chunks.append(current)
            current = []
            chunk_start = start
        current.append(item)
    if current:
        chunks.append(current)
    return chunks


def _repair_chapter_ends(chapters: list[dict[str, Any]], duration: float) -> list[dict[str, Any]]:
    chapters = sorted(chapters, key=lambda c: c["start_seconds"])
    repaired = []
    for idx, chapter in enumerate(chapters):
        end = chapter.get("end_seconds")
        next_start = chapters[idx + 1]["start_seconds"] if idx + 1 < len(chapters) else duration
        if end is None or end <= chapter["start_seconds"]:
            end = next_start
        if duration:
            end = clamp(float(end), 0, duration)
        if end - chapter["start_seconds"] < 1.0:
            continue
        chapter["end_seconds"] = end
        repaired.append(chapter)
    return repaired


def _confidence(value: Any) -> float:
    try:
        return round(clamp(float(value), 0, 1), 3)
    except (TypeError, ValueError):
        return 0.5


def _fallback_title(item: dict[str, Any]) -> str:
    return str(item.get("segment_type", "section")).replace("_", " ").title()
