from __future__ import annotations

import json
import math
import os
import re
from typing import Any

from config import AppConfig
from tagger import clean_llm_tags, infer_tags_from_text
from timeline_builder import ALLOWED_SEGMENT_TYPES
from utils import clamp, hhmmss_to_seconds, json_dumps, seconds_to_hhmmss


PROMPT = """You are analyzing a timestamped transcript and audio-event timeline from a guitar instructional video.

Your task is to create useful navigation chapters, semantic segment labels, search metadata, and practice-ready marker metadata.

The video contains spoken explanation, guitar demonstration, exercises, performances, tuning/setup, and possibly backing tracks.

Use both transcript and audio evidence.
Treat the supplied timeline as pause-aware candidate windows. These windows were created from longer pauses between speech sections and nearby audio evidence.

Rules:
- Use only information supported by the transcript, filename, folder path, or audio labels.
- Do not invent techniques, song names, chord names, or scale names unless explicitly spoken or strongly implied by filename/folder.
- Build chapters from the actual Whisper transcript. Title, summary, tags, and learning metadata must be grounded in words or musical facts present in the transcript snippet.
- Do not catalogue every timeline block. Create a chapter only when the material forms a coherent teachable idea that a student would reasonably revisit.
- Prefer fewer, stronger chapters. For a long lesson, aim for broad sections separated by longer pauses, not every sentence, lick, or short demonstration.
- A good marker usually includes the explanation and the short played example that demonstrates it. Merge tiny audio-only examples into the surrounding idea instead of making separate markers.
- Skip banter, transitions, silence, unclear audio, and isolated fragments unless they contain a reusable musical point.
- Prefer granular practice markers only when the teacher moves to a new concrete idea, phrase, technique, scale, measure range, or practice instruction.
- Use timestamps from the provided candidate windows. Merge adjacent candidates when they are the same idea. Only split inside a candidate if the transcript clearly announces a new concrete topic and the resulting chapter is still substantial.
- Marker intervals must never overlap. A chapter end must be less than or equal to the next chapter start.
- Chapter titles must be specific to the actual material, not generic media labels. Never title a chapter "Other". Avoid titles like "Explanation with guitar", "Performance section", "Lesson part", or "Music section".
- Do not use a raw transcript fragment as the title. Turn the actual topic into a compact label, for example "Three-note-per-string scale boxes" instead of "That's just tuning Okay if we start".
- Prefer titles such as "D minor pentatonic double-stop bend", "Pick/finger dynamic range", or "Staccato walkdown with quarter bends".
- Summaries must be one sentence and must say what the student should notice or practice.
- Tags must be sparse: use exactly 2-4 specific tags per chapter, never more than 4. If a tag is not directly supported by the transcript, filename, folder path, or audio type, omit it.
- Avoid tag pileups and similar tag types. Do not include both a hyphenated and plain-text version of the same idea, and do not use primary domain or weekly role labels as visible tags.
- Prefer one tag per category: one technique/device tag, one harmony/scale tag when relevant, one practice/use tag when relevant.
- Each chapter must include learning metadata that turns the raw lesson content into a practice-ready unit.
- Prefer real repertoire, reusable musical devices, and technique/exercise bottlenecks over passive content labels.
- Classify uncertain material by its most useful practice application, not just its academic topic.
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
      "title": "specific chapter title",
      "summary": "one sentence summary",
      "confidence": 0.0,
      "tags": ["tag1", "tag2"],
      "learning": {
        "primary_domain": "Repertoire | Musical Devices | Technique & Exercises | Harmony & Voice Leading | Ear Training & Audiation | Improvisation | Composition & Arrangement | Rhythm, Time & Groove | Fretboard Navigation | Performance & Playing With Others | Theory Reference | Workflow / Practice Method",
        "secondary_domains": ["domain"],
        "topics": ["specific topic"],
        "musical_function": "what musical problem this solves",
        "practice_use_case": "Use this to...",
        "weekly_practice_role": "Main Repertoire Object | Repertoire Support | Device Extraction | Composition Assignment | Arrangement Assignment | Technique Maintenance | Technical Bottleneck Solver | Ear/Fretboard Integration | Improvisation Constraint | Harmony/Voice-Leading Study | Rhythm/Time Study | Performance Preparation | Theory Reference Only | Practice Workflow Support",
        "difficulty_level": "Beginner | Early Intermediate | Intermediate | Advanced Intermediate | Advanced",
        "required_prerequisites": ["prerequisite"],
        "suggested_output": "concrete practice deliverable",
        "repertoire_relevance": 0,
        "composition_relevance": 0,
        "playing_with_others_relevance": 0,
        "all_fourths_relevance": 0,
        "interval_function_relevance": 0,
        "suggested_constraints": ["constraint"],
        "extraction_prompt": "how to extract the musical idea",
        "practice_prompt": "one-session instruction",
        "related_marker_links": [],
        "priority_score": 0,
        "notes_for_weekly_planner": "how this should be paired in a weekly routine"
      }
    }
  ]
}

Input metadata:
{metadata}

Input timeline:
{timeline}
"""


LEARNING_DOMAINS = [
    "Repertoire",
    "Musical Devices",
    "Technique & Exercises",
    "Harmony & Voice Leading",
    "Ear Training & Audiation",
    "Improvisation",
    "Composition & Arrangement",
    "Rhythm, Time & Groove",
    "Fretboard Navigation",
    "Performance & Playing With Others",
    "Theory Reference",
    "Workflow / Practice Method",
]

WEEKLY_PRACTICE_ROLES = [
    "Main Repertoire Object",
    "Repertoire Support",
    "Device Extraction",
    "Composition Assignment",
    "Arrangement Assignment",
    "Technique Maintenance",
    "Technical Bottleneck Solver",
    "Ear/Fretboard Integration",
    "Improvisation Constraint",
    "Harmony/Voice-Leading Study",
    "Rhythm/Time Study",
    "Performance Preparation",
    "Theory Reference Only",
    "Practice Workflow Support",
]

DIFFICULTY_LEVELS = [
    "Beginner",
    "Early Intermediate",
    "Intermediate",
    "Advanced Intermediate",
    "Advanced",
]

