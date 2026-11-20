"""Generate teaching-unit markers from existing YouTube captions, without downloading media."""
from __future__ import annotations

import argparse
import html
import json
import math
import re
import time
from pathlib import Path

from config import load_config
from guitar_trainer_exporter import _marker_learning_metadata
from teaching_units import TeachingUnitError, check_configuration, generate_teaching_units
from utils import write_json
from persistent_cache import archive_transcript, restore_transcript, atomic_json


def caption_segments(snippets, duration):
    rows = []
    for snippet in snippets:
        start, length = float(snippet['start']), float(snippet['duration'])
        if not math.isfinite(start) or not math.isfinite(length) or start < 0 or length < 0:
            raise TeachingUnitError('YouTube captions contain invalid timestamps.')
        text = html.unescape(str(snippet['text'])).strip()
        if text and start < duration:
            rows.append({'start_seconds': start, 'end_seconds': min(duration, start + length), 'text': text})
    rows.sort(key=lambda row: row['start_seconds'])
    merged = []
    for row in rows:
        if merged and row['start_seconds'] == merged[-1]['start_seconds']:
            merged[-1]['text'] += ' ' + row['text']
            merged[-1]['end_seconds'] = max(merged[-1]['end_seconds'], row['end_seconds'])
        else:
            merged.append(row)
    # Caption display intervals can overlap; retain every word while using the
    # next cue's start as the maximum end of the preceding transcript segment.
    for index, row in enumerate(merged):
        next_start = merged[index + 1]['start_seconds'] if index + 1 < len(merged) else duration
        row['end_seconds'] = min(row['end_seconds'], next_start)
        if row['end_seconds'] <= row['start_seconds']:
            row['end_seconds'] = next_start
    if not merged:
        raise TeachingUnitError('This video has no usable caption text.')
    return merged


def fetch_captions(video_id, language, cache_dir):
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise TeachingUnitError('Invalid YouTube video ID.')
    cache = Path(cache_dir) / f'{video_id}-{language}.json'
    source_key = f'youtube:{video_id}:{language}'
    archived = restore_transcript(source_key)
    if archived and archived.get('captions'):
        print('MARKER_PHASE: Reusing saved YouTube captions', flush=True)
        return archived['captions']
    if cache.exists():
        try:
            saved = json.loads(cache.read_text(encoding='utf-8'))
            if saved.get('video_id') == video_id and isinstance(saved.get('snippets'), list) and saved['snippets']:
                archive_transcript(source_key, {'segments': saved['snippets'], 'captions': saved})
                print('MARKER_PHASE: Reusing cached YouTube captions', flush=True)
                return saved
        except (ValueError, OSError):
            pass
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from requests import Session
    except ImportError:
        raise TeachingUnitError('YouTube caption support is missing. Install the processor requirements.txt.') from None

    class TimeoutSession(Session):
        def request(self, *args, **kwargs):
            kwargs.setdefault('timeout', 30)
            return super().request(*args, **kwargs)

    print('MARKER_PHASE: Fetching YouTube captions', flush=True)
    try:
        with TimeoutSession() as session:
            tracks = list(YouTubeTranscriptApi(http_client=session).list(video_id))
            if language != 'auto':
                tracks = [track for track in tracks if track.language_code == language]
            if not tracks:
                raise TeachingUnitError('No captions are available for this video in the requested language.')
            tracks.sort(key=lambda track: (not track.language_code.startswith('en') if language == 'auto' else False, track.is_generated))
            track = tracks[0]
            result = {'video_id': video_id, 'language': track.language_code, 'is_generated': track.is_generated,
                      'snippets': track.fetch().to_raw_data(), 'fetched_at': time.time()}
    except TeachingUnitError:
        raise
    except Exception as exc:
        name = type(exc).__name__
        if name in {'RequestBlocked', 'IpBlocked'}:
            message = 'YouTube blocked the caption request. Try again later from your local connection.'
        elif name in {'TranscriptsDisabled', 'NoTranscriptFound'}:
            message = 'YouTube captions are disabled or unavailable for this video.'
        elif name in {'AgeRestricted', 'VideoUnavailable', 'VideoUnplayable', 'PoTokenRequired'}:
            message = 'YouTube does not allow caption access for this video (restricted, private, or unavailable).'
        else:
            message = f'Unable to fetch YouTube captions ({name}). Try again later.'
        raise TeachingUnitError(message) from None
    if not result['snippets']:
        raise TeachingUnitError('This video has no usable caption text.')
    archive_transcript(source_key, {'segments': result['snippets'], 'captions': result})
    atomic_json(cache, result)
    return result


def marker_state(video_id, chapters):
    now = int(time.time() * 1000)
    markers, annotations = [], []
    for index, chapter in enumerate(chapters):
        marker_id = f'gtm:youtube:{video_id}:{index}'
        tags = chapter.get('tags', [])
        learning_row = {**chapter, 'learning_metadata': json.dumps(chapter.get('learning_metadata', {}))}
        markers.append({'id': marker_id, 'startTime': chapter['start_seconds'], 'endTime': chapter['end_seconds'],
                        'title': chapter['title'], 'isLooping': False, 'completionDegree': 0, 'createdAt': now,
                        'diagrams': [], 'learning': _marker_learning_metadata(learning_row, tags)})
        annotations.append({'id': f'gta:youtube:{video_id}:{index}', 'markerId': marker_id,
                            'text': chapter['summary'], 'tags': tags, 'timestamp': now})
    return {'markers': markers, 'annotations': annotations, 'activeMarkerId': None, 'isLooping': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video-id', required=True)
    parser.add_argument('--duration', required=True, type=float)
    parser.add_argument('--title', default='YouTube guitar lesson')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not math.isfinite(args.duration) or args.duration <= 0:
        raise TeachingUnitError('A finite video duration is required; live streams are not supported.')
    config = load_config()
    check_configuration(config)
    language = config.language if re.fullmatch(r'[A-Za-z0-9-]+', config.language) else 'auto'
    captions = fetch_captions(args.video_id, language, Path(config.output_folder) / 'youtube' / 'captions')
    transcript = caption_segments(captions['snippets'], args.duration)
    payload = generate_teaching_units({'duration_seconds': args.duration, 'filename': args.title}, transcript, config)
    payload['decision_trace']['caption_source'] = {k: v for k, v in captions.items() if k != 'snippets'}
    write_json(Path(config.output_folder) / 'youtube' / f'{args.video_id}_decisions.json', payload['decision_trace'])
    write_json(args.output, marker_state(args.video_id, payload['chapters']))


if __name__ == '__main__':
    try:
        main()
    except TeachingUnitError as error:
        import sys
        print(str(error), file=sys.stderr)
        sys.exit(1)
