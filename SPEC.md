# 호주여행 플래너 - 프로젝트 SPEC

> **이 문서는**: 코드베이스의 기술 설계서. 데이터 스키마, 워크플로우 구조, 평가 기준 등 **구현에 필요한 모든 기술적 명세**를 정의한다.
> 여행 일정, 항공, 렌터카, 제약 조건 등 **여행 자체에 대한 정보**는 [`META.md`](./META.md)를 참조.

## 1. 프로젝트 목적

구글맵에서 내보낸 여행 후보지 데이터를 기반으로:

1. 각 장소의 리뷰와 상세 정보를 **조사·수집**한다.
2. 커스텀 기준으로 **평가/등급**을 부여한다.
3. 등급과 지리 정보를 기반으로 **최적 여행 일정**을 생성한다.

핵심 가치: 수백 개의 후보지를 사람이 일일이 비교하는 대신, AI가 정보를 모아 판단 근거를 제공하고, 최종 결정은 사람이 한다.

---

## 2. 시스템 아키텍처

### 2.1 전체 흐름

```
[입력]                    [처리]                      [출력]
GoogleMaps/*.json ──→ Phase 1: 전처리 ──→ data/places/
                      Phase 2: 정보 수집 ──→ data/places/ (enriched)
                                            research/claude-research/
                      Phase 3: 평가/등급 ──→ data/scores/
                      Phase 4: 일정 생성 ──→ ITINERARY.md (확정 일정)
                      Phase 5: 일정 리뷰 ──→ ITINERARY.md (리뷰 요약 + 상세)
                                            research/ai-review/
```

각 Phase는 개념적 단계 구분이다. 실제 작업은 대부분 **Claude Code와의 대화**로 수행되며, 각 Phase를 반드시 순서대로 거칠 필요는 없다. 예를 들어, Phase 2(정보 수집)와 Phase 4(일정 생성)를 대화 중에 동시에 진행할 수 있다.

### 2.2 실행 방식: 대화형 주도 + 선택적 자동화

이 프로젝트는 **Claude Code 대화형 작업이 주된 실행 방식**이다. Python 스크립트는 반복적 연산이 필요할 때 선택적으로 활용한다.

| 방식 | 용도 | 장점 |
|------|------|------|
| **Claude Code 대화형** (주) | 정보 수집, 리뷰 분석, 평가 판단, 일정 생성/조정, 리뷰 | 유연성, 맥락 이해, 즉시 반영 |
| **Python 스크립트** (보조) | 변경 감지, 좌표 계산, 지역 할당, 중복 탐지 등 반복 가능한 연산 | 재현성, 자동화 |

일정 생성(Phase 4)은 사용자와 Claude Code의 대화를 통해 이루어졌으며, 결과는 `ITINERARY.md`에 직접 기록된다. 전처리(Phase 1)와 같은 반복 연산은 스크립트로 자동화할 수 있다.

---

## 3. 데이터 설계

### 3.1 입력: GoogleMaps/

구글맵 "내 장소 목록"에서 내보낸 GeoJSON 파일. **날짜 기반 파일명**으로 단일 파일 관리한다.

```
GoogleMaps/
├── 2026-03-11.json       # 내보내기 날짜 기준
├── 2026-03-20.json       # 이후 추가 내보내기
└── ...
```

하나의 JSON 파일 안에 관광지, 음식점, 숙소 등 **모든 카테고리가 혼합**되어 있다. 카테고리 구분은 `properties.name` 필드로 한다.

