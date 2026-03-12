#!/usr/bin/env python3
"""
관광지 평가 랭킹 마크다운(RANKINGS.md) 자동 생성 스크립트.

사용법:
    python scripts/generate_rankings.py
    python scripts/generate_rankings.py --help
"""

import argparse
import json
import sys
from collections import OrderedDict
from pathlib import Path

# 프로젝트 루트 (이 스크립트가 scripts/ 안에 있다고 가정)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = PROJECT_ROOT / "data" / "scores" / "attraction_scored.json"
OUTPUT_FILE = PROJECT_ROOT / "data" / "scores" / "RANKINGS.md"
PLACES_DIR = PROJECT_ROOT / "data" / "places" / "attraction"

# 등급 정의
GRADE_INFO = OrderedDict([
    ("S", {"range": "90~100", "label": "반드시 가야 할 곳"}),
    ("A", {"range": "75~89", "label": "강력 추천"}),
    ("B", {"range": "60~74", "label": "선택적"}),
    ("C", {"range": "45~59", "label": "스킵 권장"}),
    ("D", {"range": "0~44", "label": "비추천"}),
])

# breakdown 키 → 한국어 이름 + 가중치(%) 매핑 (출력 순서 = 가중치 내림차순)
CRITERIA_DISPLAY = OrderedDict([
    ("scenery",         ("경치/포토스팟", "20%")),
    ("uniqueness",      ("유니크함", "20%")),
    ("google_rating",   ("구글 평점", "15%")),
    ("accessibility",   ("접근성", "15%")),
    ("review_count",    ("리뷰 수", "10%")),
    ("value_for_money", ("가성비", "10%")),
    ("time_efficiency", ("시간효율", "10%")),
])


def pick_shortest_reason(reason: str) -> str:
    """reason 필드에서 [A]/[B]/[C] 접두사 구문 중 가장 짧은 것 하나를 선택."""
    if not reason:
        return ""
    # [A] ... | [B] ... | [C] ... 패턴인지 확인
    if "[A]" not in reason and "[B]" not in reason and "[C]" not in reason:
        return reason.strip()
    parts = [p.strip() for p in reason.split("|")]
    # 접두사 제거 후 가장 짧은 것 선택
    cleaned = []
    for p in parts:
        text = p.strip()
        for prefix in ("[A] ", "[B] ", "[C] ", "[A]", "[B]", "[C]"):
            if text.startswith(prefix):
                text = text[len(prefix):].strip()
                break
        cleaned.append(text)
    shortest = min(cleaned, key=len)
    return shortest


def load_data() -> dict:
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_place_urls() -> dict:
    """장소 JSON에서 google_maps_url을 읽어 {id: url} 딕셔너리 반환."""
    urls = {}
    if not PLACES_DIR.exists():
        return urls
    for fp in PLACES_DIR.glob("*.json"):
        try:
            with open(fp, "r", encoding="utf-8") as f:
                place = json.load(f)
            url = place.get("google_maps_url")
            if url:
                urls[place["id"]] = url
        except (json.JSONDecodeError, KeyError):
            continue
    return urls


def group_by_grade(results: list) -> dict:
    """등급별로 그룹핑하고 점수 내림차순 정렬."""
    groups = {g: [] for g in GRADE_INFO}
    for r in results:
        grade = r["grade"]
        if grade in groups:
            groups[grade].append(r)
    for g in groups:
        groups[g].sort(key=lambda x: -x["total_score"])
    return groups


def fmt(score) -> str:
    """숫자를 소수점 1자리 문자열로."""
    if isinstance(score, int):
        return f"{score}.0"
    return f"{score:.1f}"


