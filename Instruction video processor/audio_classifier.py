from __future__ import annotations

import csv
import io
import math
import wave
from pathlib import Path
from typing import Any

from config import AppConfig


SPEECH_LABELS = {"speech", "narration", "conversation", "male speech", "female speech"}
MUSIC_LABELS = {"music", "musical instrument", "plucked string instrument"}
GUITAR_LABELS = {"guitar", "acoustic guitar", "electric guitar", "bass guitar"}
NOISE_LABELS = {"silence", "inside, small room", "click", "tap", "noise"}


def classify_audio_windows(
    audio_path: str | Path,
    config: AppConfig,
    transcript_segments: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    if not config.audio_analysis_enabled:
        return []
    if config.audio_classifier.lower() == "yamnet":
        try:
            return _classify_with_yamnet(audio_path, config)
        except Exception:
            return _fallback_classify(audio_path, config, transcript_segments or [])
    return _fallback_classify(audio_path, config, transcript_segments or [])


def _classify_with_yamnet(audio_path: str | Path, config: AppConfig) -> list[dict[str, Any]]:
    import tensorflow as tf
    import tensorflow_hub as hub

    model = hub.load("https://tfhub.dev/google/yamnet/1")
    waveform = _load_wav_as_tensor(audio_path, tf)
    scores, _, _ = model(waveform)
    class_names = _load_yamnet_class_names(model, tf)
    frame_hop = 0.48
    windows: list[dict[str, Any]] = []
    window_seconds = float(config.audio_analysis_window_seconds)
    hop_seconds = float(config.audio_analysis_hop_seconds)
    duration = float(waveform.shape[0]) / 16000.0
    start = 0.0
    idx = 0
    while start < duration:
        end = min(duration, start + window_seconds)
        frame_start = max(0, int(start / frame_hop))
        frame_end = max(frame_start + 1, int(math.ceil(end / frame_hop)))
        window_scores = scores[frame_start:frame_end]
        mean_scores = tf.reduce_mean(window_scores, axis=0).numpy()
        top_indexes = mean_scores.argsort()[-5:][::-1]
        labels = [class_names[i] for i in top_indexes]
        top_scores = [float(mean_scores[i]) for i in top_indexes]
        broad = _aggregate_scores(labels, top_scores)
        windows.append(
            {
                "window_index": idx,
                "start_seconds": start,
                "end_seconds": end,
                "top_labels": labels,
                "top_scores": top_scores,
                **broad,
            }
        )
        idx += 1
        start += hop_seconds
    return windows


def _load_wav_as_tensor(audio_path: str | Path, tf: Any) -> Any:
    audio_binary = tf.io.read_file(str(audio_path))
    waveform, sample_rate = tf.audio.decode_wav(audio_binary, desired_channels=1)
    waveform = tf.squeeze(waveform, axis=-1)
    if int(sample_rate.numpy()) != 16000:
        raise ValueError("YAMNet path expects audio extracted at 16 kHz")
    return waveform


def _load_yamnet_class_names(model: Any, tf: Any) -> list[str]:
    class_map_path = model.class_map_path().numpy().decode("utf-8")
    raw = tf.io.read_file(class_map_path).numpy().decode("utf-8")
    reader = csv.DictReader(io.StringIO(raw))
    return [row["display_name"] for row in reader]


def _aggregate_scores(labels: list[str], scores: list[float]) -> dict[str, float]:
    speech = music = guitar = noise = 0.0
    for label, score in zip(labels, scores):
        low = label.lower()
        if any(token in low for token in SPEECH_LABELS):
            speech = max(speech, score)
        if any(token in low for token in MUSIC_LABELS):
            music = max(music, score)
        if any(token in low for token in GUITAR_LABELS):
            guitar = max(guitar, score)
        if any(token in low for token in NOISE_LABELS):
            noise = max(noise, score)
    return {
        "speech_score": float(speech),
        "music_score": float(max(music, guitar)),
        "guitar_or_instrument_score": float(guitar),
        "silence_or_noise_score": float(noise),
    }


def _fallback_classify(
    audio_path: str | Path,
    config: AppConfig,
    transcript_segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    with wave.open(str(audio_path), "rb") as wav:
        sample_rate = wav.getframerate()
        frame_count = wav.getnframes()
        duration = frame_count / float(sample_rate or 1)
        window_seconds = float(config.audio_analysis_window_seconds)
        hop_seconds = float(config.audio_analysis_hop_seconds)
        windows: list[dict[str, Any]] = []
        idx = 0
        start = 0.0
        while start < duration:
            end = min(duration, start + window_seconds)
            wav.setpos(max(0, int(start * sample_rate)))
            frames = wav.readframes(max(1, int((end - start) * sample_rate)))
            rms = _pcm_rms(frames)
            transcript_overlap = _has_transcript_overlap(start, end, transcript_segments)
            speech_score = 0.7 if transcript_overlap else 0.05
            energy_score = min(0.8, rms / 9000.0)
            silence = max(0.0, 0.75 - energy_score)
            if transcript_overlap and energy_score > 0.12:
                labels = ["speech", "possible_music_or_guitar"]
                music_score = energy_score * 0.55
                guitar_score = energy_score * 0.4
            elif energy_score > 0.12:
                labels = ["possible_music_or_silence"]
                music_score = energy_score
                guitar_score = energy_score * 0.45
            else:
                labels = ["silence_or_room_tone"]
                music_score = 0.05
                guitar_score = 0.02
            windows.append(
                {
                    "window_index": idx,
                    "start_seconds": start,
                    "end_seconds": end,
                    "top_labels": labels,
                    "top_scores": [round(max(speech_score, music_score, silence), 3)],
                    "speech_score": round(speech_score, 3),
                    "music_score": round(music_score, 3),
                    "guitar_or_instrument_score": round(guitar_score, 3),
                    "silence_or_noise_score": round(silence, 3),
                }
            )
            idx += 1
            start += hop_seconds
    return windows


def _pcm_rms(frames: bytes) -> float:
    if not frames:
        return 0.0
    total = 0
    count = len(frames) // 2
    for i in range(0, len(frames) - 1, 2):
        sample = int.from_bytes(frames[i : i + 2], byteorder="little", signed=True)
        total += sample * sample
    return math.sqrt(total / max(1, count))


def _has_transcript_overlap(start: float, end: float, segments: list[dict[str, Any]]) -> bool:
    for segment in segments:
        seg_start = float(segment.get("start_seconds", 0))
        seg_end = float(segment.get("end_seconds", 0))
        if seg_start < end and seg_end > start:
            return True
    return False

