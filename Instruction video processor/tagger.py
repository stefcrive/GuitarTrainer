from __future__ import annotations

from utils import normalize_tags


PRACTICAL_GUITAR_TAGS = {
    "alternate picking",
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
    "pentatonic",
    "major scale",
    "minor scale",
    "chord voicing",
    "comping",
    "timing",
    "metronome",
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


GENERIC_TAGS = {"video", "lesson", "part", "tutorial", "music", "guitar"}


def clean_llm_tags(tags: list[str], max_count: int = 20) -> list[str]:
    cleaned = normalize_tags(tags, max_count=None)
    result: list[str] = []
    for tag in cleaned:
        if tag in GENERIC_TAGS:
            continue
        result.append(tag)
        if len(result) >= max_count:
            break
    return result


def infer_tags_from_text(text: str, max_count: int = 20) -> list[str]:
    low = text.lower().replace("_", " ").replace("-", " ")
    matches = [tag for tag in sorted(PRACTICAL_GUITAR_TAGS) if tag in low]
    return clean_llm_tags(matches, max_count=max_count)

