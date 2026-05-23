from __future__ import annotations

import re

from utils import normalize_tags


PRACTICAL_GUITAR_TAGS = {
    "alternate picking",
    "all-fourths",
    "all fourths",
    "economy picking",
    "sweep picking",
    "legato",
    "hammer-on",
    "pull-off",
    "bending",
    "vibrato",
    "slides",
    "fingerstyle",
    "hybrid picking",
    "chord melody",
    "guide tones",
    "shell voicings",
    "drop 2",
    "drop 3",
    "voice leading",
    "inner voice movement",
    "modal interchange",
    "secondary dominants",
    "diminished passing chords",
    "pedal point",
    "triad pairs",
    "triad inversions",
    "spread triads",
    "close triads",
    "jazz guitar",
    "blues guitar",
    "rock guitar",
    "metal guitar",
    "classical guitar",
    "rhythm guitar",
    "lead guitar",
    "improvisation",
    "scale practice",
    "arpeggios",
    "triads",
    "modes",
    "melodic minor",
    "harmonic minor",
    "lydian dominant",
    "pentatonic",
    "major scale",
    "minor scale",
    "interval recognition",
    "intervallic playing",
    "interval function",
    "scale-degree hearing",
    "functional harmony",
    "fretboard visualization",
    "fretboard mapping",
    "fretboard navigation",
    "playing over changes",
    "three-note-per-string",
    "three note per string",
    "caged system",
    "position playing",
    "chord tones",
    "chord voicing",
    "comping",
    "composition",
    "arrangement",
    "reharmonization",
    "transcription",
    "timing",
    "metronome",
    "groove",
    "syncopation",
    "right hand technique",
    "left hand technique",
    "warm-up",
    "exercise",
    "etude",
    "performance",
    "demonstration",
    "slow practice",
    "backing track",
    "tone",
    "amp settings",
    "guitar setup",
    "tuning",
}


GENERIC_TAGS = {
    "video",
    "lesson",
    "part",
    "tutorial",
    "music",
    "guitar",
    "music theory",
    "practice",
    "performance and playing with others",
    "performance preparation",
}


def clean_llm_tags(tags: list[str], max_count: int = 20) -> list[str]:
    cleaned = normalize_tags(tags, max_count=None)
    result: list[str] = []
    seen_keys: set[str] = set()
    for tag in cleaned:
        key = _similarity_key(tag)
        if tag in GENERIC_TAGS or key in GENERIC_TAGS or key in seen_keys:
            continue
        seen_keys.add(key)
        result.append(tag)
        if len(result) >= max_count:
            break
    return result


def infer_tags_from_text(text: str, max_count: int = 20) -> list[str]:
    low = text.lower().replace("_", " ").replace("-", " ")
    matches = [tag for tag in sorted(PRACTICAL_GUITAR_TAGS) if tag in low]
    return clean_llm_tags(matches, max_count=max_count)


def _similarity_key(tag: str) -> str:
    key = tag.lower().replace("&", " and ")
    key = re.sub(r"[-_/]+", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    if key.endswith("s") and len(key) > 4:
        key = key[:-1]
    return key

