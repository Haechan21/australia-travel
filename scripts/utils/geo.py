"""좌표/거리 계산 및 클러스터링 유틸리티."""

from math import radians, cos, sin, asin, sqrt


def haversine(coord1: tuple[float, float], coord2: tuple[float, float]) -> float:
    """두 좌표 간 거리(km)를 계산한다.

    Args:
        coord1: (lng, lat) 형식
        coord2: (lng, lat) 형식

    Returns:
        거리 (km)
    """
    lng1, lat1 = coord1
    lng2, lat2 = coord2
    lat1, lat2, lng1, lng2 = map(radians, [lat1, lat2, lng1, lng2])

    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def find_duplicates(
    places: list[dict], radius_m: float = 100
) -> list[tuple[dict, dict, float]]:
    """반경 내 중복 후보를 탐지한다.

    Args:
        places: [{"coordinates": [lng, lat], "address": str, ...}, ...]
        radius_m: 중복 판정 반경 (미터)

    Returns:
        [(place_a, place_b, distance_m), ...]
    """
    duplicates = []
    radius_km = radius_m / 1000
    for i, a in enumerate(places):
        for b in places[i + 1 :]:
            dist = haversine(a["coordinates"], b["coordinates"])
            if dist <= radius_km:
                duplicates.append((a, b, dist * 1000))
    return duplicates


def assign_to_regions(
    places: list[dict], known_regions: list[dict]
) -> list[dict]:
    """각 장소를 가장 가까운 알려진 지역에 할당한다.

    Args:
        places: [{"coordinates": [lng, lat], ...}, ...]
        known_regions: [{"name_ko": str, "center": [lng, lat], "match_radius_km": float}, ...]

    Returns:
        [{"name_ko": str, "center": [lng, lat], "radius_km": float, "members": [place, ...]}, ...]
    """
    if not places:
        return []

    region_members: dict[str, list[dict]] = {}
    unassigned = []

    for place in places:
        best_region = None
        best_dist = float("inf")

        for region in known_regions:
            dist = haversine(place["coordinates"], region["center"])
            if dist < region["match_radius_km"] and dist < best_dist:
                best_region = region["name_ko"]
                best_dist = dist

        if best_region:
            region_members.setdefault(best_region, []).append(place)
        else:
            unassigned.append(place)

    # 결과 조립
    results = []
    for region in known_regions:
        name = region["name_ko"]
        members = region_members.get(name, [])
        if not members:
            continue

        # 실제 멤버 기반 중심 & 반경 계산
        avg_lng = sum(m["coordinates"][0] for m in members) / len(members)
        avg_lat = sum(m["coordinates"][1] for m in members) / len(members)
        center = [avg_lng, avg_lat]
        max_dist = max(haversine(center, m["coordinates"]) for m in members)

        results.append(
            {
                "name_ko": name,
                "center": center,
                "radius_km": round(max_dist, 1),
                "members": members,
            }
        )

    if unassigned:
        avg_lng = sum(m["coordinates"][0] for m in unassigned) / len(unassigned)
        avg_lat = sum(m["coordinates"][1] for m in unassigned) / len(unassigned)
        results.append(
            {
                "name_ko": "기타",
                "center": [avg_lng, avg_lat],
                "radius_km": 0,
                "members": unassigned,
            }
        )

    return results
