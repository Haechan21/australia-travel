#!/usr/bin/env python3
"""GoogleMaps GeoJSON 전처리: 변경 감지 + 좌표 기반 클러스터링 + 중복 탐지.

사용법:
    python scripts/parse_googlemaps.py              # 전체 처리 + 리포트
    python scripts/parse_googlemaps.py --diff-only  # 변경 감지 리포트만 출력 (파일 생성 안 함)
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# 프로젝트 루트 기준으로 import
sys.path.insert(0, str(Path(__file__).resolve().parent))
from utils.geo import assign_to_regions, find_duplicates

# ── 경로 설정 ──

PROJECT_ROOT = Path(__file__).resolve().parent.parent
GOOGLEMAPS_DIR = PROJECT_ROOT / "GoogleMaps"
DATA_DIR = PROJECT_ROOT / "data"
PLACES_DIR = DATA_DIR / "places"
REGIONS_FILE = DATA_DIR / "regions.json"

# ── 카테고리 매핑 ──

CATEGORY_MAP = {
    "호주여행": "attraction",
    "호주음식": "restaurant",
    "호주숙소": "accommodation",
}

# ── 알려진 지역명 (클러스터 라벨링용) ──

KNOWN_REGIONS = [
    {"name_ko": "시드니", "center": [151.2093, -33.8688], "match_radius_km": 45},
    {"name_ko": "센트럴코스트", "center": [151.42, -33.35], "match_radius_km": 35},
    {"name_ko": "뉴캐슬/포트스테판스", "center": [151.95, -32.80], "match_radius_km": 55},
    {"name_ko": "포스터/해링턴", "center": [152.50, -32.00], "match_radius_km": 45},
    {"name_ko": "포트맥쿼리", "center": [152.91, -31.43], "match_radius_km": 40},
    {"name_ko": "사우스웨스트록스/켐시", "center": [153.05, -30.89], "match_radius_km": 30},
    {"name_ko": "콥스하버", "center": [153.11, -30.30], "match_radius_km": 40},
    {"name_ko": "야마/그래프턴", "center": [153.30, -29.65], "match_radius_km": 40},
    {"name_ko": "바이런베이", "center": [153.60, -28.65], "match_radius_km": 35},
    {"name_ko": "골드코스트", "center": [153.40, -28.00], "match_radius_km": 35},
    {"name_ko": "블루마운틴", "center": [150.31, -33.72], "match_radius_km": 40},
]


def coord_hash(lng: float, lat: float) -> str:
    """좌표 기반 해시 ID 생성 (8자)."""
    raw = f"{lng:.6f},{lat:.6f}"
    return hashlib.sha256(raw.encode()).hexdigest()[:8]


def load_export(filepath: Path) -> list[dict]:
    """GeoJSON 파일을 로드하여 정규화된 장소 리스트로 반환."""
    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    places = []
    for feature in data.get("features", []):
        coords = feature.get("geometry", {}).get("coordinates", [None, None])
        props = feature.get("properties", {})

        if coords[0] is None or coords[1] is None:
            continue

        category = CATEGORY_MAP.get(props.get("name", ""), "unknown")
        address_raw = props.get("address", "")

        places.append(
            {
                "coordinates": [coords[0], coords[1]],  # [lng, lat]
                "address_raw": address_raw,
                "category": category,
                "source_file": filepath.name,
            }
        )
    return places


def load_all_exports() -> tuple[list[dict], list[str]]:
    """GoogleMaps/ 내 최신 JSON을 기준으로 장소 리스트를 반환한다.

    최신 내보내기 파일이 전체 리스트(authoritative source)이다.
    여러 파일이 있으면 최신 파일만 사용하고, 이전 파일은 diff 비교용으로만 활용한다.

    Returns:
        (장소 리스트, 로드한 파일명 리스트)
    """
    json_files = sorted(GOOGLEMAPS_DIR.glob("*.json"))
    if not json_files:
        print("⚠ GoogleMaps/ 디렉토리에 JSON 파일이 없습니다.")
        return [], []

    filenames = [f.name for f in json_files]

    # 최신 파일을 기준으로 사용
    latest = json_files[-1]
    places = load_export(latest)

    # 좌표 기준 중복 제거 (같은 파일 내 중복 방지)
    seen: dict[str, dict] = {}
    for place in places:
        key = coord_hash(*place["coordinates"])
        seen[key] = place

    return list(seen.values()), filenames


def diff_exports(old_file: Path, new_file: Path) -> dict:
    """두 GeoJSON 파일 간 변경 사항을 감지한다.

    Returns:
        {"added": [...], "removed": [...], "unchanged": int}
    """
    old_places = load_export(old_file)
    new_places = load_export(new_file)

    old_keys = {coord_hash(*p["coordinates"]): p for p in old_places}
    new_keys = {coord_hash(*p["coordinates"]): p for p in new_places}

    added = [new_keys[k] for k in new_keys if k not in old_keys]
    removed = [old_keys[k] for k in old_keys if k not in new_keys]
    unchanged = len(set(old_keys) & set(new_keys))

    return {"added": added, "removed": removed, "unchanged": unchanged}


def get_region_name(cluster: dict) -> str:
    """클러스터의 지역명을 반환."""
    return cluster.get("name_ko", "기타")


def create_place_stub(place: dict) -> dict:
    """SPEC.md 스키마에 맞는 빈 장소 JSON을 생성한다.

    name, name_ko는 빈 문자열 — Phase 2 웹검색에서 채운다.
    """
    lng, lat = place["coordinates"]
    place_id = coord_hash(lng, lat)

    return {
        "id": place_id,
        "name": "",
        "name_ko": "",
        "category": place["category"],
        "source_file": place["source_file"],
        "address_raw": place["address_raw"],
        "location": {
            "coordinates": {"lng": lng, "lat": lat},
            "address": "",
            "region": "",
        },
        "collected_data": None,
        "metadata": {
            "estimated_visit_duration_min": None,
            "cost_aud": None,
            "best_time": None,
            "weather_dependent": None,
            "reservation_required": None,
        },
    }


def write_place_stubs(places: list[dict]) -> int:
    """장소별 stub JSON 파일을 생성한다. 이미 존재하면 건너뛴다.

    Returns:
        새로 생성된 파일 수
    """
    created = 0
    for place in places:
        stub = create_place_stub(place)
        category_dir = PLACES_DIR / stub["category"]
        category_dir.mkdir(parents=True, exist_ok=True)
        filepath = category_dir / f"{stub['id']}.json"

        if filepath.exists():
            continue

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(stub, f, ensure_ascii=False, indent=2)
        created += 1

    return created


def cleanup_removed_places(active_ids: set[str]) -> list[dict]:
    """GoogleMaps에서 삭제된 장소의 파일을 정리한다.

    collected_data가 채워진 파일은 삭제하지 않고 경고만 표시한다.

    Returns:
        [{"id": str, "path": str, "address_raw": str, "has_data": bool, "action": "삭제"|"보존"}, ...]
    """
    removed = []
    if not PLACES_DIR.exists():
        return removed
    for category_dir in PLACES_DIR.iterdir():
        if not category_dir.is_dir():
            continue
        for filepath in category_dir.glob("*.json"):
            place_id = filepath.stem
            if place_id in active_ids:
                continue

            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)

            has_data = data.get("collected_data") is not None
            if has_data:
                # Phase 2 데이터가 채워진 파일은 보존 (수동 확인 필요)
                removed.append({
                    "id": place_id,
                    "path": str(filepath.relative_to(PROJECT_ROOT)),
                    "address_raw": data.get("address_raw", ""),
                    "has_data": True,
                    "action": "보존",
                })
            else:
                # 빈 stub만 있으면 삭제
                filepath.unlink()
                removed.append({
                    "id": place_id,
                    "path": str(filepath.relative_to(PROJECT_ROOT)),
                    "address_raw": data.get("address_raw", ""),
                    "has_data": False,
                    "action": "삭제",
                })

    return removed


def write_regions(clusters: list[dict]) -> None:
    """data/regions.json을 생성한다."""
    regions = []
    for cluster in clusters:
        name_ko = get_region_name(cluster)
        place_ids = [
            coord_hash(*m["coordinates"]) for m in cluster["members"]
        ]
        regions.append(
            {
                "id": name_ko.replace("/", "-"),
                "name_ko": name_ko,
                "center": {
                    "lng": round(cluster["center"][0], 4),
                    "lat": round(cluster["center"][1], 4),
                },
                "radius_km": cluster["radius_km"],
                "place_count": len(cluster["members"]),
                "place_ids": place_ids,
            }
        )

    # 장소 수 내림차순 정렬
    regions.sort(key=lambda r: r["place_count"], reverse=True)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(REGIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(
            {"generated_at": datetime.now(timezone.utc).isoformat(), "regions": regions},
            f,
            ensure_ascii=False,
            indent=2,
        )


def update_place_regions(clusters: list[dict]) -> None:
    """각 장소 JSON의 location.region 필드를 업데이트한다."""
    for cluster in clusters:
        region_name = get_region_name(cluster)
        for member in cluster["members"]:
            place_id = coord_hash(*member["coordinates"])
            category = member["category"]
            filepath = PLACES_DIR / category / f"{place_id}.json"
            if not filepath.exists():
                continue
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
            data["location"]["region"] = region_name
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)


def print_report(
    places: list[dict],
    filenames: list[str],
    clusters: list[dict],
    duplicates: list[tuple],
    diff: dict | None = None,
    created_count: int = 0,
    cleaned: list[dict] | None = None,
) -> None:
    """터미널에 변경 감지 리포트를 출력한다."""
    print()
    print("=" * 60)
    print("  GoogleMaps 전처리 리포트")
    print("=" * 60)
    print()

    # 소스 파일
    print(f"📁 소스 파일: {', '.join(filenames)}")
    print(f"📍 전체 장소: {len(places)}개")
    print()

    # diff 결과 (파일이 2개 이상일 때)
    if diff:
        added = diff["added"]
        removed = diff["removed"]
        print(f"[신규 +{len(added)}]")
        if added:
            for p in added:
                lng, lat = p["coordinates"]
                print(f"  ({lat:.4f}, {lng:.4f}) → {p['address_raw']}")
                print(f"    ← Phase 2 웹검색 필요")
        else:
            print("  (없음)")
        print()

        print(f"[삭제 -{len(removed)}]")
        if removed:
            for p in removed:
                lng, lat = p["coordinates"]
                print(f"  ({lat:.4f}, {lng:.4f}) → {p['address_raw']}")
        else:
            print("  (없음)")
        print()

    # 파일 정리 결과
    if cleaned:
        deleted = [c for c in cleaned if c["action"] == "삭제"]
        kept = [c for c in cleaned if c["action"] == "보존"]
        print(f"[파일 정리]")
        if deleted:
            for c in deleted:
                print(f"  🗑 삭제: {c['path']} ({c['address_raw'][:40]}...)")
        if kept:
            for c in kept:
                print(f"  ⚠ 보존 (데이터 있음): {c['path']} ({c['address_raw'][:40]}...)")
                print(f"    → collected_data가 채워져 있어 수동 확인 필요")
        if not deleted and not kept:
            print("  (정리할 파일 없음)")
        print()

    # 중복 의심
    print(f"[중복 의심 {len(duplicates)}건]")
    if duplicates:
        for i, (a, b, dist_m) in enumerate(duplicates, 1):
            print(f"  #{i}: 거리 {dist_m:.0f}m")
            print(f"    A: {a['address_raw']}")
            print(f"    B: {b['address_raw']}")
    else:
        print("  (없음)")
    print()

    # 지역 클러스터
    print("[지역 클러스터 요약]")
    for cluster in clusters:
        name = get_region_name(cluster)
        print(f"  {name}: {len(cluster['members'])}개")
    print()

    # 파일 생성 결과
    if created_count > 0:
        print(f"✅ data/places/ 에 {created_count}개 stub JSON 생성")
    else:
        print("ℹ️  새로 생성할 파일 없음 (이미 존재)")
    print()


def main():
    diff_only = "--diff-only" in sys.argv

    # 1. 전체 로드 & 병합
    places, filenames = load_all_exports()
    if not places:
        return

    # 2. 변경 감지 (파일이 2개 이상일 때)
    diff = None
    json_files = sorted(GOOGLEMAPS_DIR.glob("*.json"))
    if len(json_files) >= 2:
        diff = diff_exports(json_files[-2], json_files[-1])

    # 3. 지역 할당 & 중복 탐지
    clusters = assign_to_regions(places, KNOWN_REGIONS)
    duplicates = find_duplicates(places, radius_m=100)

    if diff_only:
        print_report(places, filenames, clusters, duplicates, diff)
        return

    # 4. stub 파일 생성
    created_count = write_place_stubs(places)

    # 5. 삭제된 장소 파일 정리
    active_ids = {coord_hash(*p["coordinates"]) for p in places}
    cleaned = cleanup_removed_places(active_ids)

    # 6. regions.json 생성 (삭제된 장소 제외, 현재 활성 장소만)
    write_regions(clusters)

    # 7. 장소별 region 업데이트
    update_place_regions(clusters)

    # 8. 리포트 출력
    print_report(places, filenames, clusters, duplicates, diff, created_count, cleaned)


if __name__ == "__main__":
    main()
