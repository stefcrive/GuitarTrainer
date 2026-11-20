from types import SimpleNamespace
import pytest
import youtube_transcript_api
from youtube_markers import caption_segments, fetch_captions, marker_state
from teaching_units import TeachingUnitError, normalize_segments


def test_overlapping_captions_preserve_text_and_normalize_for_pipeline():
    segments = caption_segments([
        {'start': 0, 'duration': 5, 'text': 'Explain &amp; demonstrate'},
        {'start': 3, 'duration': 4, 'text': 'Play it slowly'},
        {'start': 3, 'duration': 6, 'text': 'Then correct it'},
        {'start': 10, 'duration': 5, 'text': 'Next topic'},
    ], 12)
    assert len(segments) == 3
    assert segments[0]['end_seconds'] == 3
    assert segments[0]['text'] == 'Explain & demonstrate'
    assert segments[1]['text'] == 'Play it slowly Then correct it'
    assert segments[-1]['end_seconds'] == 12
    assert len(normalize_segments(segments, 12)) == 3


def test_caption_cache_and_manual_track_preference(tmp_path, monkeypatch):
    calls = []
    snippets = [{'start': 0, 'duration': 3, 'text': 'A complete explanation'}]
    manual = SimpleNamespace(language_code='en', is_generated=False,
                             fetch=lambda: SimpleNamespace(to_raw_data=lambda: snippets))
    auto = SimpleNamespace(language_code='en', is_generated=True,
                           fetch=lambda: pytest.fail('Prefer manual captions'))
    class FakeApi:
        def __init__(self, **kwargs): pass
        def list(self, video_id):
            calls.append(video_id)
            return [auto, manual]
    monkeypatch.setattr(youtube_transcript_api, 'YouTubeTranscriptApi', FakeApi)
    first = fetch_captions('abcdefghijk', 'auto', tmp_path)
    second = fetch_captions('abcdefghijk', 'auto', tmp_path)
    assert first == second
    assert len(calls) == 1
    assert first['is_generated'] is False


def test_missing_captions_is_explicit(tmp_path, monkeypatch):
    class FakeApi:
        def __init__(self, **kwargs): pass
        def list(self, video_id): return []
    monkeypatch.setattr(youtube_transcript_api, 'YouTubeTranscriptApi', FakeApi)
    with pytest.raises(TeachingUnitError, match='No captions'):
        fetch_captions('abcdefghijk', 'auto', tmp_path)


def test_invalid_id_cannot_escape_caption_cache(tmp_path):
    with pytest.raises(TeachingUnitError, match='Invalid YouTube'):
        fetch_captions('../outside', 'auto', tmp_path)


def test_youtube_markers_keep_bounds_and_use_separate_generated_ids():
    result = marker_state('abcdefghijk', [{'start_seconds': 1.25, 'end_seconds': 50.8, 'title': 'Chord tones',
        'summary': 'Target thirds.', 'tags': ['thirds'], 'learning_metadata': {'primary_domain': 'Harmony & Voice Leading'}}])
    marker = result['markers'][0]
    assert marker['id'] == 'gtm:youtube:abcdefghijk:0'
    assert marker['startTime'] == 1.25 and marker['endTime'] == 50.8
    assert marker['learning']['primaryDomain'] == 'Harmony & Voice Leading'
    assert result['annotations'][0]['markerId'] == marker['id']
