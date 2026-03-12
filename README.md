<div align="center">

# 호주 로드트립 플래너

**2026년 5월 · 시드니 출발 · AI 기반 여행 계획**

구글맵 후보지 데이터를 전처리하고, Claude Code가 정보 수집 · 평가 · 일정 생성 · 리뷰를 수행한다.

![Status](https://img.shields.io/badge/Phase_4-일정_생성_중-yellow?style=for-the-badge)
![Places](https://img.shields.io/badge/관광지-84곳_평가_완료_(추가_예정)-blue?style=for-the-badge)
![Duration](https://img.shields.io/badge/기간-9일_(활동_7일)-green?style=for-the-badge)

[**확정 일정**](./ITINERARY.md) · [**관광지 랭킹**](./data/scores/RANKINGS.md) · [**여행 전제 정보**](./META.md)

</div>

<br/>

---

## 진행 상황

| Phase | 상태 | 결과물 |
|:------|:----:|:-------|
| 1. 전처리 | ✅ | [`data/places/attraction/`](./data/places/attraction/) — 84개 장소 JSON |
| 2. 정보 수집 | ✅ | [`research/claude-research/places/`](./research/claude-research/places/) — 7개 지역 리서치 |
| 3. 평가/등급 | ✅ | [`RANKINGS.md`](./data/scores/RANKINGS.md) — S:2 · A:41 · B:34 · C:7 |
| 4. 일정 생성 | 🔄 | [`ITINERARY.md`](./ITINERARY.md) — 5/25~30 미정 |
| 5. 일정 리뷰 | ⬜ | |
| 향후 | ⬜ | 음식점·숙소 데이터 수집 및 평가, 관광지 추가 |

---

## 관광지 등급

> 전체 목록과 상세 점수는 [RANKINGS.md](./data/scores/RANKINGS.md) 참조

| 등급 | 장소 수 | 기준 | 대표 장소 |
|:----:|--------:|:-----|:----------|
| **S** | 2곳 | 반드시 방문 | 블루마운틴스 국립공원, 케이프 바이런 등대 |
| **A** | 41곳 | 강력 추천 | 그랜드 캐니언 트랙, 버레이 헤드, 뉴캐슬 메모리얼 워크 등 |
| **B** | 34곳 | 선택적 | 오크필드 낙타 라이드, 야마 등대, 노라 헤드 등대 등 |
| **C** | 7곳 | 스킵 권장 | 제놀란 동굴(폐쇄), 빅 프론, 토보건 힐 파크 등 |

> 현재 관광지 84곳 평가 완료. 음식점·숙소 평가 및 관광지 추가도 예정.

---

## 여행 개요

<table>
  <tr>
    <td><strong>기간</strong></td>
    <td>2026. 5. 23 (토) ~ 5. 31 (일)</td>
  </tr>
  <tr>
    <td><strong>출발 / 도착</strong></td>
    <td>시드니 (SYD)</td>
  </tr>
  <tr>
    <td><strong>렌터카</strong></td>
    <td>5/24 ~ 29 (6일) · Sixt · 시드니공항 픽업/반납</td>
  </tr>
  <tr>
    <td><strong>코스</strong></td>
    <td>미정 — Phase 4에서 확정 예정</td>
  </tr>
</table>

<br/>

| 날짜 | 구간 | 비고 |
|:-----|:-----|:-----|
| 5/23 (토) | 인천 → 시드니 | 출국 |
| 5/24~29 | 로드트립 (6일) | 코스 미정 |
| 5/29 (금) | → 시드니공항 | 렌터카 반납 21:00 |
| 5/30 (토) | 시드니 시내 | 차량 없음 · 도보 관광 |
| 5/31 (일) | 시드니 → 인천 | 귀국 |

> [!NOTE]
> 확정된 상세 일정은 [ITINERARY.md](./ITINERARY.md), 항공·렌터카·제약 조건은 [META.md](./META.md) 참조

---

## 설계 원칙

- **ITINERARY.md가 Single Source of Truth** — 확정 일정은 이 파일에서 관리
- **AI는 정보 수집과 초안까지** — 최종 결정은 사람이 한다
- **판단 근거 기록** — AI 평가 시 점수와 이유를 반드시 함께 저장
- **확증 편향 방지** — 리뷰 시 긍정·비판을 동등 비중으로 조사

---

<details>
<summary><strong>프로젝트 구조</strong></summary>

<br/>

```
호주여행/
├── ITINERARY.md            # 확정 일정 (Single Source of Truth)
├── META.md                 # 여행 전제 조건 (항공, 렌터카, 제약 조건)
├── SPEC.md                 # 기술 설계서 (데이터 스키마, 워크플로우)
├── CLAUDE.md               # Claude Code 작업 가이드
├── GoogleMaps/             # 구글맵 내보내기 원본 (읽기 전용)
├── config/
│   ├── scoring.json        #   카테고리별 평가 기준·가중치
│   └── trip.json           #   여행 일정 설정
├── data/
│   ├── places/attraction/  #   장소별 상세 JSON (84개)
│   ├── scores/
│   │   ├── RANKINGS.md     #   관광지 랭킹 (자동 생성)
│   │   ├── attraction_scored.json  # 최종 평가 결과
│   │   └── scorer_A/B/C.json      # 개별 평가자 결과
│   └── regions.json        #   좌표 기반 지역 분류 (12개 지역)
├── research/
│   ├── deep-research/      #   외부 AI 딥 리서치 (ChatGPT, Gemini)
│   ├── claude-research/    #   Claude Code 직접 조사
│   │   ├── places/         #     지역별 장소 리서치 (7개 파일)
│   │   └── weather/        #     지역별 날씨 조사
│   └── ai-review/          #   일정 리뷰 근거 (Phase 5에서 생성)
└── scripts/
    ├── parse_googlemaps.py  #   Phase 1 전처리
    ├── generate_rankings.py #   평가 결과 → RANKINGS.md 생성
    └── utils/geo.py         #   좌표·거리 계산
```

</details>

<details>
<summary><strong>워크플로우 (5 Phase)</strong></summary>

<br/>

| Phase | 작업 | 실행 방식 | 결과물 |
|:------|:-----|:----------|:-------|
| 1. 전처리 | GoogleMaps → 장소 stub 생성 | `parse_googlemaps.py` | `data/places/` |
| 2. 정보 수집 | 웹검색으로 상세정보·리뷰 수집 | Claude Code 대화형 | `data/places/`, `research/` |
| 3. 평가/등급 | 3명 독립 평가자로 S~D 등급 부여 | Claude Code 대화형 | `data/scores/`, `RANKINGS.md` |
| 4. 일정 생성 | 등급·지리·제약 기반 일정 구성 | Claude Code 대화형 | `ITINERARY.md` |
| 5. 일정 리뷰 | 확정 일정 비판적 검토 | Claude Code 대화형 | `research/ai-review/` |

</details>

<details>
<summary><strong>스크립트</strong></summary>

<br/>

```bash
# Phase 1: GoogleMaps 전처리 (stub 생성, 지역 할당, 중복 탐지)
python scripts/parse_googlemaps.py

# 변경 감지 리포트만 (파일 생성 없이)
python scripts/parse_googlemaps.py --diff-only

# Phase 3 결과 → RANKINGS.md 자동 생성 (점수 수정 후 재실행)
python scripts/generate_rankings.py
```

Python 3.11+ 표준 라이브러리만 사용. 외부 의존성 없음.

</details>

<br/>

<div align="center">

Built mainly with <img src="https://img.shields.io/badge/Claude_Code-191919?style=flat&logo=anthropic&logoColor=white" alt="Claude Code" valign="middle" />
<br/>
Supported by <img src="https://img.shields.io/badge/Gemini-4285F4?style=flat&logo=google&logoColor=white" alt="Gemini" valign="middle" /> <img src="https://img.shields.io/badge/ChatGPT-74aa9c?style=flat&logo=openai&logoColor=white" alt="ChatGPT" valign="middle" />

</div>