def generate_md(data: dict, place_urls: dict = None) -> str:
    results = data["results"]
    scored_at = data.get("scored_at", "")
    scoring_method = data.get("scoring_method", "")
    groups = group_by_grade(results)
    total_count = len(results)
    place_urls = place_urls or {}

    lines = []
    w = lines.append  # shorthand

    # ── Jekyll front matter (GitHub Pages에서 HTML 태그 보존) ──
    w("---")
    w("layout: default")
    w("---")
    w("")

    # ── 헤더 ──
    w("# 관광지 평가 랭킹")
    w("")
    w("> 등급별 표의 행을 클릭하면 상세 평가를 볼 수 있습니다.")
    w("")
    w("> 이 문서는 `scripts/generate_rankings.py`로 자동 생성됩니다.")
    w("> 원본 데이터: `data/scores/attraction_scored.json`")
    w("> 점수 수정 후 `python scripts/generate_rankings.py`를 실행하면 이 문서가 갱신됩니다.")
    w(">")
    w(f"> 최종 업데이트: {scored_at}")
    w(f"> 평가 방식: {scoring_method}")
    w("")
    w("---")
    w("")

    # ── 통계 요약 ──
    w("## 통계 요약")
    w("")
    w("| 등급 | 점수 범위 | 장소 수 | 비율 |")
    w("|------|-----------|---------|------|")
    for grade, info in GRADE_INFO.items():
        cnt = len(groups[grade])
        pct = cnt / total_count * 100 if total_count else 0
        w(f"| {grade} | {info['range']} | {cnt}곳 | {pct:.0f}% |")
    w(f"| **합계** | | **{total_count}곳** | |")
    w("")
    w("---")
    w("")

    # ── 등급별 섹션 ──
    for grade, info in GRADE_INFO.items():
        places = groups[grade]
        if not places and grade in ("D",):
            # D등급 비어있으면 간단히 표시
            w(f"## {grade}등급 — {info['label']} (0곳)")
            w("")
            w("해당 없음.")
            w("")
            w("---")
            w("")
            continue
        if not places:
            continue

        w(f"## {grade}등급 — {info['label']} ({len(places)}곳)")
        w("")

        # 요약 테이블 (HTML — 행 클릭으로 모달 팝업)
        w('<table>')
        w('<thead><tr><th>순위</th><th>장소</th><th>지역</th><th>점수</th><th>A</th><th>B</th><th>C</th></tr></thead>')
        w('<tbody>')
        for i, p in enumerate(places, 1):
            st = p["scorer_totals"]
            name = p["name_ko"]
            w(f'<tr data-place-id="{p["id"]}">'
              f'<td>{i}</td><td>{name}</td><td>{p["region"]}</td>'
              f'<td><strong>{fmt(p["total_score"])}</strong></td>'
              f'<td>{fmt(st["A"])}</td><td>{fmt(st["B"])}</td><td>{fmt(st["C"])}</td></tr>')
        w('</tbody></table>')
        w("")

        w("---")
        w("")

    # ── 지역별 요약 ──
    w("## 지역별 요약")
    w("")

    # 지역별 집계
    region_stats = {}
    for r in results:
        reg = r["region"]
        if reg not in region_stats:
            region_stats[reg] = {g: 0 for g in GRADE_INFO}
            region_stats[reg]["_best"] = (r["name_ko"], r["total_score"], r["id"])
            region_stats[reg]["_total"] = 0
        region_stats[reg][r["grade"]] += 1
        region_stats[reg]["_total"] += 1
        if r["total_score"] > region_stats[reg]["_best"][1]:
            region_stats[reg]["_best"] = (r["name_ko"], r["total_score"], r["id"])

    # 정렬: S등급 많은 순 → A등급 많은 순 → 합계 많은 순
    sorted_regions = sorted(
        region_stats.items(),
        key=lambda x: (-x[1]["S"], -x[1]["A"], -x[1]["_total"]),
    )

    w("| 지역 | S | A | B | C | D | 합계 | 최고 장소 (점수) |")
    w("|------|---|---|---|---|---|------|----------------|")
    for reg, stats in sorted_regions:
        best_name, best_score, best_id = stats["_best"]
        url = place_urls.get(best_id)
        best_linked = f"[{best_name}]({url})" if url else best_name
        w(f"| {reg} | {stats['S']} | {stats['A']} | {stats['B']} | {stats['C']} | {stats['D']} | {stats['_total']} | {best_linked} ({fmt(best_score)}) |")
    w("")

    # ── 모달용 JSON 데이터 + JS 삽입 ──
    w("")

    # 장소 데이터를 JSON으로 직렬화
    place_map = {}
    for r in results:
        place_map[r["id"]] = {
            "name_ko": r["name_ko"],
            "region": r["region"],
            "total_score": r["total_score"],
            "grade": r["grade"],
            "scorer_totals": r["scorer_totals"],
            "breakdown": r["breakdown"],
            "google_maps_url": place_urls.get(r["id"], ""),
        }

    json_str = json.dumps(place_map, ensure_ascii=False)
    w(f'<script>window.__PLACE_DATA__ = {json_str};</script>')
    w('<script src="{{ site.baseurl }}/assets/js/modal.js"></script>')
    w("")

    return "\n".join(lines)


def print_summary(data: dict):
    """터미널에 통계 요약 출력."""
    results = data["results"]
    groups = group_by_grade(results)
    total = len(results)

    print(f"\n{'='*50}")
    print(f"  관광지 평가 랭킹 생성 완료")
    print(f"{'='*50}")
    print(f"  총 {total}곳")
    for grade, info in GRADE_INFO.items():
        cnt = len(groups[grade])
        pct = cnt / total * 100 if total else 0
        print(f"  {grade}등급 ({info['range']}): {cnt}곳 ({pct:.0f}%)")
    print(f"{'='*50}")
    print(f"  출력 파일: {OUTPUT_FILE}")
    print(f"{'='*50}\n")


def main():
    parser = argparse.ArgumentParser(
        description="관광지 평가 데이터(attraction_scored.json)를 읽어 RANKINGS.md를 자동 생성합니다.",
    )
    parser.add_argument(
        "-i", "--input",
        default=str(INPUT_FILE),
        help=f"입력 JSON 파일 경로 (기본: {INPUT_FILE.relative_to(PROJECT_ROOT)})",
    )
    parser.add_argument(
        "-o", "--output",
        default=str(OUTPUT_FILE),
        help=f"출력 마크다운 파일 경로 (기본: {OUTPUT_FILE.relative_to(PROJECT_ROOT)})",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"오류: 입력 파일을 찾을 수 없습니다: {input_path}", file=sys.stderr)
        sys.exit(1)

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    place_urls = load_place_urls()
    md = generate_md(data, place_urls)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(md)

    print_summary(data)


if __name__ == "__main__":
    main()
