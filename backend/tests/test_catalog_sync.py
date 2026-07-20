"""Guards the append-only contract between the two built-in catalogs.

Local mode (`mobile/src/local/catalog.ts`) derives exercise ids from list
position, so it MUST stay byte-for-byte in sync with the backend seed
(`app.seed.BUILTIN_EXERCISES`): same names, groups, equipment, rest defaults,
in the same order. A reorder, removal, edit, or one-sided append silently
remaps every stored `exercise_id` on-device — this test turns that into a
failing build instead of corrupted history.
"""

import re
from pathlib import Path

from app.seed import BUILTIN_EXERCISES

CATALOG_TS = (
    Path(__file__).resolve().parents[2] / "mobile" / "src" / "local" / "catalog.ts"
)

# Matches a catalog row: ["Name", "group", "equipment", 120]
_ENTRY = re.compile(
    r'\[\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*(\d+)\s*\]'
)


def _parse_catalog_ts() -> list[tuple[str, str, str, int]]:
    text = CATALOG_TS.read_text(encoding="utf-8")
    return [(n, g, e, int(r)) for n, g, e, r in _ENTRY.findall(text)]


def test_catalog_file_exists():
    assert CATALOG_TS.exists(), f"expected local catalog at {CATALOG_TS}"


def test_local_catalog_matches_seed():
    ts_entries = _parse_catalog_ts()
    py_entries = [tuple(row) for row in BUILTIN_EXERCISES]

    assert len(ts_entries) == len(py_entries), (
        f"catalog length drift: catalog.ts has {len(ts_entries)}, "
        f"seed.py has {len(py_entries)} — the two must stay in sync (append-only)."
    )
    for i, (ts, py) in enumerate(zip(ts_entries, py_entries)):
        assert ts == py, (
            f"catalog entry #{i} (id {i + 1}) differs:\n"
            f"  catalog.ts: {ts}\n"
            f"  seed.py:    {py}"
        )


def test_catalog_names_are_unique():
    py_names = [row[0] for row in BUILTIN_EXERCISES]
    dupes = {n for n in py_names if py_names.count(n) > 1}
    assert not dupes, f"duplicate built-in exercise names: {sorted(dupes)}"
