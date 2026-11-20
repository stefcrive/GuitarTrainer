from __future__ import annotations

import json
from urllib.error import HTTPError

import pytest

import app as processor
import teaching_units as units
from config import AppConfig
from database import ProcessorDB


def transcript():
    return units.normalize_segments([
        {"start_seconds": 5, "end_seconds": 15, "text": "Target the third of each chord. Listen to this example."},
        {"start_seconds": 90, "end_seconds": 100, "text": "That was the same idea. Let me play it slowly."},
        {"start_seconds": 180, "end_seconds": 195, "text": "Keep that third ringing while the chord changes."},
        {"start_seconds": 240, "end_seconds": 255, "text": "Now a different exercise: alternate picking on one string."},
        {"start_seconds": 300, "end_seconds": 315, "text": "Returning to chord tones, apply the thirds to this new progression."},
        {"start_seconds": 390, "end_seconds": 400, "text": "Thanks for watching. Subscribe to the channel."},
    ], 420)


def decisions():
    return {i: {"starts_unit": i in {0, 3, 4}, "kind": "non_teaching" if i == 5 else "teaching"} for i in range(6)}


def test_units_span_multiple_long_music_gaps_and_keep_return_visits_separate():
    result = units.assemble_units(transcript(), decisions(), 420)
    assert [(u["start_seconds"], u["end_seconds"]) for u in result] == [(0, 240), (240, 300), (300, 390)]
    assert [s["id"] for s in result[0]["transcript"]] == [0, 1, 2]
    assert result[2]["start_id"] == 4  # Same topic later is a distinct contiguous occurrence.


def test_final_played_example_extends_to_video_end_without_audio_limiter():
    source = transcript()[:5]
    result = units.assemble_units(source, decisions(), 420)
    assert result[-1]["end_seconds"] == 420


def test_no_fixed_duration_or_marker_count():
    source = transcript()
    state = {i: {"starts_unit": False, "kind": "teaching"} for i in range(len(source))}
    result = units.assemble_units(source, state, 420)
    assert len(result) == 1
    assert result[0]["end_seconds"] == 420


def test_review_seams_do_not_force_new_markers(monkeypatch):
    source = units.normalize_segments([
        {"start_seconds": i * 5, "end_seconds": i * 5 + 4, "text": f"Continuation {i}"}
        for i in range(95)
    ], 500)
    state = {i: {"topic": "t", "starts_unit": i % 40 == 0, "kind": "teaching"} for i in range(95)}
    visited = []

    def review(task, value, config):
        ids = value["core_ids"]
        visited.extend(ids)
        if ids[0] > 0:
            assert value["transcript"][0]["id"] < ids[0]
        return {"boundaries": [{"id": 0, "reason": "Beginning"}] if 0 in ids else [], "non_teaching_ids": []}

    monkeypatch.setattr(units, "_llm", review)
    result, trace = units.review_boundaries(source, {"t": "Same objective"}, state, AppConfig())
    assert visited == list(range(95))
    assert len(trace) == 3
    assert len(units.assemble_units(source, result, 500)) == 1


def test_discovery_rejects_omitted_transcript(monkeypatch):
    monkeypatch.setattr(units, "_llm", lambda *args: {"spans": [{"start_id": 0, "end_id": 2, "topic": "Thirds", "kind": "teaching"}]})
    with pytest.raises(units.TeachingUnitError, match="omitted"):
        units.discover_topics(transcript(), {}, AppConfig())


def test_topic_ranges_crossing_context_edges_are_clipped_without_losing_coverage():
    response = {"spans": [
        {"start_id": "70", "end_id": "84", "topic": "First objective", "kind": "teaching"},
        {"start_id": 85, "end_id": 110, "topic": "Second objective", "kind": "teaching"},
    ]}
    spans = units._parse_spans(response, 80, 100, set(range(68, 112)))
    assert [(s["start_id"], s["end_id"]) for s in spans] == [(80, 84), (85, 99)]


def test_invalid_discovery_gets_correction_retry_before_assigning_topics(monkeypatch):
    calls = []

    def answer(task, state, config):
        calls.append(state)
        if len(calls) == 1:
            return {"spans": [{"start_id": 0, "end_id": 6, "topic": "Wrong range", "kind": "teaching"}]}
        assert "correction_required" in state
        return {"spans": [{"start_id": 0, "end_id": 5, "topic": "Corrected topic", "kind": "teaching"}]}

    monkeypatch.setattr(units, "_llm", answer)
    topics, assignments, trace = units.discover_topics(transcript(), {}, AppConfig())
    assert len(calls) == 2
    assert list(topics.values()) == ["Corrected topic"]
    assert sorted(assignments) == list(range(6))
    assert len(trace[0]["_validation_attempts"]) == 1


