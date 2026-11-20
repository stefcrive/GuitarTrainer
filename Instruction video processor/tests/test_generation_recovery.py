import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

import app
import scanner
import teaching_units as units
import transcriber
from config import AppConfig
from database import ProcessorDB
from persistent_cache import archive_transcript, restore_transcript, cache_root
from youtube_markers import fetch_captions


def test_transcript_versions_survive_pointer_loss_and_changed_source():
    first = {'segments': [{'text': 'First transcript'}]}
    second = {'segments': [{'text': 'Corrected transcript'}]}
    original = archive_transcript('source-v1', first)
    replacement = archive_transcript('source-v1', second)
    assert json.loads(original.read_text()) == first
    assert original != replacement
    assert restore_transcript('source-v1') == second
    assert restore_transcript('source-v2') is None
    (original.parent / 'latest.json').write_text('broken')
    assert restore_transcript('source-v1') in (first, second)


def test_lost_processor_database_restores_archive_before_marker_failure(tmp_path, monkeypatch):
    segments = [{'start_seconds': 0, 'end_seconds': 10, 'text': 'Target thirds over these changes.'}]
    archive_transcript('video-content', {'segments': segments})
    db = ProcessorDB(tmp_path / 'new.sqlite')
    db.init_schema()
    item = {'absolute_path': str(tmp_path / 'lesson.mp4'), 'relative_path': 'lesson.mp4', 'filename': 'lesson.mp4',
            'parent_folder': '', 'extension': '.mp4', 'file_size': 1, 'hash': 'video-content', 'duration_seconds': 20, 'audio_codec': 'aac'}
    video_id = db.upsert_video(item)
    monkeypatch.setattr(app, 'transcribe_audio', lambda *args: pytest.fail('Must restore saved transcript'))
    def fail(*args): raise units.TeachingUnitError('Provider failed')
    monkeypatch.setattr(app, 'generate_teaching_units', fail)
    try:
        with pytest.raises(units.TeachingUnitError):
            app._process_one(db, AppConfig(output_folder=str(tmp_path / 'outputs')), video_id, item)
        assert db.fetch_transcripts(video_id)[0]['text'] == segments[0]['text']
        db.clear_processing_outputs(video_id)
        assert len(db.fetch_transcripts(video_id)) == 1
        assert restore_transcript('video-content')['segments']
    finally:
        db.close()


def test_single_video_scan_never_enumerates_other_courses(tmp_path, monkeypatch):
    (tmp_path / 'lesson.mp4').write_bytes(b'video')
    monkeypatch.setattr(Path, 'rglob', lambda *args: pytest.fail('Do not scan whole library'))
    videos = scanner.scan_videos(tmp_path, video_path='lesson.mp4', include_media=False)
    assert len(videos) == 1
    with pytest.raises(ValueError, match='inside'):
        scanner.scan_videos(tmp_path, video_path='../outside.mp4')


def test_review_schema_pins_high_segment_ids(monkeypatch):
    segments = [{'id': i, 'text': f'Sentence {i}'} for i in range(1240)]
    decisions = {i: {'topic': 't', 'kind': 'teaching', 'starts_unit': False} for i in range(1240)}
    def answer(task, state, config):
        properties = state['_response_schema']['properties']['decisions']['properties']
        assert set(properties) == {f's{i}' for i in state['core_ids']}
        return {'decisions': {key: 'start' if key == 's1160' else 'continue' for key in properties}}
    monkeypatch.setattr(units, '_llm', answer)
    reviewed, trace = units.review_boundaries(segments, {'t': 'A complete lesson'}, decisions, AppConfig())
    assert reviewed[1160]['starts_unit']
    assert not reviewed[120]['starts_unit']
    with pytest.raises(units.TeachingUnitError):
        units._parse_review({'decisions': {'s120': 'start'}}, 1160, 1200, set(range(1136, 1224)))


def test_validated_windows_resume_but_new_prompt_and_preset_recompute(monkeypatch):
    calls = []
    monkeypatch.setattr(units, '_llm', lambda *args: calls.append(args) or {'ok': True})
    for config in [AppConfig(), AppConfig(), AppConfig(marker_preset='devices'), AppConfig(marker_prompt='Focus on rhythm')]:
        units._validated_llm('task', {'source': 'same'}, config, lambda result: result['ok'])
    assert len(calls) == 3
    assert len(list((cache_root() / 'decisions').glob('*.json'))) == 3
    assert 'Focus on rhythm' in units.segmentation_rules(AppConfig(marker_prompt='Focus on rhythm'))


def test_old_youtube_captions_never_expire_and_recover_without_output_cache(tmp_path):
    saved = {'video_id': 'abcdefghijk', 'snippets': [{'start': 0, 'duration': 2, 'text': 'Saved lesson'}]}
    cache = tmp_path / 'abcdefghijk-auto.json'
    cache.write_text(json.dumps(saved))
    os.utime(cache, (1, 1))
    assert fetch_captions('abcdefghijk', 'auto', tmp_path) == saved
    cache.unlink()
    assert fetch_captions('abcdefghijk', 'auto', tmp_path) == saved


@pytest.mark.parametrize('mode', ['fast', 'standard'])
def test_fast_transcription_batches_without_changing_model_or_beam(monkeypatch, mode):
    calls = []
    class Model:
        def __init__(self, name, **kwargs):
            assert name == 'small'
        def transcribe(self, path, **kwargs):
            calls.append(kwargs)
            return iter([SimpleNamespace(start=0, end=3, text='A complete idea.', avg_logprob=-0.1)]), SimpleNamespace(language='en')
    class Batched(Model):
        def __init__(self, model): assert isinstance(model, Model)
    monkeypatch.setitem(sys.modules, 'faster_whisper', SimpleNamespace(WhisperModel=Model, BatchedInferencePipeline=Batched))
    result = transcriber.transcribe_audio('audio.wav', AppConfig(transcription_mode=mode))
    assert result['segments'][0]['text'] == 'A complete idea.'
    assert calls[0]['beam_size'] == 5
    assert ('batch_size' in calls[0]) == (mode == 'fast')
    if mode == 'fast':
        assert calls[0]['without_timestamps'] is False  # Retain speech anchors within each batch.
