import pytest


@pytest.fixture(autouse=True)
def isolated_processor_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("GUITAR_TRAINER_CACHE_DIR", str(tmp_path / "durable-cache"))