def test_boundary_context_is_ignored_but_invented_ids_are_rejected():
    result = {"boundaries": [{"id": 2, "reason": "Context"}, {"id": 8, "reason": "New objective"}], "non_teaching_ids": [1, 9]}
    assert units._parse_review(result, 5, 10, set(range(15))) == ({8}, {9})
    result["boundaries"].append({"id": 999, "reason": "Invented"})
    with pytest.raises(units.TeachingUnitError, match="unknown"):
        units._parse_review(result, 5, 10, set(range(15)))


def test_invalid_response_retries_are_bounded(monkeypatch):
    calls = []
    monkeypatch.setattr(units, "_llm", lambda *args: calls.append(1) or {"spans": []})
    with pytest.raises(units.TeachingUnitError, match="three attempts"):
        units.discover_topics(transcript(), {}, AppConfig())
    assert len(calls) == 3


def test_review_rejects_invented_source_ids(monkeypatch):
    monkeypatch.setattr(units, "_llm", lambda *args: {"boundaries": [{"id": 999, "reason": "Invalid"}], "non_teaching_ids": []})
    with pytest.raises(units.TeachingUnitError, match="unknown"):
        units.review_boundaries(transcript(), {}, decisions(), AppConfig())


def test_metadata_receives_every_character_including_the_tail(monkeypatch):
    source = transcript()[:1]
    source[0]["text"] = "An explanation. " * 1000 + "End with the slow demonstration."
    unit = units.assemble_units(source, decisions(), 420)[0]

    def describe(task, state, config):
        assert state["transcript"][0]["text"] == source[0]["text"]
        return {"title": "Chord-tone targeting", "summary": "Target thirds over changes.", "tags": ["chord tones"], "learning": {}}

    monkeypatch.setattr(units, "_llm", describe)
    result = units.describe_unit(unit, AppConfig())
    assert result["end_seconds"] == 420
    assert result["title"] == "Chord-tone targeting"


def test_jev_classifies_every_segment_and_passes_ambiguity_to_review(monkeypatch):
    source = transcript()
    state = {i: {"topic": "t", **decision} for i, decision in decisions().items()}
    seen = []

    def classify(value, questions, config):
        answers = {}
        for key, question in questions.items():
            seen.append(key)
            assert "segment" in question["instructions"]  # Question IDs are not shown to Jev.
            answers[key] = {"choice": "unmatched", "confidence": 0.2} if question["type"] == "choice" else {"noul": 0.5}
        return {"answers": answers, "model": "test"}

    monkeypatch.setattr(units, "_jev", classify)
    result, trace = units.classify_with_jev(source, {"t": "Chord-tone targeting"}, state, AppConfig())
    assert len(result) == len(source)
    assert len(seen) == 3 * len(source)
    assert result[2]["topic"] == "unmatched"
    assert result[2]["boundary_probability"] == 0.5
    assert trace[0]["response"]["model"] == "test"


def test_jev_bad_answers_are_errors_not_fallback(monkeypatch):
    monkeypatch.setattr(units, "_jev", lambda *args: {"answers": {}})
    with pytest.raises(units.TeachingUnitError, match="missing or invalid"):
        units.classify_with_jev(transcript(), {"t": "Thirds"}, {i: {"topic": "t"} for i in range(6)}, AppConfig())


