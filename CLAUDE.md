# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

호주 시드니↔골드코스트 해안 로드트립(2026년 5월) 여행 플래너. 구글맵에서 내보낸 후보지 데이터를 전처리하고, AI가 정보 수집·평가·일정 생성·리뷰를 수행한다. 대부분의 작업은 Claude Code 대화형으로 진행되며, Python 스크립트는 반복 연산 보조용.

## 핵심 문서 역할

- **`META.md`**: 여행 전제 조건 (항공, 렌터카, 일정 프레임, 제약 조건). 고정된 사실.
- **`SPEC.md`**: 기술 설계서 (데이터 스키마, Phase별 워크플로우, 평가 기준). 구현 명세.
- **`ITINERARY.md`**: 확정 일정의 **Single Source of Truth**. 일정 변경은 반드시 여기에 반영.
- **`config/trip.json`**: 일정 생성 설정 (여행 스타일, 우선순위, 필수 포함/제외 장소).
- **`config/scoring.json`**: 카테고리별 평가 기준 및 가중치.

## 워크플로우 (5 Phase)

1. **전처리**: `GoogleMaps/*.json` → `data/places/{category}/{id}.json` stub 생성 + `data/regions.json`
2. **정보 수집**: 웹검색으로 장소별 상세정보·리뷰 수집 → place JSON의 `collected_data` 채움, `research/claude-research/`에 리서치 저장
3. **평가/등급**: 수집 데이터 기반 S~D 등급 부여 → `data/scores/{category}_scored.json`
4. **일정 생성**: 대화형으로 일정 구성 → `ITINERARY.md`에 직접 기록
5. **일정 리뷰**: 확정 일정을 비판적으로 검토 → `research/ai-review/`에 근거 저장, `ITINERARY.md`에 리뷰 반영

## 현재 진행 상황

- Phase 1 (전처리): ✅ 완료 — 84개 attraction stub 생성
- Phase 2 (정보 수집): ✅ 완료 — 84개 장소 collected_data 채움, 7개 지역 리서치
- Phase 3 (평가/등급): ✅ 완료 — 3명 독립 평가 평균, S:2 A:41 B:34 C:7
- Phase 4 (일정 생성): 🔄 진행 중 — 5/25~5/30 미정
- Phase 5 (일정 리뷰): ⬜ 미시작
- 향후: 음식점·숙소 데이터 수집 및 평가 예정, 관광지 추가도 가능

## 스크립트 실행

```bash
# Phase 1: GoogleMaps 전처리 (stub 생성, 지역 할당, 중복 탐지)
python scripts/parse_googlemaps.py

# 변경 감지 리포트만 (파일 생성 없이)
python scripts/parse_googlemaps.py --diff-only
```

외부 의존성 없음. Python 3.11+ 표준 라이브러리만 사용.

## 데이터 규칙

- **`GoogleMaps/`는 읽기 전용** — 원본 GeoJSON 절대 수정 금지
- 장소 ID는 좌표 SHA-256 해시 앞 8자 (예: `b484de1d`)
- `collected_data`가 `null`이면 미수집 장소 (Phase 2 필요)
- 리뷰 수집은 **작년 동월**(`same_month_last_year`)과 **최근 6개월**(`recent_6_months`) 2구간으로 분리
- 좌표 형식: `[lng, lat]` (GeoJSON 표준)

## 리서치 파일 구조

- `research/deep-research/`: 외부 AI(ChatGPT, Gemini) 딥 리서치. 파일명 `{주제}_{출처}.md`
- `research/claude-research/`: Claude Code 직접 조사. 파일명 `{주제}.md`
- `research/ai-review/`: ITINERARY.md 리뷰 근거. 파일명 `{날짜}_{주제}.md`

## 주요 설계 원칙

- AI 평가 시 점수와 **판단 근거(reason)**를 반드시 함께 기록
- 리뷰 시 긍정·비판을 동등 비중으로 조사 (확증 편향 방지)
- 최종 결정은 사용자가 한다 — AI는 정보 수집과 초안 제안까지

## 언어

프로젝트 전체가 한국어로 작성됨. 응답과 파일 작성 시 한국어 사용.