DOMAIN_BUCKETS = {
    "Repertoire": "repertoire",
    "Musical Devices": "musical-device",
    "Technique & Exercises": "training",
    "Harmony & Voice Leading": "musical-device",
    "Ear Training & Audiation": "training",
    "Improvisation": "musical-device",
    "Composition & Arrangement": "musical-device",
    "Rhythm, Time & Groove": "training",
    "Fretboard Navigation": "training",
    "Performance & Playing With Others": "repertoire",
    "Workflow / Practice Method": "training",
    "Theory Reference": "training",
}


class ChapteringError(RuntimeError):
    pass


def generate_chapters(
    metadata: dict[str, Any],
    timeline: list[dict[str, Any]],
    config: AppConfig,
) -> dict[str, Any]:
    duration = float(metadata.get("duration_seconds") or 0)
    candidate_timeline = _candidate_chapter_timeline(timeline, config, duration)
    chunks = _chunk_timeline(candidate_timeline, chunk_seconds=30 * 60)
    chunk_outputs: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_outputs.append(_call_or_fallback(metadata, chunk, config))
    merged = _merge_chunk_outputs(chunk_outputs, metadata, candidate_timeline)
    return validate_chapter_payload(merged, duration, config, source_timeline=candidate_timeline)


def validate_chapter_payload(
    payload: dict[str, Any],
    duration: float,
    config: AppConfig,
    source_timeline: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    video_tags = clean_llm_tags(payload.get("global_tags", []), max_count=min(config.tag_max_count, 8))
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
        tags = clean_llm_tags(item.get("tags", []), max_count=min(config.tag_max_count, 4))
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
        evidence_text = _chapter_evidence_text(item, start, end, source_timeline)
        item_with_evidence = {**item, "transcript_text": evidence_text}
        title = _chapter_title(item_with_evidence, idx)
        if _looks_like_transcript_fragment(title):
            title = _specific_title_from_text(evidence_text, item.get("segment_type", "other"))
        summary = _validated_summary((item.get("summary") or "").strip(), evidence_text, title)
        raw_tags = _grounded_tags_for_text(
            _as_list(item.get("tags")),
            evidence_text,
            item.get("type") or item.get("segment_type", ""),
            max_count=min(config.tag_max_count, 4),
        )
        learning_metadata = _validate_learning_metadata(
            item,
            title=title,
            summary=summary,
            tags=raw_tags,
            evidence_text=evidence_text,
        )
        tags = _grounded_tags_for_text(
            [
                *raw_tags,
                *learning_metadata.get("topics", []),
                *_domain_support_tags(learning_metadata.get("primary_domain")),
            ],
            evidence_text,
            item.get("type") or item.get("segment_type", ""),
            max_count=min(config.tag_max_count, 4),
        )
        if len(tags) < 2 and source_timeline:
            continue
        chapters.append(
            {
                "start_seconds": start,
                "end_seconds": end,
                "title": title,
                "summary": summary,
                "confidence": _confidence(item.get("confidence")),
                "tags": tags,
                "learning_metadata": learning_metadata,
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
            "candidate_id": item.get("candidate_id"),
            "start": seconds_to_hhmmss(item.get("start_seconds", 0)),
            "end": seconds_to_hhmmss(item.get("end_seconds", 0)),
            "transcript": item.get("transcript_text", "")[:2200],
            "audio_labels": item.get("audio_labels", []),
            "broad_audio_type": item.get("segment_type", "other"),
            "pause_evidence": item.get("pause_evidence", ""),
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


def _candidate_chapter_timeline(
    timeline: list[dict[str, Any]],
    config: AppConfig,
    duration: float,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for item in _coherent_timeline_items(timeline):
        candidates.extend(_split_item_on_transcript_pauses(item, config.chapter_boundary_pause_seconds))

    candidates = [_normalize_candidate(item, idx) for idx, item in enumerate(candidates)]
    candidates = [item for item in candidates if _is_marker_worthy(item)]
    candidates = _merge_short_candidates(candidates, config.chapter_min_duration_seconds)
    candidates = _limit_candidate_density(candidates, config, duration)
    return [_normalize_candidate(item, idx) for idx, item in enumerate(candidates)]


def _split_item_on_transcript_pauses(item: dict[str, Any], pause_seconds: float) -> list[dict[str, Any]]:
    transcript_segments = [
        segment
        for segment in item.get("transcript_segments", [])
        if isinstance(segment, dict) and str(segment.get("text", "")).strip()
    ]
    if len(transcript_segments) <= 1:
        return [dict(item)]

    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    previous_end: float | None = None
    for segment in transcript_segments:
        start = float(segment.get("start_seconds", 0) or 0)
        end = float(segment.get("end_seconds", start) or start)
        if current and previous_end is not None and start - previous_end >= pause_seconds:
            groups.append(current)
            current = []
        current.append({"start_seconds": start, "end_seconds": end, "text": str(segment.get("text", "")).strip()})
        previous_end = end
    if current:
        groups.append(current)

    if len(groups) <= 1:
        return [dict(item)]

    result: list[dict[str, Any]] = []
    original_start = float(item.get("start_seconds", 0) or 0)
    original_end = float(item.get("end_seconds", original_start) or original_start)
    for index, group in enumerate(groups):
        start = max(original_start, float(group[0].get("start_seconds", original_start) or original_start))
        end = min(original_end, float(group[-1].get("end_seconds", original_end) or original_end))
        text = " ".join(segment["text"] for segment in group if segment.get("text"))
        if end <= start or not text:
            continue
        pause_before = ""
        if index > 0:
            previous = groups[index - 1][-1]
            gap = start - float(previous.get("end_seconds", start) or start)
            pause_before = f"Started after a {gap:.1f}s speech pause."
        result.append(
            {
                **item,
                "start_seconds": start,
                "end_seconds": end,
                "transcript_text": text,
                "transcript_segments": group,
                "title": _specific_title_from_text(text, item.get("segment_type", "other")),
                "summary": _practice_summary_from_text(text, ""),
                "pause_evidence": pause_before or item.get("pause_evidence", "First speech group in candidate window."),
            }
        )
    return result or [dict(item)]


def _normalize_candidate(item: dict[str, Any], index: int) -> dict[str, Any]:
    result = dict(item)
    start = float(result.get("start_seconds", 0) or 0)
    end = float(result.get("end_seconds", start) or start)
    result["start_seconds"] = start
    result["end_seconds"] = end
    result["candidate_id"] = result.get("candidate_id") or f"candidate-{index + 1}"
    if not result.get("title") or _is_generic_title(str(result.get("title", ""))):
        result["title"] = _specific_title(result)
    if not result.get("summary"):
        result["summary"] = _practice_summary_from_text(str(result.get("transcript_text", "") or ""), result["title"])
    return result


def _merge_short_candidates(candidates: list[dict[str, Any]], min_duration: float) -> list[dict[str, Any]]:
    if not candidates:
        return []
    merged: list[dict[str, Any]] = []
    for item in sorted(candidates, key=lambda value: float(value.get("start_seconds", 0) or 0)):
        duration = float(item.get("end_seconds", 0) or 0) - float(item.get("start_seconds", 0) or 0)
        if merged and duration < min_duration:
            merged[-1] = _merge_candidate_pair(merged[-1], item)
            continue
        merged.append(dict(item))
    if len(merged) >= 2:
        last = merged[-1]
        if float(last.get("end_seconds", 0) or 0) - float(last.get("start_seconds", 0) or 0) < min_duration:
            merged[-2] = _merge_candidate_pair(merged[-2], last)
            merged.pop()
    return merged


def _limit_candidate_density(
    candidates: list[dict[str, Any]],
    config: AppConfig,
    duration: float,
) -> list[dict[str, Any]]:
    if not candidates:
        return []
    timeline_duration = duration or (
        float(candidates[-1].get("end_seconds", 0) or 0) - float(candidates[0].get("start_seconds", 0) or 0)
    )
    target_count = max(config.chapter_min_count, math.ceil(timeline_duration / max(60.0, config.chapter_target_seconds)))
    max_count = max(1, min(config.chapter_max_count, target_count))
    reduced = [dict(item) for item in candidates]
    while len(reduced) > max_count:
        merge_index = _best_adjacent_merge_index(reduced)
        reduced[merge_index] = _merge_candidate_pair(reduced[merge_index], reduced[merge_index + 1])
        reduced.pop(merge_index + 1)
    return reduced


def _best_adjacent_merge_index(candidates: list[dict[str, Any]]) -> int:
    best_index = 0
    best_score: tuple[float, float] | None = None
    for index in range(len(candidates) - 1):
        left = candidates[index]
        right = candidates[index + 1]
        gap = max(0.0, float(right.get("start_seconds", 0) or 0) - float(left.get("end_seconds", 0) or 0))
        combined = float(right.get("end_seconds", 0) or 0) - float(left.get("start_seconds", 0) or 0)
        score = (gap, combined)
        if best_score is None or score < best_score:
            best_score = score
            best_index = index
    return best_index


def _merge_candidate_pair(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    text = " ".join(
        value
        for value in [str(left.get("transcript_text", "") or "").strip(), str(right.get("transcript_text", "") or "").strip()]
        if value
    )
    audio_labels = []
    for label in [*left.get("audio_labels", []), *right.get("audio_labels", [])]:
        if label not in audio_labels:
            audio_labels.append(label)
    evidence = " ".join(
        value
        for value in [left.get("source_evidence", ""), right.get("source_evidence", "")]
        if value
    ).strip()
    return {
        **left,
        "end_seconds": max(float(left.get("end_seconds", 0) or 0), float(right.get("end_seconds", 0) or 0)),
        "transcript_text": text,
        "transcript_segments": [*left.get("transcript_segments", []), *right.get("transcript_segments", [])],
        "audio_labels": audio_labels[:8],
        "source_evidence": evidence,
        "title": _specific_title_from_text(text, left.get("segment_type", "other")),
        "summary": _practice_summary_from_text(text, ""),
        "pause_evidence": "Merged adjacent pause candidates to keep marker density useful.",
    }


def _fallback_chapters(metadata: dict[str, Any], timeline: list[dict[str, Any]], config: AppConfig) -> dict[str, Any]:
    context = f"{metadata.get('relative_path', '')} {metadata.get('filename', '')} " + " ".join(
        item.get("transcript_text", "") for item in timeline[:20]
    )
    tags = infer_tags_from_text(context, max_count=min(config.tag_max_count, 8))
    chapters = []
    for idx, item in enumerate(_select_chapter_candidates(timeline, config)):
        chapter_tags = _focused_tags_for_text(
            f"{item.get('title', '')} {item.get('summary', '')} {item.get('transcript_text', '')}",
            tags,
            config,
        )
        chapters.append(
            {
                "start": seconds_to_hhmmss(item.get("start_seconds", 0)),
                "end": seconds_to_hhmmss(item.get("end_seconds", 0)),
                "title": _specific_title(item),
                "summary": item.get("summary") or _fallback_summary(item),
                "confidence": min(0.55, float(item.get("confidence") or 0.4)),
                "tags": chapter_tags,
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
            "tags": _focused_tags_for_text(
                f"{item.get('title', '')} {item.get('summary', '')} {item.get('transcript_text', '')}",
                tags,
                config,
            ),
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
    expanded = [item for item in _coherent_timeline_items(timeline) if _is_marker_worthy(item)]
    if not expanded:
        return []

    duration = float(expanded[-1].get("end_seconds", 0)) - float(expanded[0].get("start_seconds", 0))
    target_count = max(config.chapter_min_count, math.ceil(duration / max(60.0, config.chapter_target_seconds)))
    max_count = max(1, min(config.chapter_max_count, target_count))
    min_spacing = max(config.chapter_min_duration_seconds, duration / max_count)
    selected = [expanded[0]]
    last_start = float(expanded[0].get("start_seconds", 0))
    for item in expanded[1:]:
        start = float(item.get("start_seconds", 0))
        if len(selected) >= max_count:
            break
        if start - last_start >= min_spacing:
            selected.append(item)
            last_start = start
    return selected[:max_count]


def _coherent_timeline_items(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    coherent: list[dict[str, Any]] = []
    for item in sorted(timeline, key=lambda value: float(value.get("start_seconds", 0) or 0)):
        start = float(item.get("start_seconds", 0) or 0)
        end = float(item.get("end_seconds", start) or start)
        text = str(item.get("transcript_text", "") or "").strip()
        segment_type = str(item.get("segment_type", "other") or "other")
        duration = end - start

        if text:
            coherent.append(dict(item))
            continue

        if (
            coherent
            and duration <= 20
            and segment_type in {"guitar_demonstration", "guitar_performance", "short_example", "other"}
            and start - float(coherent[-1].get("end_seconds", start) or start) <= 3
        ):
            previous = coherent[-1]
            previous["end_seconds"] = max(float(previous.get("end_seconds", start) or start), end)
            previous["audio_labels"] = list({
                *previous.get("audio_labels", []),
                *item.get("audio_labels", []),
            })
            evidence = " ".join(
                value
                for value in [previous.get("source_evidence", ""), item.get("source_evidence", "")]
                if value
            ).strip()
            if evidence:
                previous["source_evidence"] = evidence
            continue

        if segment_type == "guitar_performance" and duration >= 20:
            coherent.append(dict(item))

    return coherent


def _is_marker_worthy(item: dict[str, Any]) -> bool:
    start = float(item.get("start_seconds", 0) or 0)
    end = float(item.get("end_seconds", start) or start)
    duration = end - start
    text = str(item.get("transcript_text", "") or "").strip()
    segment_type = str(item.get("segment_type", "other") or "other")
    if text:
        return duration >= 8 and len(text) >= 120 and _has_substantive_words(text)
    return segment_type == "guitar_performance" and duration >= 20


def _has_substantive_words(text: str) -> bool:
    low = text.lower()
    weak_phrases = [
        "welcome",
        "let's get started",
        "see you",
        "thanks for watching",
        "okay",
    ]
    if len(low.split()) < 18:
        return False
    return not any(low.strip() == phrase for phrase in weak_phrases)


def _split_long_timeline_item(item: dict[str, Any]) -> list[dict[str, Any]]:
    start = float(item.get("start_seconds", 0) or 0)
    end = float(item.get("end_seconds", start) or start)
    text = str(item.get("transcript_text", "") or "").strip()
    if end - start <= 180 or len(text) < 1800:
        return [item]

    parts = _split_text_by_sentences(text, target_chars=1400)
    if len(parts) <= 1:
        return [item]

    duration = end - start
    char_total = sum(max(1, len(part)) for part in parts)
    cursor = start
    split_items = []
    for index, part in enumerate(parts):
        if index == len(parts) - 1:
            part_end = end
        else:
            part_duration = duration * (max(1, len(part)) / char_total)
            part_end = min(end, cursor + max(20, part_duration))
        split_items.append(
            {
                **item,
                "start_seconds": cursor,
                "end_seconds": part_end,
                "title": _specific_title_from_text(part, item.get("segment_type", "other")),
                "summary": _summary_from_text(part),
                "transcript_text": part,
                "confidence": min(0.55, float(item.get("confidence") or 0.45)),
            }
        )
        cursor = part_end
    return [part for part in split_items if part["end_seconds"] - part["start_seconds"] >= 1]


def _split_text_by_sentences(text: str, target_chars: int) -> list[str]:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    if not sentences:
        return [text]
    chunks: list[str] = []
    current: list[str] = []
    current_size = 0
    for sentence in sentences:
        current.append(sentence)
        current_size += len(sentence)
        if current_size >= target_chars:
            chunks.append(" ".join(current))
            current = []
            current_size = 0
    if current:
        chunks.append(" ".join(current))
    return chunks


def _specific_title(item: dict[str, Any]) -> str:
    text = " ".join(
        str(item.get(key, "") or "")
        for key in ("title", "summary", "transcript_text", "source_evidence")
    )
    return _specific_title_from_text(text, item.get("segment_type", "other"))


def _chapter_title(item: dict[str, Any], index: int) -> str:
    raw_title = str(item.get("title") or "").strip()
    if raw_title and not _is_generic_title(raw_title):
        return raw_title
    specific = _specific_title(item)
    if specific and not _is_generic_title(specific):
        return specific
    return f"Focused marker {index + 1}"


def _is_generic_title(title: str) -> bool:
    normalized = re.sub(r"\s+", " ", title.strip().lower())
    return normalized in {
        "other",
        "explanation with guitar",
        "performance or music section",
        "performance section",
        "music section",
        "lesson part",
        "focused concept explanation",
        "chapter",
        "intro",
    }


def _specific_title_from_text(text: str, segment_type: str = "other") -> str:
    low = text.lower()
    concepts = [
        ("three note per string", "Three-note-per-string scale boxes"),
        ("three-note per string", "Three-note-per-string scale boxes"),
        ("three notes per string", "Three-note-per-string scale boxes"),
        ("3 note per string", "Three-note-per-string scale boxes"),
        ("3d outpost string", "Three-note-per-string scale boxes"),
        ("cage system", "CAGED position system"),
        ("caged system", "CAGED position system"),
        ("position-based", "Position-based fretboard visualization"),
        ("scale shape", "Scale shapes versus chord tones"),
        ("scaleically", "Scale shapes versus chord tones"),
        ("chord tones", "Chord-tone targeting over changes"),
        ("playing over changes", "Fretboard visualization over changes"),
        ("over changes", "Fretboard visualization over changes"),
        ("harmonic device", "Mapping harmonic devices on the fretboard"),
        ("fretboard visualization", "Fretboard visualization system"),
        ("visualize the fretboard", "Fretboard visualization system"),
        ("all fourths tuning", "All-fourths tuning layout"),
        ("fourths tuning", "All-fourths tuning layout"),
        ("g and the b string", "Standard tuning interval compensation"),
        ("g string", "Standard tuning interval compensation"),
        ("up a semi", "Standard tuning interval compensation"),
        ("up a fret", "Standard tuning interval compensation"),
        ("all fourths", "All-fourths fretboard symmetry"),
        ("flat three", "Root to flat-three interval shapes"),
        ("flat 3", "Root to flat-three interval shapes"),
        ("major scale", "Major scale position mapping"),
        ("pentatonic", "Pentatonic position mapping"),
        ("arpeggios", "Arpeggio mapping on the fretboard"),
        ("dynamic range", "Pick and finger dynamic range"),
        ("volume pot", "Volume-pot tone cleanup"),
        ("pick and", "Pick versus finger attack"),
        ("fingers", "Finger attack color"),
        ("listener", "Slow phrase that draws in the listener"),
        ("d minor pentatonic", "D minor pentatonic phrase"),
        ("minor pentatonic", "Minor pentatonic phrase"),
        ("double stop", "Double-stop bend phrase"),
        ("quarter", "Quarter-bend articulation"),
        ("delay", "Delay repeat phrasing"),
        ("melodic minor", "Melodic minor color note"),
        ("harmonic minor", "Harmonic minor color note"),
        ("diminished", "Diminished lick setup"),
        ("flat five", "Pentatonic flat-five walkdown"),
        ("sixth", "Sixth-degree color note"),
        ("staccato", "Staccato walkdown articulation"),
        ("bend", "Bend articulation"),
        ("slowly", "Slow practice pass"),
        ("practice this", "Focused practice instruction"),
    ]
    for needle, title in concepts:
        if needle in low:
            return title
    sentence_title = _title_from_sentence(text)
    if sentence_title:
        return sentence_title
    fallback = str(segment_type or "section").replace("_", " ").title()
    if fallback in {"Mixed Speech And Guitar", "Speech Explanation"}:
        return "Transcript concept"
    if fallback == "Guitar Performance":
        return "Performed musical example"
    if fallback == "Other":
        return "Transcript concept"
    return fallback


def _title_from_sentence(text: str) -> str:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    for sentence in sentences:
        cleaned = re.sub(r"^(summary:\s*)", "", sentence, flags=re.IGNORECASE)
        cleaned = re.sub(r"^(well|now|okay|so|but|and|then|like|you know)[,\s]+", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\b(you know|kind of|sort of|pretty much|basically|actually|really)\b", "", cleaned, flags=re.IGNORECASE)
        words = [
            word.strip(" ,.;:!?()[]{}\"'")
            for word in cleaned.split()
            if word.strip(" ,.;:!?()[]{}\"'")
        ]
        useful = [
            word
            for word in words
            if word.lower() not in {
                "the",
                "a",
                "an",
                "this",
                "that",
                "these",
                "those",
                "is",
                "are",
                "was",
                "were",
                "with",
                "from",
                "about",
                "called",
                "some",
                "into",
                "have",
                "only",
                "problem",
                "because",
                "just",
                "going",
                "gonna",
                "really",
                "actually",
                "okay",
                "now",
                "well",
                "you're",
                "youre",
                "i'm",
                "im",
                "we're",
                "were",
                "thing",
                "things",
                "kind",
                "sort",
            }
        ]
        if len(useful) >= 3 and _has_concept_signal(" ".join(useful)):
            title_words = useful[:7]
            title = " ".join(title_words)
            return title[:1].upper() + title[1:]
    return ""


def _summary_from_text(text: str) -> str:
    return _practice_summary_from_text(text, "")


def _practice_summary_from_text(text: str, title: str) -> str:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]
    if not sentences:
        return f"Practice the {title.lower()} as a focused lesson section." if title else "Review the specific idea in this lesson section."
    concept_sentences = [
        sentence
        for sentence in sentences
        if _has_concept_signal(sentence) and not _is_filler_sentence(sentence)
    ]
    chosen = concept_sentences[0] if concept_sentences else next(
        (sentence for sentence in sentences if not _is_filler_sentence(sentence)),
        sentences[0],
    )
    cleaned = _clean_sentence(chosen)
    if title and not cleaned.lower().startswith(("practice", "use", "notice", "compare", "map")):
        cleaned = f"Use this section to practice {title.lower()}."
    return cleaned[:240]


def _validated_summary(summary: str, evidence_text: str, title: str) -> str:
    if not summary or _looks_like_transcript_fragment(summary) or _is_filler_sentence(summary):
        return _practice_summary_from_text(evidence_text, title)
    return _clean_sentence(summary)[:240]


def _clean_sentence(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip(" ,.;:")
    cleaned = re.sub(r"^(summary:\s*)", "", cleaned, flags=re.IGNORECASE)
    if cleaned and cleaned[-1] not in ".!?":
        cleaned += "."
    return cleaned


def _chapter_evidence_text(
    item: dict[str, Any],
    start: float,
    end: float | None,
    source_timeline: list[dict[str, Any]] | None,
) -> str:
    direct = str(item.get("transcript_text") or item.get("evidence") or "").strip()
    parts = [direct] if direct else []
    if source_timeline:
        overlap_end = end if end is not None else start + 1
        for source in source_timeline:
            source_start = float(source.get("start_seconds", 0) or 0)
            source_end = float(source.get("end_seconds", source_start) or source_start)
            if source_start < overlap_end and source_end > start:
                text = str(source.get("transcript_text", "") or "").strip()
                if text:
                    parts.append(text)
    return " ".join(parts).strip()


def _looks_like_transcript_fragment(value: str) -> bool:
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    if not normalized:
        return True
    weak_starts = (
        "that's",
        "thats",
        "you're",
        "youre",
        "i'm",
        "im ",
        "we're",
        "were ",
        "it's",
        "its ",
        "okay",
        "so ",
        "and ",
        "but ",
        "now ",
        "well ",
        "then ",
    )
    return normalized.startswith(weak_starts) or not _has_concept_signal(normalized)


def _is_filler_sentence(value: str) -> bool:
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    filler = [
        "hello guys",
        "welcome",
        "let's start",
        "lets start",
        "with that said",
        "okay",
        "now",
        "here we go",
        "don't worry",
        "dont worry",
    ]
    return any(phrase in normalized for phrase in filler) and not _has_concept_signal(normalized)


def _has_concept_signal(value: str) -> bool:
    low = value.lower()
    signals = [
        "fretboard",
        "visual",
        "changes",
        "scale",
        "chord",
        "arpeggio",
        "triad",
        "interval",
        "tone",
        "tuning",
        "position",
        "cage",
        "caged",
        "pentatonic",
        "major",
        "minor",
        "mode",
        "legato",
        "picking",
        "bend",
        "voicing",
        "harmony",
        "melody",
        "improvis",
        "practice",
        "exercise",
    ]
    return any(signal in low for signal in signals)


def _fallback_summary(item: dict[str, Any]) -> str:
    text = str(item.get("transcript_text", "") or "")
    if text.strip():
        return _summary_from_text(text)
    title = _specific_title(item)
    return f"Practice the {title.lower()} as a short, focused marker."


def _focused_tags_for_text(text: str, fallback_tags: list[str], config: AppConfig) -> list[str]:
    tags = infer_tags_from_text(text, max_count=4)
    if len(tags) < 2:
        tags.extend(fallback_tags[:2])
    return clean_llm_tags(tags, max_count=min(config.tag_max_count, 4))


def _grounded_tags_for_text(
    tags: list[Any],
    evidence_text: str,
    segment_type: str,
    *,
    max_count: int,
) -> list[str]:
    evidence = evidence_text.lower().replace("_", " ").replace("-", " ")
    grounded = infer_tags_from_text(evidence_text, max_count=max_count)
    if not _has_contextual_arrangement(evidence):
        grounded = [tag for tag in grounded if _tag_similarity_key_local(tag) != "arrangement"]
    for tag in tags:
        if not isinstance(tag, str):
            continue
        cleaned = clean_llm_tags([tag], max_count=1)
        if not cleaned:
            continue
        candidate = cleaned[0]
        key = candidate.lower().replace("_", " ").replace("-", " ")
        if key == "arrangement" and not _has_contextual_arrangement(evidence):
            continue
        words = [word for word in re.split(r"\s+", key) if len(word) > 2]
        if words and all(word in evidence for word in words):
            grounded.append(candidate)

    type_tag = _tag_from_segment_type(str(segment_type or ""))
    if type_tag:
        grounded.append(type_tag)

    result = clean_llm_tags(grounded, max_count=max_count)
    if len(result) < 2 and _has_concept_signal(evidence):
        for fallback in _domain_support_tags(_infer_primary_domain(evidence)):
            if fallback not in result:
                result.append(fallback)
            if len(result) >= 2:
                break
    return clean_llm_tags(result, max_count=max_count)


def _tag_similarity_key_local(tag: str) -> str:
    key = tag.lower().replace("&", " and ")
    key = re.sub(r"[-_/]+", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    if key.endswith("s") and len(key) > 4:
        key = key[:-1]
    return key


def _tag_from_segment_type(segment_type: str) -> str:
    normalized = segment_type.lower()
    if "exercise" in normalized:
        return "exercise"
    if "demonstration" in normalized or "short_example" in normalized:
        return "demonstration"
    if "performance" in normalized:
        return "performance"
    if "tuning" in normalized or "setup" in normalized:
        return "tuning"
    if "backing" in normalized:
        return "backing track"
    return ""


def _domain_support_tags(primary_domain: Any) -> list[str]:
    mapping = {
        "Repertoire": ["performance"],
        "Musical Devices": ["composition"],
        "Technique & Exercises": ["exercise"],
        "Harmony & Voice Leading": ["voice leading"],
        "Ear Training & Audiation": ["interval recognition"],
        "Improvisation": ["improvisation"],
        "Composition & Arrangement": ["arrangement"],
        "Rhythm, Time & Groove": ["timing"],
        "Fretboard Navigation": ["fretboard navigation"],
        "Performance & Playing With Others": ["performance"],
        "Theory Reference": ["functional harmony"],
        "Workflow / Practice Method": ["slow practice"],
    }
    return mapping.get(str(primary_domain), [])


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
        start = float(chapter["start_seconds"])
        if duration:
            start = clamp(start, 0, duration)
        if repaired and start < repaired[-1]["end_seconds"]:
            previous = repaired[-1]
            if start - previous["start_seconds"] >= 1.0:
                previous["end_seconds"] = start
            else:
                start = previous["end_seconds"]
        end = chapter.get("end_seconds")
        next_start = chapters[idx + 1]["start_seconds"] if idx + 1 < len(chapters) else duration
        if next_start is not None:
            next_start = float(next_start)
        if end is None or end <= chapter["start_seconds"]:
            end = next_start
        elif next_start and next_start > start:
            end = min(float(end), next_start)
        if duration:
            end = clamp(float(end), 0, duration)
        if end - start < 1.0:
            continue
        chapter["start_seconds"] = start
        chapter["end_seconds"] = end
        repaired.append(chapter)
    return repaired


def _validate_learning_metadata(
    item: dict[str, Any],
    *,
    title: str,
    summary: str,
    tags: list[str],
    evidence_text: str = "",
) -> dict[str, Any]:
    raw = item.get("learning") if isinstance(item.get("learning"), dict) else item
    fallback = _fallback_learning_metadata(title, " ".join([summary, evidence_text]).strip(), tags)
    primary = _allowed_choice(raw.get("primary_domain"), LEARNING_DOMAINS, fallback["primary_domain"])
    role = _allowed_choice(raw.get("weekly_practice_role"), WEEKLY_PRACTICE_ROLES, fallback["weekly_practice_role"])
    difficulty = _allowed_choice(raw.get("difficulty_level"), DIFFICULTY_LEVELS, fallback["difficulty_level"])
    secondary = [
        domain
        for domain in (_allowed_choice(value, LEARNING_DOMAINS, "") for value in _as_list(raw.get("secondary_domains")))
        if domain and domain != primary
    ][:4]
    topics = clean_llm_tags(_as_list(raw.get("topics")) or fallback["topics"], max_count=6)
    generated_tags = clean_llm_tags(
        _as_list(raw.get("tags")) or fallback["topics"],
        max_count=4,
    )

    return {
        "domain": DOMAIN_BUCKETS.get(primary, "training"),
        "primary_domain": primary,
        "secondary_domains": secondary or fallback["secondary_domains"],
        "topics": topics,
        "musical_function": _string_value(raw.get("musical_function"), fallback["musical_function"]),
        "practice_use_case": _string_value(raw.get("practice_use_case"), fallback["practice_use_case"]),
        "weekly_practice_role": role,
        "difficulty_level": difficulty,
        "required_prerequisites": clean_llm_tags(
            _as_list(raw.get("required_prerequisites")) or fallback["required_prerequisites"],
            max_count=6,
        ),
        "suggested_output": _string_value(raw.get("suggested_output"), fallback["suggested_output"]),
        "repertoire_relevance": _score(raw.get("repertoire_relevance"), fallback["repertoire_relevance"]),
        "composition_relevance": _score(raw.get("composition_relevance"), fallback["composition_relevance"]),
        "playing_with_others_relevance": _score(
            raw.get("playing_with_others_relevance"),
            fallback["playing_with_others_relevance"],
        ),
        "all_fourths_relevance": _score(raw.get("all_fourths_relevance"), fallback["all_fourths_relevance"]),
        "interval_function_relevance": _score(
            raw.get("interval_function_relevance"),
            fallback["interval_function_relevance"],
        ),
        "suggested_constraints": clean_llm_tags(
            _as_list(raw.get("suggested_constraints")) or fallback["suggested_constraints"],
            max_count=6,
        ),
        "extraction_prompt": _string_value(raw.get("extraction_prompt"), fallback["extraction_prompt"]),
        "practice_prompt": _string_value(raw.get("practice_prompt"), fallback["practice_prompt"]),
        "related_marker_links": [str(value) for value in _as_list(raw.get("related_marker_links"))][:8],
        "tags": generated_tags,
        "priority_score": _score(raw.get("priority_score"), fallback["priority_score"]),
        "notes_for_weekly_planner": _string_value(
            raw.get("notes_for_weekly_planner"),
            fallback["notes_for_weekly_planner"],
        ),
    }


def _fallback_learning_metadata(title: str, summary: str, tags: list[str]) -> dict[str, Any]:
    text = " ".join([title, summary, " ".join(tags)]).lower()
    primary = _infer_primary_domain(text)
    role = _infer_weekly_role(text, primary)
    topics = clean_llm_tags([*tags, *_infer_topics(text)], max_count=8)
    repertoire = 5 if primary == "Repertoire" else 2 if "tune" in text or "song" in text else 1
    composition = 5 if primary in {"Musical Devices", "Composition & Arrangement"} else 2
    playing = 4 if primary in {"Repertoire", "Performance & Playing With Others", "Rhythm, Time & Groove"} else 2
    all_fourths = 5 if "all-fourths" in text or "all fourths" in text else 3 if "fretboard" in text else 1
    interval = 5 if "interval" in text or "guide tone" in text or "voice leading" in text else 3 if primary != "Theory Reference" else 1
    priority = round((repertoire * 1.1 + composition + playing + interval + all_fourths * 0.8) / 5)
    priority = int(clamp(priority, 1, 5))
    domain_tag = _domain_tag(primary)
    role_tag = _role_tag(role)

    return {
        "domain": DOMAIN_BUCKETS.get(primary, "training"),
        "primary_domain": primary,
        "secondary_domains": _infer_secondary_domains(text, primary),
        "topics": topics,
        "musical_function": _default_musical_function(primary),
        "practice_use_case": _default_practice_use_case(primary, role),
        "weekly_practice_role": role,
        "difficulty_level": _infer_difficulty(text),
        "required_prerequisites": _default_prerequisites(primary),
        "suggested_output": _default_output(role),
        "repertoire_relevance": repertoire,
        "composition_relevance": composition,
        "playing_with_others_relevance": playing,
        "all_fourths_relevance": all_fourths,
        "interval_function_relevance": interval,
        "suggested_constraints": _default_constraints(primary, role),
        "extraction_prompt": _default_extraction_prompt(role),
        "practice_prompt": _default_practice_prompt(role),
        "related_marker_links": [],
        "tags": clean_llm_tags([*topics, domain_tag, role_tag], max_count=12),
        "priority_score": priority,
        "notes_for_weekly_planner": _default_weekly_notes(primary, role),
    }


def _infer_primary_domain(text: str) -> str:
    if _has_any(text, ["fretboard", "all-fourths", "all fourths", "position", "string set", "mapping"]):
        return "Fretboard Navigation"
    if _has_repertoire_reference(text):
        return "Repertoire"
    if _has_any(text, ["triad pair", "modal interchange", "guide tone", "enclosure", "approach tone", "pedal point", "upper structure", "motivic", "sequence", "slash chord"]):
        return "Musical Devices"
    if _has_any(text, ["picking", "legato", "muting", "string crossing", "speed", "mechanic", "exercise", "warm-up", "stretch"]):
        return "Technique & Exercises"
    if _has_any(text, ["voice leading", "voicing", "shell", "drop 2", "drop 3", "cadence", "substitution", "harmony"]):
        return "Harmony & Voice Leading"
    if _has_any(text, ["ear", "audiation", "sing", "hear", "interval recognition", "scale-degree"]):
        return "Ear Training & Audiation"
    if _has_any(text, ["improvis", "solo", "phrasing", "target note", "line"]):
        return "Improvisation"
    if _has_any(text, ["rhythm", "groove", "time feel", "syncopation", "metronome", "subdivision"]):
        return "Rhythm, Time & Groove"
    if _has_any(text, ["compose", "composition", "reharmon"]) or _has_contextual_arrangement(text):
        return "Composition & Arrangement"
    if _has_any(text, ["comping", "ensemble", "duo", "trio", "chart", "count-in", "ending"]):
        return "Performance & Playing With Others"
    if _has_any(text, ["practice plan", "routine", "workflow", "review", "recording"]):
        return "Workflow / Practice Method"
    return "Theory Reference"


def _infer_weekly_role(text: str, primary: str) -> str:
    if primary == "Repertoire":
        return "Main Repertoire Object" if _has_any(text, ["full", "complete", "performance", "play-through"]) else "Repertoire Support"
    if primary == "Musical Devices":
        return "Device Extraction"
    if primary == "Technique & Exercises":
        return "Technical Bottleneck Solver" if _has_any(text, ["problem", "bottleneck", "difficult", "fix"]) else "Technique Maintenance"
    if primary == "Ear Training & Audiation" or primary == "Fretboard Navigation":
        return "Ear/Fretboard Integration"
    if primary == "Improvisation":
        return "Improvisation Constraint"
    if primary == "Composition & Arrangement":
        return "Arrangement Assignment" if "arrang" in text else "Composition Assignment"
    if primary == "Harmony & Voice Leading":
        return "Harmony/Voice-Leading Study"
    if primary == "Rhythm, Time & Groove":
        return "Rhythm/Time Study"
    if primary == "Performance & Playing With Others":
        return "Performance Preparation"
    if primary == "Workflow / Practice Method":
        return "Practice Workflow Support"
    return "Theory Reference Only"


def _infer_secondary_domains(text: str, primary: str) -> list[str]:
    candidates = []
    for domain in LEARNING_DOMAINS:
        if domain == primary:
            continue
        if domain == _infer_primary_domain(text + " " + domain.lower()):
            candidates.append(domain)
    if "interval" in text and "Fretboard Navigation" not in candidates and primary != "Fretboard Navigation":
        candidates.append("Fretboard Navigation")
    if "compose" in text and primary != "Composition & Arrangement":
        candidates.append("Composition & Arrangement")
    return candidates[:3]


def _infer_topics(text: str) -> list[str]:
    topic_terms = [
        "triad pairs",
        "triads",
        "guide tones",
        "voice leading",
        "shell voicings",
        "drop 2",
        "drop 3",
        "modal interchange",
        "secondary dominants",
        "pedal point",
        "enclosures",
        "approach tones",
        "chord melody",
        "comping",
        "reharmonization",
        "composition",
        *([] if not _has_contextual_arrangement(text) else ["arrangement"]),
        "alternate picking",
        "hybrid picking",
        "legato",
        "ear training",
        "interval recognition",
        "all-fourths",
        "fretboard mapping",
        "rhythm",
        "groove",
        "improvisation",
    ]
    return [topic for topic in topic_terms if topic in text]


def _has_contextual_arrangement(text: str) -> bool:
    low = text.lower()
    if "arrangement of" in low or "arrange the scale" in low or "arrange so" in low:
        return False
    return any(term in low for term in ["arrange a melody", "arrange the melody", "arrangement assignment", "chord melody arrangement"])


def _infer_difficulty(text: str) -> str:
    if _has_any(text, ["advanced", "altered", "melodic minor", "upper structure", "coltrane"]):
        return "Advanced"
    if _has_any(text, ["lydian", "diminished", "drop 2", "drop 3", "reharmon", "triad pair"]):
        return "Advanced Intermediate"
    if _has_any(text, ["basic", "beginner", "first", "simple"]):
        return "Early Intermediate"
    return "Intermediate"


def _default_musical_function(primary: str) -> str:
    if primary == "Repertoire":
        return "Develops a concrete piece of music into playable repertoire."
    if primary == "Musical Devices":
        return "Extracts a reusable musical idea for composition, improvisation, or arranging."
    if primary == "Technique & Exercises":
        return "Solves a physical execution problem that should be applied back to music."
    if primary == "Fretboard Navigation":
        return "Connects interval/function thinking to concrete fretboard locations."
    return "Turns the concept into a constrained musical practice task."


def _default_practice_use_case(primary: str, role: str) -> str:
    if role == "Device Extraction":
        return "Use this to extract one musical device and apply it to a tune or short composition."
    if primary == "Repertoire":
        return "Use this to make a tune, study, or performance excerpt more playable and recordable."
    if role == "Ear/Fretboard Integration":
        return "Use this to connect the sound of intervals or functions to all-fourths fretboard locations."
    if "Technique" in role:
        return "Use this as a technical bottleneck exercise before applying the same movement to repertoire."
    return "Use this as a constrained practice item with a concrete output."


def _default_prerequisites(primary: str) -> list[str]:
    if primary == "Musical Devices":
        return ["basic triads", "interval names", "one playable chord context"]
    if primary == "Repertoire":
        return ["slow tempo reference", "form awareness", "basic chord tones"]
    if primary == "Technique & Exercises":
        return ["relaxed hands", "slow metronome practice"]
    return ["interval names", "basic fretboard mapping"]


def _default_output(role: str) -> str:
    if role == "Device Extraction":
        return "Write 4-8 bars using this device and record one short take."
    if role in {"Main Repertoire Object", "Repertoire Support"}:
        return "Record one chorus or section with clear time, melody, and harmony."
    if role in {"Composition Assignment", "Arrangement Assignment"}:
        return "Create a short written or arranged passage and record a draft."
    if role == "Ear/Fretboard Integration":
        return "Sing, map, and play the material in two positions."
    return "Record one focused take with a strict constraint."


def _default_constraints(primary: str, role: str) -> list[str]:
    if role == "Device Extraction":
        return ["one device only", "compose 8 bars maximum", "record one take"]
    if role == "Ear/Fretboard Integration":
        return ["sing before playing", "use all-fourths interval names", "one position first"]
    if primary == "Technique & Exercises":
        return ["slow tempo", "relaxed motion", "apply to one musical phrase"]
    if primary == "Repertoire":
        return ["melody always audible", "one section only", "record one take"]
    return ["one constraint only", "small output", "write one review note"]


def _default_extraction_prompt(role: str) -> str:
    if role == "Device Extraction":
        return "Identify the core musical device, name its function, then write 4-8 bars using only that idea."
    return "Extract the smallest reusable idea and describe where it can solve a musical problem."


def _default_practice_prompt(role: str) -> str:
    if role == "Device Extraction":
        return "For 20 minutes, apply this device to one chord or tune section, then record a 60-second take."
    if role in {"Main Repertoire Object", "Repertoire Support"}:
        return "Practice one short section slowly, connect melody to harmony, then record a check take."
    if role == "Ear/Fretboard Integration":
        return "Sing the target sound, map it in all-fourths tuning, then play it in two positions."
    return "Practice the marker with one strict constraint, then write one sentence about what changed."


def _default_weekly_notes(primary: str, role: str) -> str:
    if role == "Device Extraction":
        return "Pair with a repertoire marker where this device can become a small composition or improvisation task."
    if primary == "Repertoire":
        return "Use as the weekly anchor and attach one device, one technique item, and one recording deliverable."
    if primary == "Technique & Exercises":
        return "Use only when it supports the week's repertoire or musical device."
    return "Schedule after the main repertoire item and keep the output small."


def _allowed_choice(value: Any, allowed: list[str], fallback: str) -> str:
    if isinstance(value, str):
        for item in allowed:
            if value.strip().lower() == item.lower():
                return item
    return fallback


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _string_value(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _score(value: Any, fallback: int) -> int:
    try:
        return int(clamp(round(float(value)), 0, 5))
    except (TypeError, ValueError):
        return int(clamp(fallback, 0, 5))


def _has_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def _has_repertoire_reference(text: str) -> bool:
    return bool(
        re.search(
            r"\betude\b|jazz standard|full performance|play-through|full piece|piece of music",
            text,
            flags=re.IGNORECASE,
        )
    )


def _role_tag(role: str) -> str:
    return role.lower().replace("/", "-").replace(" ", "-")


def _domain_tag(domain: str) -> str:
    return domain.lower().replace("&", "and").replace("/", "-").replace(" ", "-")


def _confidence(value: Any) -> float:
    try:
        return round(clamp(float(value), 0, 1), 3)
    except (TypeError, ValueError):
        return 0.5


def _fallback_title(item: dict[str, Any]) -> str:
    return str(item.get("segment_type", "section")).replace("_", " ").title()
