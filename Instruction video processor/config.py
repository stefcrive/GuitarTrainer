from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field


class AppConfig(BaseModel):
    root_folder: str | None = None
    output_folder: str = "outputs"
    database_path: str = "outputs/processor.sqlite"
    whisper_model: str = "small"
    language: str = "auto"
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o-mini"
    max_videos_per_run: int | None = None
    skip_existing: bool = True
    force_reprocess: bool = False
    audio_analysis_enabled: bool = True
    audio_analysis_window_seconds: float = 3.0
    audio_analysis_hop_seconds: float = 1.5
    audio_classifier: str = "yamnet"
    chapter_min_count: int = 5
    chapter_max_count: int = 20
    tag_max_count: int = 20
    embedding_enabled: bool = False
    keep_audio_cache: bool = False
    guitar_trainer_export_enabled: bool = True
    guitar_trainer_db_path: str | None = None
    guitar_trainer_merge_mode: Literal["preserve-existing", "replace-generated", "force"] = "preserve-existing"
    log_level: str = "INFO"

    def output_path(self) -> Path:
        return Path(self.output_folder)

    def db_path(self) -> Path:
        return Path(self.database_path)


def load_config(config_path: str | Path = "config.yaml") -> AppConfig:
    path = Path(config_path)
    if not path.exists():
        return AppConfig()
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return AppConfig(**data)


def apply_runtime_overrides(
    config: AppConfig,
    *,
    root_folder: str | None = None,
    output_folder: str | None = None,
    database_path: str | None = None,
    limit: int | None = None,
    force: bool | None = None,
) -> AppConfig:
    data = config.model_dump()
    if root_folder is not None:
        data["root_folder"] = root_folder
    if output_folder is not None:
        data["output_folder"] = output_folder
    if database_path is not None:
        data["database_path"] = database_path
    if limit is not None:
        data["max_videos_per_run"] = limit
    if force is not None:
        data["force_reprocess"] = force
        if force:
            data["skip_existing"] = False
    return AppConfig(**data)

