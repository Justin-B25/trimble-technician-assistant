#!/usr/bin/env python3
"""Export guide-data.js + hardware-catalog.js to JSON (no Node required)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import json5

ROOT = Path(__file__).resolve().parent.parent
HW_PATH = ROOT / 'hardware-catalog.js'
GUIDE_PATH = ROOT / 'guide-data.js'
OUT_PATH = ROOT / 'scripts' / 'guide-export.json'


def strip_js_comments(text: str) -> str:
    out = []
    i = 0
    n = len(text)
    in_single = False
    in_double = False
    in_line_comment = False
    in_block_comment = False
    while i < n:
        ch = text[i]
        nxt = text[i + 1] if i + 1 < n else ''

        if in_line_comment:
            if ch == '\n':
                in_line_comment = False
                out.append(ch)
            i += 1
            continue

        if in_block_comment:
            if ch == '*' and nxt == '/':
                in_block_comment = False
                i += 2
            else:
                i += 1
            continue

        if in_single:
            out.append(ch)
            if ch == '\\' and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue

        if in_double:
            out.append(ch)
            if ch == '\\' and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_double = False
            i += 1
            continue

        if ch == '/' and nxt == '/':
            in_line_comment = True
            i += 2
            continue
        if ch == '/' and nxt == '*':
            in_block_comment = True
            i += 2
            continue
        if ch == "'":
            in_single = True
            out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_double = True
            out.append(ch)
            i += 1
            continue

        out.append(ch)
        i += 1

    return ''.join(out)


def extract_const(name: str, text: str) -> str:
    pattern = re.compile(rf'const\s+{re.escape(name)}\s*=\s*')
    match = pattern.search(text)
    if not match:
        raise ValueError(f'Could not find const {name}')

    start = match.end()
    if text[start] not in '{[':
        raise ValueError(f'Unexpected const value for {name}')

    opener = text[start]
    closer = '}' if opener == '{' else ']'
    depth = 0
    in_single = False
    in_double = False
    i = start
    while i < len(text):
        ch = text[i]
        if in_single:
            if ch == '\\':
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            if ch == '\\':
                i += 2
                continue
            if ch == '"':
                in_double = False
            i += 1
            continue
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == '"':
            in_double = True
            i += 1
            continue
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
        i += 1
    raise ValueError(f'Unbalanced braces for const {name}')


def parse_const(name: str, text: str):
    raw = extract_const(name, strip_js_comments(text))
    return json5.loads(raw)


def export() -> dict:
    hw_text = HW_PATH.read_text(encoding='utf-8')
    guide_text = GUIDE_PATH.read_text(encoding='utf-8')

    payload = {
        'ASSEMBLY_ORDER': parse_const('ASSEMBLY_ORDER', guide_text),
        'GUIDE': parse_const('GUIDE', guide_text),
        'CRANE_DRIVE_IMAGES': parse_const('CRANE_DRIVE_IMAGES', guide_text),
        'HARDWARE_CATALOG': parse_const('HARDWARE_CATALOG', hw_text),
        'MASTER_HARDWARE_KIT': parse_const('MASTER_HARDWARE_KIT', hw_text),
        'INSERT_CALLOUTS': parse_const('INSERT_CALLOUTS', hw_text),
    }
    return payload


def main() -> None:
    payload = export()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'Wrote {OUT_PATH}')


if __name__ == '__main__':
    main()
