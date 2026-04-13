#!/usr/bin/env python3
"""Import grammar data from cropped images into the app JSON dataset.

This script is designed for image-based PDFs where normal text extraction fails.

Typical flow:
1) Screenshot/crop grammar blocks into image files.
2) Put images in folders like:
   - input/lesson-01/*.png
   - input/lesson-02/*.png
3) Run this script to OCR and generate/merge JSON.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
LESSON_PATTERN = re.compile(r"(?:lesson|bai|b|l)[\s_-]*0*([1-9][0-9]?)", re.IGNORECASE)
JP_LESSON_PATTERN = re.compile(r"第\s*([0-9]{1,2})\s*課")
LATIN_RE = re.compile(r"[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]")
NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


@dataclass
class ImageEntry:
  lesson_number: int
  source_path: Path
  image_url: str
  ocr_text: str


def normalize_space(value: str) -> str:
  return re.sub(r"\s+", " ", value.replace("\u3000", " ")).strip()


def slugify(value: str) -> str:
  lowered = unicodedata.normalize("NFD", value.lower())
  ascii_text = "".join(ch for ch in lowered if unicodedata.category(ch) != "Mn")
  slug = NON_ALNUM_RE.sub("-", ascii_text).strip("-")
  return slug or "item"


def detect_lesson_number(path: Path) -> int:
  probes = [path.stem] + [part for part in path.parts[-5:]]
  for probe in probes:
    match = LESSON_PATTERN.search(probe)
    if match:
      return int(match.group(1))
    match = JP_LESSON_PATTERN.search(probe)
    if match:
      return int(match.group(1))
  return 1


def get_image_files(input_dir: Path) -> List[Path]:
  files = [p for p in input_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
  files.sort(key=lambda p: (detect_lesson_number(p), p.parent.as_posix().lower(), p.name.lower()))
  return files


def read_sidecar_text(image_path: Path) -> str:
  txt_path = image_path.with_suffix(".txt")
  if txt_path.exists():
    return txt_path.read_text(encoding="utf-8", errors="ignore")
  return ""


def run_tesseract(image_path: Path, lang: str) -> str:
  cmd = ["tesseract", str(image_path), "stdout", "-l", lang, "--psm", "6"]
  result = subprocess.run(
    cmd,
    capture_output=True,
    text=True,
    encoding="utf-8",
    errors="ignore",
    check=False,
  )
  if result.returncode != 0:
    stderr = normalize_space(result.stderr or "")
    raise RuntimeError(stderr or "Unknown OCR error")
  return result.stdout


def safe_copy_image(
  source: Path,
  public_root: Path,
  dataset_slug: str,
  lesson_number: int,
  used_names: Dict[Tuple[int, str], int],
) -> str:
  lesson_key = (lesson_number, source.suffix.lower())
  current_count = used_names.get(lesson_key, 0) + 1
  used_names[lesson_key] = current_count

  stem = slugify(source.stem)
  ext = source.suffix.lower()
  if current_count == 1:
    file_name = f"{stem}{ext}"
  else:
    file_name = f"{stem}-{current_count}{ext}"

  rel_path = Path("grammar-images") / dataset_slug / f"lesson-{lesson_number:02d}" / file_name
  abs_path = public_root / rel_path
  abs_path.parent.mkdir(parents=True, exist_ok=True)
  shutil.copy2(source, abs_path)
  return f"/{rel_path.as_posix()}"


def non_empty_lines(text: str) -> List[str]:
  lines = [normalize_space(line) for line in text.splitlines()]
  return [line for line in lines if line]


def pick_title(lines: List[str], source_path: Path, order: int) -> str:
  for line in lines:
    if 2 <= len(line) <= 90:
      return line
  fallback = normalize_space(source_path.stem.replace("_", " ").replace("-", " "))
  if fallback:
    return fallback[:90]
  return f"Mau {order}"


def pick_meaning(lines: List[str], title: str) -> str:
  for line in lines[1:8]:
    if line == title:
      continue
    if len(line) > 150:
      continue
    if LATIN_RE.search(line):
      return line
  return ""


def pick_topic(points: List[Dict[str, Any]], lesson_number: int) -> str:
  if not points:
    return f"Bai {lesson_number}"
  first_title = normalize_space(str(points[0].get("title", "")))
  if first_title:
    return first_title[:90]
  return f"Bai {lesson_number}"


def build_lessons(entries: Iterable[ImageEntry], level: str) -> List[Dict[str, Any]]:
  grouped: Dict[int, List[ImageEntry]] = defaultdict(list)
  for entry in entries:
    grouped[entry.lesson_number].append(entry)

  lessons: List[Dict[str, Any]] = []
  for lesson_number in sorted(grouped.keys()):
    points: List[Dict[str, Any]] = []
    for order, entry in enumerate(grouped[lesson_number], start=1):
      lines = non_empty_lines(entry.ocr_text)
      title = pick_title(lines, entry.source_path, order)
      meaning = pick_meaning(lines, title)
      content = "\n".join(lines) if lines else ""

      points.append(
        {
          "id": f"l{lesson_number}-p{order}",
          "order": order,
          "title": title,
          "meaning": meaning,
          "usage": [],
          "examples": [],
          "notes": [],
          "content": content,
          "image": entry.image_url,
        }
      )

    lessons.append(
      {
        "id": f"lesson-{lesson_number:02d}",
        "lessonNumber": lesson_number,
        "level": level,
        "title": f"Bai {lesson_number}",
        "topic": pick_topic(points, lesson_number),
        "pointCount": len(points),
        "points": points,
      }
    )

  return lessons


def to_int(value: Any, default: int = 0) -> int:
  try:
    return int(value)
  except (TypeError, ValueError):
    return default


def level_rank(level: str) -> int:
  order = {"N5": 0, "N4": 1, "N3": 2, "N2": 3, "N1": 4}
  return order.get(level, 99)


def merge_lessons(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
  incoming_keys = {
    (str(lesson.get("level", "")), to_int(lesson.get("lessonNumber")))
    for lesson in incoming
  }
  kept = [
    lesson
    for lesson in existing
    if (str(lesson.get("level", "")), to_int(lesson.get("lessonNumber"))) not in incoming_keys
  ]
  merged = kept + incoming
  merged.sort(key=lambda lesson: (level_rank(str(lesson.get("level", ""))), to_int(lesson.get("lessonNumber"))))
  return merged


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--input", required=True, help="Input folder containing cropped images")
  parser.add_argument(
    "--output",
    default="data/grammar/minna-n4n5.json",
    help="Output JSON path (default: data/grammar/minna-n4n5.json)",
  )
  parser.add_argument(
    "--public-root",
    default="public",
    help="Public root to store copied images (default: public)",
  )
  parser.add_argument(
    "--dataset-slug",
    default="grammar-upload",
    help="Slug folder under /public/grammar-images",
  )
  parser.add_argument("--level", choices=["N5", "N4"], default="N5")
  parser.add_argument(
    "--lang",
    default="jpn+vie",
    help="Tesseract languages, example: jpn+vie or jpn+eng",
  )
  parser.add_argument(
    "--replace",
    action="store_true",
    help="Replace output with only new lessons (skip merge)",
  )
  return parser.parse_args()


def main() -> None:
  args = parse_args()

  input_dir = Path(args.input).expanduser().resolve()
  output_path = Path(args.output).expanduser().resolve()
  public_root = Path(args.public_root).expanduser().resolve()
  dataset_slug = slugify(args.dataset_slug)

  if not input_dir.exists():
    raise FileNotFoundError(f"Input folder not found: {input_dir}")

  images = get_image_files(input_dir)
  if not images:
    raise RuntimeError(f"No images found in: {input_dir}")

  tesseract_available = shutil.which("tesseract") is not None
  if not tesseract_available:
    print("Warning: 'tesseract' not found. Script will use only sidecar .txt files.")

  entries: List[ImageEntry] = []
  used_names: Dict[Tuple[int, str], int] = {}
  empty_ocr_count = 0

  for image_path in images:
    lesson_number = detect_lesson_number(image_path)
    image_url = safe_copy_image(image_path, public_root, dataset_slug, lesson_number, used_names)

    text = read_sidecar_text(image_path)
    if not text and tesseract_available:
      try:
        text = run_tesseract(image_path, args.lang)
      except Exception as error:  # pylint: disable=broad-exception-caught
        print(f"OCR failed for {image_path.name}: {error}")
        text = ""

    if not normalize_space(text):
      empty_ocr_count += 1

    entries.append(
      ImageEntry(
        lesson_number=lesson_number,
        source_path=image_path,
        image_url=image_url,
        ocr_text=text,
      )
    )

  new_lessons = build_lessons(entries, args.level)

  output_path.parent.mkdir(parents=True, exist_ok=True)

  existing_lessons: List[Dict[str, Any]] = []
  if output_path.exists() and not args.replace:
    try:
      existing_data = json.loads(output_path.read_text(encoding="utf-8"))
      raw_lessons = existing_data.get("lessons", [])
      if isinstance(raw_lessons, list):
        existing_lessons = [lesson for lesson in raw_lessons if isinstance(lesson, dict)]
    except Exception:  # pylint: disable=broad-exception-caught
      existing_lessons = []

  lessons = new_lessons if args.replace else merge_lessons(existing_lessons, new_lessons)

  dataset = {
    "source": f"image-ocr:{input_dir}",
    "importedAt": datetime.now(timezone.utc).isoformat(),
    "lessonCount": len(lessons),
    "lessons": lessons,
  }

  output_path.write_text(
    json.dumps(dataset, ensure_ascii=False, indent=2),
    encoding="utf-8",
  )

  print(f"Imported {len(images)} images -> {len(new_lessons)} lessons ({args.level})")
  print(f"Output JSON: {output_path}")
  print(f"Copied images to: {public_root / 'grammar-images' / dataset_slug}")
  if empty_ocr_count > 0:
    print(f"Note: {empty_ocr_count} images had empty OCR text. They still keep image preview.")


if __name__ == "__main__":
  main()
