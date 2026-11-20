import json
import sys

from utils import run_command


def test_utf8_metadata_survives_windows_legacy_encoding():
    # U+0141 and U+201D encode to the bytes 0x81/0x9d that cp1252 rejects.
    metadata = {"title": "\u0141esson \u201d", "duration": "123.4"}
    raw = json.dumps(metadata, ensure_ascii=False).encode("utf-8")
    result = run_command([
        sys.executable, "-c",
        f"import sys; sys.stdout.buffer.write({raw!r}); sys.stderr.buffer.write({raw!r})",
    ])
    assert result.returncode == 0
    assert json.loads(result.stdout) == metadata
    assert json.loads(result.stderr) == metadata


def test_invalid_diagnostic_bytes_do_not_crash_reader_threads():
    result = run_command([
        sys.executable, "-c",
        "import sys; sys.stdout.buffer.write(b'valid output'); sys.stderr.buffer.write(b'warning: \\x81\\x9d'); sys.exit(7)",
    ])
    assert result.returncode == 7
    assert result.stdout == "valid output"
    assert result.stderr == "warning: \ufffd\ufffd"