**GeoJSON 원본 구조**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [lng, lat] },
      "properties": {
        "name": "(카테고리를 나타내는 리스트명)",
        "address": "(장소명 + 상세주소가 혼합된 문자열)"
      }
    }
  ]
}
```

**`name` 필드 → 카테고리 매핑 규칙**:

| `properties.name` 값 | 카테고리 | 설명 |
|----------------------|----------|------|
| `"호주여행"` | `attraction` | 관광지, 여행지 |
| `"호주음식"` | `restaurant` | 음식점, 카페 |
| `"호주숙소"` | `accommodation` | 숙소 |

> **현재 상태**: GoogleMaps 데이터에는 `"호주여행"` (관광지, 84개 항목)만 존재한다. `"호주음식"`, `"호주숙소"` 데이터는 향후 추가 예정이며, 관광지도 계속 늘어날 수 있다.

> 새 카테고리가 필요하면 구글맵에서 새 리스트명으로 저장하고, 매핑 규칙을 추가한다.

> **설계 고려사항**: `name` 필드는 장소명이 아닌 카테고리 식별자다. 실제 장소명은 Phase 2에서 좌표 기반 웹검색으로 확인한다.

### 3.2 가공 데이터: data/

> **현재 상태**: `data/places/attraction/`에 84개 JSON이 생성되어 있다 (좌표, address 원문, 지역 할당 완료). Phase 2 완료로 `name`, `name_ko`, `collected_data`가 모두 채워진 상태.

#### 장소 정보 (`data/places/{category}/{id}.json`)

전처리 후 생성되는 장소별 단일 파일. 수집 단계를 거치며 점진적으로 필드가 채워진다.

```json
{
  "id": "string (좌표 해시 8자, Phase 2 이후 slug로 교체 가능)",
  "name": "string (영문 또는 현지어, Phase 2에서 채움)",
  "name_ko": "string (한국어, Phase 2에서 채움)",
  "category": "attraction | restaurant | accommodation",
  "source_file": "2026-03-11.json",
  "address_raw": "string (GoogleMaps address 필드 원문 보존)",

  "location": {
    "coordinates": { "lng": 0.0, "lat": 0.0 },
    "address": "string (Phase 2에서 정리된 주소)",
    "region": "string (좌표 기반 지역 할당)"
  },

  "collected_data": {
    "rating": null,
    "total_reviews": null,
    "price_level": null,
    "opening_hours": null,
    "review_summary": {
      "same_month_last_year": {
        "period": null,
        "count": 0,
        "positive": [],
        "negative": [],
        "seasonal_notes": null
      },
      "recent_6_months": {
        "period": null,
        "count": 0,
        "positive": [],
        "negative": [],
        "status_notes": null
      },
      "tips": []
    },
    "collected_at": null
  },

  "metadata": {
    "estimated_visit_duration_min": null,
    "cost_aud": null,
    "best_time": null,
    "weather_dependent": null,
    "reservation_required": null
  }
}
```

**설계 원칙**:
- `collected_data`가 `null`이면 아직 수집되지 않은 장소 (Phase 2 미완료)
- `collected_at` 타임스탬프로 데이터 신선도 판단. 수집 후 일정 기간 경과 시 재수집 가능
- `source_file` 필드로 데이터 원본 파일을 추적

#### 평가 결과 (`data/scores/{category}_scored.json`)

카테고리별 전체 장소의 점수와 등급을 담은 단일 파일.

```json
{
  "category": "attraction",
  "scoring_criteria": "config에 정의된 기준 버전 참조",
  "scored_at": "ISO8601",
  "results": [
    {
      "id": "string",
      "name_ko": "string",
      "region": "string",
      "total_score": 82,
      "grade": "A",
      "breakdown": {
        "criteria_1": { "score": 9, "max": 10, "reason": "string" },
        "criteria_2": { "score": 7, "max": 10, "reason": "string" }
      }
    }
  ]
}
```

**설계 원칙**:
- `breakdown`에 항목별 점수와 **판단 근거(reason)**를 반드시 포함. 블랙박스 평가를 방지한다.
- 평가 기준이 변경되면 전체 재평가. `scoring_criteria` 필드로 어떤 기준이 적용되었는지 추적.

#### 지역 분류 (`data/regions.json`)

좌표 기반 지역 할당 결과. 단일 파일로 관리.

```json
{
  "generated_at": "ISO8601",
  "regions": [
    {
      "id": "string (slugified)",
      "name_ko": "string",
      "center": { "lng": 0.0, "lat": 0.0 },
      "radius_km": 0,
      "place_count": 0,
      "place_ids": []
    }
  ]
}
```

---

## 4. Phase별 상세 설계

### Phase 1: 전처리 (`scripts/parse_googlemaps.py`)

**입력**: `GoogleMaps/*.json`
**출력**: `data/places/{category}/{id}.json` (stub), `data/regions.json`, 터미널 변경 감지 리포트

GoogleMaps 원본 데이터를 좌표 기반으로 처리한다. **장소명 확인은 하지 않는다** — `address` 필드의 원문만 보존하고, 실제 장소명은 Phase 2에서 Claude Code 웹검색으로 확인한다.

| 작업 | 설명 |
|------|------|
| ID 생성 | 좌표 해시 기반 고유 ID (8자). 웹검색으로 장소명 확인 후 slug ID로 교체 가능 |
| 카테고리 매핑 | `properties.name` 필드에서 카테고리 분류 ("호주여행" → `attraction`, "호주음식" → `restaurant`, "호주숙소" → `accommodation`) |
| 최신 파일 기준 | 여러 날짜의 JSON 파일이 있을 경우 **최신 파일을 전체 리스트(authoritative source)**로 사용. 이전 파일은 diff 비교용 |
| **변경 감지** | 이전 내보내기 대비 추가/삭제된 장소를 리포트. 신규 장소는 stub 자동 생성 + Phase 2 웹검색 필요 표시 |
| **삭제 정리** | 최신 내보내기에 없는 장소의 파일을 정리. 빈 stub은 자동 삭제, `collected_data`가 채워진 파일은 보존 후 경고 |
| 중복 탐지 | 반경 100m 이내 → 중복 후보로 리포트 (자동 삭제는 하지 않음) |
| 지역 할당 | 좌표를 알려진 지역(시드니, 센트럴코스트, 뉴캐슬 등)에 할당. `data/regions.json`에 저장 |

> **설계 결정**: `address` 필드는 한국어명+영문명+주소가 혼합된 비정형 문자열이므로, 프로그래밍으로 장소명을 정확히 파싱하기 어렵다. 좌표를 기반으로 웹검색하여 확인하는 것이 더 정확하다.

> **현재 상태**: GoogleMaps에는 `"호주여행"` (관광지, 84개) 데이터가 있다. `"호주음식"`, `"호주숙소"` 데이터는 사용자가 구글맵에 장소를 추가한 후 내보내면 처리할 수 있다.

### Phase 2: 정보 수집

**입력**: `data/places/` (Phase 1 결과) 또는 ITINERARY.md의 장소 목록, `research/` (참고 자료)
**출력**: `data/places/` (collected_data 필드 채움), `research/claude-research/` (조사 결과)

Claude Code가 대화형으로 장소별 정보를 웹 검색하고, 결과를 JSON 또는 리서치 파일에 저장한다. 조사 과정에서 생산한 리서치 결과는 `research/claude-research/`에, 외부 AI 딥 리서치(`research/deep-research/`)도 참고 소스로 활용한다.

> **현재 상태**: ✅ Phase 2 완료. `data/places/attraction/` 84개 파일에 `collected_data`가 채워짐. `research/claude-research/places/`에 7개 지역별 리서치 요약 생성 완료. 날씨 조사(지역별 7개 파일), 로드트립 경로 리서치, 여행 환경 조사 등도 `research/claude-research/`에 완료되어 있다.

#### 리뷰 수집 전략: 시기 기반 2구간

모든 리뷰를 수집하는 대신, **여행 시기와 관련된 리뷰만** 타겟팅하여 효율적으로 수집한다.

| 구간 | 범위 | 목적 |
|------|------|------|
| **작년 동월 리뷰** | 여행 예정월의 전년도 동월 (예: 2026년 5월 여행 → 2025년 5월 리뷰) | 해당 시기의 날씨, 혼잡도, 계절 특성, 운영 상태 파악 |
| **최근 6개월 리뷰** | 현재 시점 기준 최근 6개월 | 현재 운영 상태 확인 (폐업, 공사, 가격 변동, 품질 변화) |

> 두 구간을 분리 수집하는 이유: 작년 동월 리뷰는 "그 시기에 가면 어떤지"를, 최근 리뷰는 "지금도 괜찮은지"를 판단하는 데 각각 쓰인다. Phase 3 평가 시에도 두 구간의 리뷰를 구분하여 분석한다.

#### 수집 항목

| 항목 | 필수 | 수집 방법 |
|------|------|-----------|
| 평점 (rating) | O | 웹검색 (구글맵 페이지, 여행 블로그) |
| 리뷰 수 | O | 웹검색 |
| 작년 동월 리뷰 요약 | O | 웹검색 → AI 분석 |
| 최근 6개월 리뷰 요약 | O | 웹검색 → AI 분석 |
| 비용 | - | 공식사이트, 웹검색 |
| 예상 체류시간 | O | 리뷰 분석, AI 추정 |
| 영업시간 | - | 공식사이트, 웹검색 |
| 가격대 (price_level) | 음식점/숙소만 필수 | 웹검색 |

#### 리뷰 요약 저장 스키마

```json
"review_summary": {
  "same_month_last_year": {
    "period": "2025-05",
    "count": 0,
    "positive": [],
    "negative": [],
    "seasonal_notes": "(계절 특이사항: 날씨, 혼잡도, 시즌 이벤트 등)"
  },
  "recent_6_months": {
    "period": "2025-09 ~ 2026-03",
    "count": 0,
    "positive": [],
    "negative": [],
    "status_notes": "(운영 상태 변화: 공사, 가격 변동, 품질 변화 등)"
  },
  "tips": []
}
```

> **수집되지 않은 장소 처리**: `collected_data`가 null인 장소는 Phase 3에서 "미평가(UNRATED)"로 분류. 평가에서 제외하되 일정에는 수동으로 추가 가능.

### Phase 3: 평가 및 등급

**입력**: `data/places/` (수집 완료된 장소)
**출력**: `data/scores/{category}_scored.json`

후보 장소가 많아 체계적 비교가 필요할 때 사용한다. 현재 여행의 확정 일정(ITINERARY.md)은 이미 대화를 통해 결정되었으므로, 이 Phase는 주로 **대안 장소 평가**, **백업 옵션 비교**, 또는 **미확정 일정(5/30 시드니)의 장소 선별** 등에 활용된다.

#### 등급 체계 (전 카테고리 공통)

| 등급 | 점수 | 의미 |
|------|------|------|
| **S** | 90-100 | 반드시 가야 할 곳. 일정의 핵심 |
| **A** | 75-89 | 강력 추천. 가능하면 포함 |
| **B** | 60-74 | 선택적 |
| **C** | 45-59 | 스킵 권장 |
| **D** | 0-44 | 비추천 |

#### 카테고리별 평가 기준

평가 기준은 카테고리마다 다르게 적용한다. 가중치는 필요 시 `config/scoring.json`으로 관리하며 언제든 조정 가능.

**관광지 (attraction)**

| 기준 | 가중치 | 평가 방법 |
|------|--------|-----------|
| 구글 평점 | 15% | 정량 (4.5+ → 만점) |
| 리뷰 수 / 인기도 | 10% | 정량 (로그 스케일 정규화) |
| 경치 / 포토스팟 | 20% | AI 리뷰 분석 (경치, 뷰, 사진 관련 언급 빈도) |
| 접근성 | 15% | AI 리뷰 분석 (주차, 도보 난이도 등) |
| 비용 대비 만족도 | 10% | 무료=가산, 유료=리뷰 만족도 대비 |
| 체류 시간 효율 | 10% | 예상 체류시간 대비 만족도 |
| 유니크함 | 20% | AI 판단 (호주 고유 경험, 희소성) |

**음식점 (restaurant)**

| 기준 | 가중치 | 평가 방법 |
|------|--------|-----------|
| 구글 평점 | 20% | 정량 |
| 리뷰 수 | 10% | 정량 |
| 음식 퀄리티 | 25% | AI 리뷰 분석 (맛, 신선도, 플레이팅) |
| 가성비 | 20% | 가격대 vs 리뷰 만족도 |
| 분위기 / 뷰 | 15% | AI 리뷰 분석 |
| 위치 편의성 | 10% | 관광지/숙소와의 거리 |

**숙소 (accommodation)**

| 기준 | 가중치 | 평가 방법 |
|------|--------|-----------|
| 구글 평점 | 15% | 정량 |
| 리뷰 수 | 10% | 정량 |
| 청결도 / 시설 | 25% | AI 리뷰 분석 |
| 가성비 | 20% | 1박 가격 vs 리뷰 만족도 |
| 위치 | 20% | 주변 관광지/음식점 접근성 |
| 호스트 응대 | 10% | AI 리뷰 분석 |

#### 평가 방식: 정량 + AI 판단 하이브리드

- **정량 항목** (평점, 리뷰 수): 공식으로 자동 계산
- **AI 판단 항목** (유니크함, 음식 퀄리티 등): Claude Code가 수집된 리뷰 데이터를 읽고 0-10점 채점 + 근거 서술
- 두 결과를 합산하여 최종 점수 산출

> **재현성 보장**: AI 판단 결과도 `breakdown.reason`에 근거를 기록하므로, 나중에 기준을 조정하거나 재평가할 때 참고할 수 있다.

> **현재 상태**: ✅ Phase 3 완료. `data/scores/attraction_scored.json`에 84개 장소 평가 완료. 3명 독립 평가자 평균. 등급 분포: S:2, A:41, B:34, C:7, D:0. `data/scores/RANKINGS.md`에 사람이 읽을 수 있는 랭킹 문서 자동 생성 (`scripts/generate_rankings.py`).

### Phase 4: 여행 일정 생성

**입력**: Phase 2~3 결과, `research/` 리서치 자료, META.md의 제약 조건
**출력**: `ITINERARY.md` (확정 일정)

여행 일정은 **사용자와 Claude Code의 대화**를 통해 생성된다. 리서치 자료, 평가 결과, 지리적 제약, 사용자 선호를 종합하여 일정을 구성하고, 결과를 `ITINERARY.md`에 직접 기록한다.

> **현재 상태**: 🔄 Phase 4 진행 중. ITINERARY.md에 5/23(출국), 5/24(이동일), 5/31(귀국)은 확정. 5/25~5/30은 미정.

#### 일정 생성 시 고려사항

1. **필터링**: 등급 기준 이상의 장소만 후보로 선택 (기본: B등급 이상)
2. **지역 그룹핑**: 같은 지역 장소를 하루에 묶어 이동 최소화
3. **지역 순서 결정**: 지역 간 이동거리를 최소화하는 순서 결정
4. **일별 배분**: 하루 활동 가능 시간 내에서 장소 배치
   - 이동시간 (좌표 간 직선거리 → 예상 운전시간 환산)
   - 체류시간 (`estimated_visit_duration_min`)
   - 식사 시간 슬롯 (점심/저녁)
5. **매칭**: 각 일정에 가까운 고평가 음식점/숙소를 연결
6. **대안 생성**: 우천 시 실내 대안, 시간 부족 시 축소 일정

#### 일정 설정 (`config/trip.json`)

> `META.md`의 확정 정보(여행 기간, 렌터카 일정, 제약 조건 등)를 기반으로 설정한다.
> `config/` 디렉토리에 scoring.json, trip.json이 생성되어 있다.

```json
{
  "total_days": 7,
  "start_date": "2026-05-24",
  "start_location": "시드니공항 (SYD)",
  "end_location": "시드니공항 (SYD)",
  "daily_start_time": "08:00",
  "daily_end_time": "20:00",
  "car_available": {
    "2026-05-24": true,
    "2026-05-25": true,
    "2026-05-26": true,
    "2026-05-27": true,
    "2026-05-28": true,
    "2026-05-29": true,
    "2026-05-30": false
  },
  "min_grade": "B",
  "must_include": [],
  "must_exclude": [],
  "priorities": ["nature", "photo_spot"],
  "budget_per_day_aud": null,
  "travel_style": "balanced"
}
```

- `start_date`: 여행 시작일. Phase 2에서 리뷰 수집 구간을 결정하는 데 사용 (작년 동월 = start_date의 월 - 1년, 최근 6개월 = 현재 기준)
- `car_available`: 날짜별 차량 보유 여부. 5/30은 렌터카 반납 후이므로 도보/대중교통만 가능
- `must_include` / `must_exclude`: 등급과 무관하게 일정에 반드시 포함/제외할 장소 ID
- `priorities`: 같은 등급 내에서 어떤 유형을 우선할지
- `travel_style`: `"relaxed"` (하루 2-3곳) / `"balanced"` (3-4곳) / `"intensive"` (5+곳)

### Phase 5: 일정 리뷰

**입력**: `ITINERARY.md` (확정/초안 일정), `META.md` (제약 조건), `research/deep-research/` + `research/claude-research/` (참고 자료)
**출력**: `research/ai-review/{날짜}_{주제}.md` (근거 자료), `ITINERARY.md` (리뷰 요약 + 상세)

일정이 확정되거나 초안이 작성될 때마다, AI가 해당 일정을 리서치하고 비판적으로 검토하여 리뷰를 제공한다.

> **현재 상태**: ⬜ Phase 5 미시작. Phase 4 일정 확정 후 진행 예정.

#### 리뷰 프로세스 (3단계)

```
Step 1: 리서치          Step 2: 의견 정리          Step 3: 리뷰 작성
(정보 수집)             (파일별 정리)              (ITINERARY.md 반영)
     │                       │                          │
     ▼                       ▼                          ▼
웹 검색/딥 리서치 →  ai-review/{날짜}_*.md  →  ITINERARY.md 리뷰 섹션
참고 자료 확인         긍정 + 비판 분리             요약 + 상세
```

**Step 1: 리서치 (정보 수집)**

해당 날짜의 일정에 대해 근거 자료를 수집한다.

| 수집 대상 | 방법 | 예시 |
|-----------|------|------|
| 이동 경로 실현 가능성 | 웹검색 (거리, 소요시간, 도로 상태) | "시드니→골드코스트 M1 야간 운전 주의사항" |
| 장소별 실제 후기 | 웹검색 (블로그, 리뷰) | "5월 포트맥쿼리 날씨 및 관광 후기" |
| 시간 배분 적절성 | 리뷰/공식사이트 (영업시간, 체류시간) | "Sixt 시드니공항 일요일 오픈 시간" |
| 기존 리서치 | `research/deep-research/`, `research/claude-research/` 참조 | 외부 AI 및 기존 조사 결과와 비교 |

**Step 2: 의견 정리 (ai-review/ 파일 생성)**

수집한 정보를 날짜별로 **긍정적 의견**과 **비판적 의견**으로 분리하여 파일로 정리한다.

파일명: `research/ai-review/{날짜}_{주제}.md`

```markdown
---
대상: ITINERARY.md 5월 24일
작성일: 2026-03-12
---

## 긍정적 의견
- (근거와 함께 이 일정이 잘 짜여진 점)
- (시간 배분이 합리적인 이유)
- ...

## 비판적 의견
- (리스크나 문제점, 근거 포함)
- (시간이 부족하거나 비현실적인 부분)
- ...

## 참고 자료
- (검색한 URL, 출처)
```

> **원칙**: 긍정과 비판을 동등한 비중으로 조사한다. 확증 편향을 방지하기 위해 "이 일정이 왜 좋은지"와 "이 일정이 왜 위험한지"를 각각 독립적으로 리서치한다.

**Step 3: 리뷰 작성 (ITINERARY.md 반영)**

ai-review/ 파일들을 종합하여 ITINERARY.md에 리뷰를 작성한다.

- **리뷰 요약** (일정표 바로 아래, 5줄 이내): 핵심 포인트만 요약. 상세 링크 포함
- **리뷰 상세** (하단 섹션): 구체적 근거, 대안 제시, 리스크 분석

#### 리뷰 관점 체크리스트

리뷰 시 반드시 아래 관점을 점검한다.

| 관점 | 확인 사항 |
|------|-----------|
| **시간 실현성** | 이동시간 + 체류시간 + 휴식이 하루 안에 가능한가? 버퍼가 있는가? |
| **체력/피로** | 전날 일정 대비 무리하지 않는가? 장거리 운전 후 관광이 현실적인가? |
| **제약 조건 충돌** | META.md의 제약 조건(렌터카 반납, 차량 유무 등)과 충돌하지 않는가? |
| **계절/날씨** | 5월 호주 가을 기준으로 일몰 시간, 기온, 우기 등 고려했는가? |
| **비용** | 입장료, 주유, 숙박비 등이 합리적인가? |
| **대안 유무** | 우천, 지연 등 변수 발생 시 B플랜이 있는가? |
| **동선 효율** | 불필요한 역주행이나 비효율적 이동이 없는가? |
| **기존 리서치 대조** | deep-research, claude-research 결과와 비교하여 놓친 포인트가 없는가? |

#### 리뷰 등급

각 날짜 일정에 대해 종합 판단을 내린다.

| 등급 | 의미 |
|------|------|
| **안전** | 큰 리스크 없음. 계획대로 진행 가능 |
| **주의** | 일부 리스크 존재. 대안 준비 권장 |
| **경고** | 실현 가능성 의문. 수정 강력 권장 |

---

## 5. 프로젝트 디렉토리 구조

```
호주여행/
├── SPEC.md                     # 기술 설계서 (이 문서)
├── META.md                     # 여행 전제 조건 (항공, 렌터카, 로드트립 방향, 제약 조건)
├── ITINERARY.md                # 날짜별 확정 일정 + AI 리뷰 (Single Source of Truth)
├── CLAUDE.md                   # Claude Code 작업 가이드
├── .gitignore
├── requirements.txt
│
├── research/                   # 리서치 자료 및 AI 리뷰 근거
│   ├── deep-research/          #   ChatGPT, Gemini 등 외부 AI 딥 리서치 결과
│   ├── claude-research/        #   Claude Code가 직접 조사한 리서치 결과
│   │   ├── weather/            #     지역별 날씨 조사 (시드니, 센트럴코스트, 포트맥쿼리 등 7개)
│   │   ├── places/             #     지역별 장소 리서치 요약
│   │   ├── 6일-로드트립-리서치.md
│   │   ├── 호주-5월-여행환경.md
│   │   └── ...
│   └── ai-review/              #   ITINERARY.md 리뷰 작성 시 수집한 근거
│
├── GoogleMaps/                 # 구글맵 내보내기 원본 (입력, 수정 금지)
│   └── {YYYY-MM-DD}.json      # 날짜 기반 파일명, 모든 카테고리 혼합
│
├── config/                     # 설정
│   ├── scoring.json            #   카테고리별 평가 기준 & 가중치
│   └── trip.json               #   여행 일정 생성 설정
│
├── data/                       # 수집/분석 데이터
│   ├── places/
│   │   └── {category}/{id}.json  # Phase 1에서 stub 생성, Phase 2에서 정보 채움
│   ├── scores/
│   │   ├── {category}_scored.json
│   │   ├── scorer_A.json, scorer_B.json, scorer_C.json  # 개별 평가자 결과
│   │   └── RANKINGS.md         #   사람이 읽을 수 있는 랭킹 문서 (자동 생성)
│   └── regions.json            # 좌표 기반 지역 할당 결과
│
└── scripts/                    # 자동화 스크립트
    ├── parse_googlemaps.py     #   Phase 1: GoogleMaps 변경 감지 + 좌표 기반 처리
    ├── generate_rankings.py    #   Phase 3 결과 → RANKINGS.md 자동 생성
    └── utils/
        ├── __init__.py
        └── geo.py              #   좌표/거리 계산, 지역 할당, 중복 탐지
```

**디렉토리 규칙**:
- `GoogleMaps/`: 원본 데이터. 절대 스크립트가 수정하지 않음
- `research/`: 리서치 자료 및 리뷰 근거. 사람 또는 AI가 수집하여 저장
  - `deep-research/`: ChatGPT, Gemini 등 외부 AI 딥 리서치 결과. 파일명 `{주제}_{출처}.md`
  - `claude-research/`: Claude Code가 직접 조사한 리서치 결과. 파일명 `{주제}.md`. `weather/` 하위에 지역별 날씨 파일
  - `ai-review/`: ITINERARY.md AI 리뷰 작성 시 근거 자료. 파일명 `{날짜}_{주제}.md`
- `ITINERARY.md`: 확정 일정의 Single Source of Truth. 일정 변경은 반드시 이 파일에 반영
- `config/`, `data/`, `scripts/`: 선택적 자동화 인프라. 필요 시 생성하여 사용

---

## 6. 기술 스택

| 구분 | 기술 | 용도 |
|------|------|------|
| AI (핵심) | Claude Code (대화형) | 정보 수집, 리뷰 분석, 평가, 일정 생성/조정, 리뷰 |
| 정보 수집 | Claude Code WebSearch / WebFetch | 시기 기반 리뷰 및 장소 상세정보 수집 |
| 자동화 (보조) | Python 3.11+ | 전처리, 좌표 계산 등 반복 연산 |
| 좌표 계산 | scripts/utils/geo.py (자체 구현) | 장소 간 거리 계산, 지역 할당 |
| 데이터 포맷 | JSON | 모든 구조화 데이터 |
| 버전 관리 | Git | 설정/일정 이력 관리 |

---

## 7. 설계 원칙

1. **ITINERARY.md가 Single Source of Truth**: 확정된 여행 일정은 `ITINERARY.md`에서 관리한다. 다른 어떤 파일(plans/, data/ 등)보다 이 문서가 우선한다.
2. **원본 불변**: `GoogleMaps/` 원본은 읽기 전용. 모든 가공은 `data/`에.
3. **대화형 우선**: 일정 생성과 조정은 Claude Code와의 대화로 수행한다. 스크립트는 반복 연산이 필요할 때만 보조적으로 사용한다.
4. **증분 처리**: 새 장소 추가 시 기존 수집/평가 데이터를 보존하고, 새 장소만 처리.
5. **판단 근거 기록**: AI 평가 시 점수뿐 아니라 이유를 반드시 남긴다.
6. **설정 분리**: 평가 기준, 여행 설정 등은 코드가 아닌 `config/` JSON으로 관리.
7. **사람이 최종 결정**: AI는 정보 수집과 초안 제안까지. 최종 일정 확정은 사용자.
