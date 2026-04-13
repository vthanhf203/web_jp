#!/usr/bin/env python3
"""Import Minna no Nihongo grammar PDF into structured JSON for the web app.

Usage:
  python scripts/import_grammar_pdf.py \
    --input "D:\\Downloads\\Minna-no-Nihongo-Ngu_Phap_50_bai (4).pdf" \
    --output "data\\grammar\\minna-n4n5.json"
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional

from pypdf import PdfReader


FULLWIDTH_DIGITS = str.maketrans("\uff10\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18\uff19", "0123456789")
LESSON_HEADER_RE = re.compile(
    r"(?:\u7b2c\s*[\u3041-\u3096\u30a1-\u30ff\u30fc]*\s*)?"
    r"([0-9\uFF10-\uFF19]{1,2})\s*"
    r"(?:[\u3041-\u3096\u30a1-\u30ff\u30fc]*\s*)?\u8ab2"
)
POINT_START_RE = re.compile(r"^\s*(\d{1,2})\s*(?:[.\uff0e)\uff09:])(?:\s|$)")
ITEM_MARKER_RE = re.compile(r"^\s*(?:\d{1,2}[.)]|[\u2460-\u2473])\s*")

NOISE_LINE_PREFIXES = (
    "fpt university",
    "japanese language training division",
    "giai thich van pham",
    "tieng nhat co so",
)

HIRAGANA_KATAKANA_RE = re.compile(r"[\u3040-\u30ff]")
KANJI_RE = re.compile(r"[\u4e00-\u9fff]")
JAPANESE_RE = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")
KANA_ONLY_RE = re.compile(r"^[\u3040-\u30ff\u30fc]+$")
LATIN_RE = re.compile(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]")


def to_ascii_folded(value: str) -> str:
    folded = unicodedata.normalize("NFD", value.lower())
    return "".join(ch for ch in folded if unicodedata.category(ch) != "Mn")


def strip_controls(value: str) -> str:
    return "".join(
        ch for ch in value if unicodedata.category(ch) not in {"Cc", "Cf"}
    )


def normalize_space(value: str) -> str:
    value = value.replace("\u3000", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def normalize_text(value: str) -> str:
    text = strip_controls(value)
    text = unicodedata.normalize("NFC", text)

    # Remove stray accent marks commonly produced by PDF extraction in Vietnamese text.
    text = text.replace("´", "").replace("`", "")

    text = normalize_space(text)
    text = re.sub(r"\s+([,.:;!?])", r"\1", text)
    text = re.sub(r"\s+([\u3002\u3001\uff01\uff1f])", r"\1", text)
    text = re.sub(r"([\(\uff08\u300c\u300e])\s+", r"\1", text)
    text = re.sub(r"\s+([\)\uff09\u300d\u300f])", r"\1", text)
    return text


def parse_lesson_number(raw: str) -> Optional[int]:
    compact = " ".join(raw.split())
    match = LESSON_HEADER_RE.search(compact[:1800])
    if not match:
        return None

    number_text = match.group(1).translate(FULLWIDTH_DIGITS)
    try:
        lesson = int(number_text)
    except ValueError:
        return None

    if 1 <= lesson <= 50:
        return lesson
    return None


def is_cover_page(raw: str) -> bool:
    folded = to_ascii_folded(" ".join(raw.split()))
    has_chapter = "\u8ab2" in raw
    return "grammar explanation" in folded and "lesson" in folded and not has_chapter


def clean_lines(raw: str) -> List[str]:
    cleaned: List[str] = []

    for original in raw.splitlines():
        line = normalize_text(original)
        if not line:
            if cleaned and cleaned[-1] != "":
                cleaned.append("")
            continue

        folded = to_ascii_folded(line)
        if any(folded.startswith(prefix) for prefix in NOISE_LINE_PREFIXES):
            continue
        if re.fullmatch(r"\d{1,3}", line):
            continue
        if folded.startswith("fu -"):
            continue
        if line in {"\u7b2c", "\u8ab2", "\u304b", "\u3060\u3044"}:
            continue
        if line in {"\u300c", "\u300d"}:
            continue

        cleaned.append(line)

    while cleaned and cleaned[0] == "":
        cleaned.pop(0)
    while cleaned and cleaned[-1] == "":
        cleaned.pop()

    return cleaned


def first_content_after_number(line: str) -> str:
    match = POINT_START_RE.match(line)
    if not match:
        return ""
    return normalize_text(line[match.end() :])


def is_marker_line(line: str) -> bool:
    folded = to_ascii_folded(line)
    return (
        "y nghia" in folded
        or "cach dung" in folded
        or "vi du" in folded
        or "chu y" in folded
    )


def is_prefixed_marker(line: str, marker: str) -> bool:
    stripped = line.strip()
    folded = to_ascii_folded(stripped)
    if marker not in folded:
        return False
    if ":" not in stripped and "\uff1a" not in stripped:
        return False

    if not stripped:
        return False
    bullet_chars = "*-\u2022\u25cf\u25aa\u30fb\uff0a\uf0a7\uf0b7"
    return stripped[0] in bullet_chars or folded.startswith(marker)


def is_meaning_line(line: str) -> bool:
    return is_prefixed_marker(line, "y nghia")


def is_usage_line(line: str) -> bool:
    return is_prefixed_marker(line, "cach dung")


def is_example_line(line: str) -> bool:
    return is_prefixed_marker(line, "vi du")


def is_note_line(line: str) -> bool:
    return is_prefixed_marker(line, "chu y")


def line_after_colon(line: str) -> str:
    for token in (":", "\uff1a"):
        if token in line:
            return normalize_text(line.split(token, 1)[1])
    return ""


def extract_section_lines(
    chunk_lines: List[str],
    trigger_check: Callable[[str], bool],
    stop_checks: List[Callable[[str], bool]],
) -> List[str]:
    values: List[str] = []
    reading = False

    for line in chunk_lines:
        if trigger_check(line):
            reading = True
            tail = line_after_colon(line)
            if tail:
                values.append(tail)
            continue

        if not reading:
            continue

        if any(check(line) for check in stop_checks):
            break

        if line:
            values.append(normalize_text(line))

    return [item for item in values if item]


def contains_japanese(text: str) -> bool:
    return bool(JAPANESE_RE.search(text))


def contains_kanji(text: str) -> bool:
    return bool(KANJI_RE.search(text))


def contains_latin(text: str) -> bool:
    return bool(LATIN_RE.search(text))


def is_small_kana_line(line: str) -> bool:
    compact = re.sub(
        r"[\s\u3000\-.,:;!?~\u301c/\\()\uff08\uff09\[\]{}\u3010\u3011\u300c\u300d\u300e\u300f\u30fb0-9\uff10-\uff19\u2460-\u2473]",
        "",
        line,
    )
    if not compact:
        return False
    if len(compact) > 12:
        return False
    return bool(KANA_ONLY_RE.fullmatch(compact))


def drop_ruby_lines(lines: List[str]) -> List[str]:
    kept: List[str] = []

    for idx, line in enumerate(lines):
        prev_line = lines[idx - 1] if idx > 0 else ""
        next_line = lines[idx + 1] if idx + 1 < len(lines) else ""

        if is_small_kana_line(line):
            if contains_kanji(prev_line) or contains_kanji(next_line):
                continue
            if contains_japanese(prev_line) and contains_japanese(next_line) and len(line) <= 6:
                continue

        kept.append(line)

    return kept


def starts_new_item(line: str) -> bool:
    return bool(ITEM_MARKER_RE.match(line) or POINT_START_RE.match(line))


def ends_sentence(line: str) -> bool:
    text = line.rstrip()
    return text.endswith(("\u3002", "\uff01", "\uff1f", ".", "!", "?"))


def is_japanese_char(ch: str) -> bool:
    code = ord(ch)
    return (
        0x3040 <= code <= 0x30FF
        or 0x4E00 <= code <= 0x9FFF
        or 0x3400 <= code <= 0x4DBF
    )


def join_without_space(left: str, right: str) -> bool:
    if not left or not right:
        return False

    left_last = left[-1]
    right_first = right[0]

    if is_japanese_char(left_last) or is_japanese_char(right_first):
        return True

    if left_last in "(\uff08\u300c\u300e":
        return True
    if right_first in ")\uff09\u300d\u300f\u3002\u3001,.:;!?\uff01\uff1f":
        return True

    return False


def line_kind(line: str) -> str:
    if contains_japanese(line):
        return "jp"
    if contains_latin(line):
        return "latin"
    return "other"


def merge_fragment_lines(lines: List[str]) -> List[str]:
    prepared = [normalize_text(line) for line in lines if normalize_text(line)]
    prepared = drop_ruby_lines(prepared)

    merged: List[str] = []
    buffer = ""
    buffer_kind = "other"

    for line in prepared:
        kind = line_kind(line)

        if not buffer:
            buffer = line
            buffer_kind = kind
            continue

        if starts_new_item(line):
            merged.append(buffer)
            buffer = line
            buffer_kind = kind
            continue

        should_join = False
        if buffer_kind == kind and kind in {"jp", "latin"} and not ends_sentence(buffer):
            should_join = True
        elif buffer_kind == "jp" and kind == "jp":
            should_join = True
        elif buffer.endswith((",", ":", "\uff1a", "\u3001", ";")):
            should_join = True

        if should_join:
            sep = "" if join_without_space(buffer, line) else " "
            buffer = normalize_text(f"{buffer}{sep}{line}")
            buffer_kind = line_kind(buffer)
        else:
            merged.append(buffer)
            buffer = line
            buffer_kind = kind

    if buffer:
        merged.append(buffer)

    return [line for line in merged if line]


def parse_point(lesson_number: int, order: int, chunk_lines: List[str]) -> Dict[str, object]:
    if not chunk_lines:
        return {
            "id": f"l{lesson_number}-p{order}",
            "order": order,
            "title": f"Mau {order}",
            "meaning": "",
            "usage": [],
            "examples": [],
            "notes": [],
            "content": "",
        }

    first_line = chunk_lines[0]
    title_candidate = first_content_after_number(first_line)
    intro_candidates: List[str] = []

    for line in chunk_lines:
        if not line:
            continue
        if is_marker_line(line):
            continue
        if POINT_START_RE.match(line):
            maybe = first_content_after_number(line)
            if maybe and not is_marker_line(maybe):
                intro_candidates.append(maybe)
            continue
        intro_candidates.append(line)

    if not title_candidate:
        title_candidate = intro_candidates[0] if intro_candidates else f"Mau {order}"

    meaning_lines = extract_section_lines(
        chunk_lines,
        is_meaning_line,
        [is_usage_line, is_example_line, is_note_line, is_meaning_line],
    )
    usage_lines = extract_section_lines(
        chunk_lines,
        is_usage_line,
        [is_example_line, is_note_line, is_meaning_line],
    )
    example_lines = extract_section_lines(
        chunk_lines,
        is_example_line,
        [is_note_line, is_meaning_line],
    )
    note_lines = extract_section_lines(
        chunk_lines,
        is_note_line,
        [is_example_line, is_meaning_line, is_usage_line],
    )

    usage_lines = merge_fragment_lines(usage_lines)
    example_lines = merge_fragment_lines(example_lines)
    note_lines = merge_fragment_lines(note_lines)

    meaning = normalize_text(" ".join(meaning_lines))
    content = "\n".join(line for line in chunk_lines if line).strip()

    if meaning:
        short_meaning = re.split(r"[.;!?\u3002\uff01\uff1f]", meaning, maxsplit=1)[0]
        title_candidate = normalize_text(short_meaning)[:90] or title_candidate
    else:
        title_candidate = (
            normalize_text(title_candidate).lstrip("-*\u2022 ").strip() or f"Mau {order}"
        )

    return {
        "id": f"l{lesson_number}-p{order}",
        "order": order,
        "title": title_candidate,
        "meaning": meaning,
        "usage": usage_lines,
        "examples": example_lines,
        "notes": note_lines,
        "content": normalize_text(content),
    }


def parse_points(lesson_number: int, lines: List[str]) -> List[Dict[str, object]]:
    marker_starts = [idx for idx, line in enumerate(lines) if is_meaning_line(line)]

    if marker_starts:
        points: List[Dict[str, object]] = []
        consumed_until = 0

        for order, marker_idx in enumerate(marker_starts, start=1):
            prev_marker = marker_starts[order - 2] if order > 1 else 0
            start = marker_idx
            for back in range(marker_idx, max(prev_marker - 1, 0), -1):
                if POINT_START_RE.match(lines[back]):
                    start = back
                    break
            start = max(start, consumed_until)

            end = marker_starts[order] if order < len(marker_starts) else len(lines)
            chunk = [line for line in lines[start:end] if line != ""]
            if chunk:
                points.append(parse_point(lesson_number, order, chunk))

            consumed_until = end

        return points

    starts: List[int] = []
    for idx, line in enumerate(lines):
        match = POINT_START_RE.match(line)
        if not match:
            continue
        number = int(match.group(1))
        if 1 <= number <= 30:
            starts.append(idx)

    if not starts:
        non_empty = [line for line in lines if line]
        if non_empty:
            return [parse_point(lesson_number, 1, non_empty)]
        return []

    points: List[Dict[str, object]] = []
    for order, start in enumerate(starts, start=1):
        end = starts[order] if order < len(starts) else len(lines)
        chunk = [line for line in lines[start:end] if line != ""]
        if chunk:
            points.append(parse_point(lesson_number, order, chunk))

    return points


def detect_lesson_topic(lesson_number: int, lines: List[str]) -> str:
    for line in lines:
        if not line:
            continue

        folded = to_ascii_folded(line)
        if "y nghia" in folded or "cach dung" in folded or "vi du" in folded:
            continue
        if line in {"\u7b2c", "\u8ab2", "\u304b", "\u3060\u3044"}:
            continue

        match = POINT_START_RE.match(line)
        if match:
            remain = first_content_after_number(line)
            if remain and not is_marker_line(remain):
                if re.fullmatch(r"[0-9]+\u8ab2?", remain):
                    continue
                if re.fullmatch(r"[\u3041-\u3096\u30a1-\u30ff\u30fc]+", remain):
                    continue
                if "\u8ab2" in remain and len(remain) <= 4:
                    continue
                return remain
            continue

        if re.fullmatch(r"[0-9\uff10-\uff19]+\u8ab2?", line):
            continue
        if re.fullmatch(r"[\u3041-\u3096\u30a1-\u30ff\u30fc]+", line):
            continue
        if "\u8ab2" in line and len(line) <= 6:
            continue

        if len(line) <= 100:
            return line

    return f"Bai {lesson_number}"


def build_dataset(pdf_path: Path) -> Dict[str, object]:
    reader = PdfReader(str(pdf_path))
    per_lesson: Dict[int, List[str]] = {}
    current_lesson: Optional[int] = None

    for page in reader.pages:
        raw = page.extract_text() or ""
        if not raw.strip():
            continue

        if is_cover_page(raw):
            current_lesson = None
            continue

        lesson_number = parse_lesson_number(raw)
        if lesson_number is not None:
            current_lesson = lesson_number

        if current_lesson is None:
            continue

        cleaned = clean_lines(raw)
        if not cleaned:
            continue

        per_lesson.setdefault(current_lesson, []).extend(cleaned + [""])

    lessons: List[Dict[str, object]] = []
    for lesson_number in sorted(per_lesson.keys()):
        lesson_lines = per_lesson[lesson_number]
        while lesson_lines and lesson_lines[0] == "":
            lesson_lines.pop(0)
        while lesson_lines and lesson_lines[-1] == "":
            lesson_lines.pop()

        topic = detect_lesson_topic(lesson_number, lesson_lines)
        points = parse_points(lesson_number, lesson_lines)
        level = "N5" if lesson_number <= 25 else "N4"

        lessons.append(
            {
                "id": f"lesson-{lesson_number:02d}",
                "lessonNumber": lesson_number,
                "level": level,
                "title": f"Bai {lesson_number}",
                "topic": topic,
                "pointCount": len(points),
                "points": points,
            }
        )

    return {
        "source": str(pdf_path),
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "lessonCount": len(lessons),
        "lessons": lessons,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input PDF path")
    parser.add_argument("--output", required=True, help="Output JSON path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_path.exists():
        raise FileNotFoundError(f"Input PDF not found: {input_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    dataset = build_dataset(input_path)
    output_path.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Imported {dataset['lessonCount']} lessons -> {output_path}")


if __name__ == "__main__":
    main()