def test_jev_http_error_does_not_expose_credentials(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", "secret-test-key")

    def failure(request, timeout):
        body = json.loads(request.data)
        assert body["model"] == "jev-latest"
        raise HTTPError(request.full_url, 401, "secret-test-key", {}, None)

    monkeypatch.setattr(units, "urlopen", failure)
    with pytest.raises(units.TeachingUnitError, match="HTTP 401") as error:
        units._jev({}, {}, AppConfig())
    assert "secret-test-key" not in str(error.value)


def test_missing_required_keys_fail_explicitly(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(units.TeachingUnitError, match="OpenAI API key"):
        units.check_configuration(AppConfig())
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    with pytest.raises(units.TeachingUnitError, match="TypeSafe API key"):
        units.check_configuration(AppConfig(marker_decision_provider="jev"))


def seed_database(tmp_path):
    db = ProcessorDB(tmp_path / "processor.sqlite")
    db.init_schema()
    item = {"absolute_path": str(tmp_path / "lesson.mp4"), "relative_path": "lesson.mp4", "filename": "lesson.mp4",
            "parent_folder": "", "extension": ".mp4", "file_size": 1, "hash": "source-v1", "duration_seconds": 420, "audio_codec": "aac"}
    video_id = db.upsert_video(item)
    db.insert_transcripts(video_id, transcript())
    db.conn.execute("UPDATE videos SET transcript_source_hash = 'source-v1' WHERE video_id = ?", (video_id,))
    db.insert_chapters_and_tags(video_id, [{"start_seconds": 0, "end_seconds": 420, "title": "Previous chapter", "tags": ["thirds"]}], [])
    return db, video_id, item


def test_failed_regeneration_preserves_chapters_and_reuses_transcript(tmp_path, monkeypatch):
    db, video_id, item = seed_database(tmp_path)
    item["reuse_transcript"] = True

    def failure(*args):
        raise units.TeachingUnitError("Provider unavailable")

    monkeypatch.setattr(processor, "generate_teaching_units", failure)
    monkeypatch.setattr(processor, "transcribe_audio", lambda *args: pytest.fail("Cached transcript should be reused"))
    try:
        with pytest.raises(units.TeachingUnitError):
            processor._process_one(db, AppConfig(output_folder=str(tmp_path)), video_id, item)
        assert db.fetch_chapters(video_id)[0]["title"] == "Previous chapter"
        assert len(db.fetch_transcripts(video_id)) == 6
    finally:
        db.close()


def test_chapter_replacement_rolls_back_on_failure(tmp_path):
    db, video_id, _ = seed_database(tmp_path)
    try:
        with pytest.raises(KeyError):
            db.replace_chapter_outputs(video_id, {"timeline_segments": []})
        assert db.fetch_chapters(video_id)[0]["title"] == "Previous chapter"
        assert db.fetch_chapter_tags(video_id, 0) == ["thirds"]
    finally:
        db.close()


def test_changed_video_does_not_relabel_old_transcript_hash(tmp_path):
    db, video_id, item = seed_database(tmp_path)
    try:
        db.upsert_video({**item, "hash": "source-v2"})
        assert db.get_video(video_id)["transcript_source_hash"] == "source-v1"
        assert db.get_video(video_id)["hash"] == "source-v2"
    finally:
        db.close()


def test_full_pipeline_uses_source_boundaries_and_saves_trace(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("TYPESAFE_API_KEY", "test")
    state = {i: {"topic": "t", **decision} for i, decision in decisions().items()}
    monkeypatch.setattr(units, "discover_topics", lambda *args: ({"t": "Thirds"}, state, [{"spans": []}]))
    monkeypatch.setattr(units, "classify_with_jev", lambda *args: (state, [{"response": {"model": "test"}}]))
    monkeypatch.setattr(units, "review_boundaries", lambda *args: (decisions(), [{"boundaries": [0, 3, 4]}]))
    monkeypatch.setattr(units, "_llm", lambda *args: {"title": "Specific teaching objective", "summary": "Practice the demonstrated idea.", "tags": ["thirds"], "learning": {}})
    payload = units.generate_teaching_units({"duration_seconds": 420}, transcript(), AppConfig(marker_decision_provider="jev"))
    assert len(payload["chapters"]) == 3
    assert payload["chapters"][0]["end_seconds"] == 240
    assert len(payload["timeline_segments"]) == 3
    assert "Let me play it slowly" in payload["timeline_segments"][0]["transcript_text"]
    assert payload["decision_trace"]["provider"] == "jev"
    assert len(payload["decision_trace"]["transcript_sha256"]) == 64
    assert payload["decision_trace"]["units"][0]["end_id"] == 2


@pytest.mark.parametrize("start,end", [(float("nan"), 10), (0, float("inf")), (-1, 2), (5, 3)])
def test_invalid_timestamps_cannot_become_markers(start, end):
    with pytest.raises(units.TeachingUnitError):
        units.normalize_segments([{"start_seconds": start, "end_seconds": end, "text": "An explanation"}], 420)


def test_marker_tags_use_shared_vocabulary_without_padding_or_metadata_leaks(monkeypatch):
    from tagger import clean_marker_tags, MARKER_TAG_VOCABULARY
    from guitar_trainer_exporter import _annotation_tags

    assert clean_marker_tags([]) == []
    assert clean_marker_tags(["invented topic", None, 12]) == []
    assert clean_marker_tags(["Chord-Voicing", "chord voicings", "BENDING", "improvisation", "jazz"]) == [
        "chord voicings", "bending", "improvisation"]

    def describe(task, state, config):
        assert state["allowed_tags"] == list(MARKER_TAG_VOCABULARY)
        return {"title": "Target thirds", "summary": "Apply chord tones over changes.",
                "tags": ["Chord-Tones", "chord tones", "thirds in D", "artist style"],
                "learning": {"topics": ["thirds in D", "resolving to thirds"], "tags": ["artist style"]}}

    monkeypatch.setattr(units, "_llm", describe)
    unit = units.assemble_units(transcript(), decisions(), 420)[0]
    chapter = units.describe_unit(unit, AppConfig())
    assert chapter["tags"] == chapter["learning_metadata"]["tags"] == ["chord tones"]
    assert "thirds in d" in chapter["learning_metadata"]["topics"]

    row = {"_tags": chapter["tags"], "learning_metadata": json.dumps(chapter["learning_metadata"])}
    assert _annotation_tags(None, 1, row, ["jazz", "invented video tag"], "chapters") == ["chord tones"]
    row["_tags"] = []
    assert _annotation_tags(None, 1, row, ["jazz"], "chapters") == []
    row["tags"] = json.dumps(["chord tones"])
    row["segment_type"] = "demonstration"
    assert _annotation_tags(None, 1, row, ["jazz"], "timeline-segments") == ["chord tones"]
