# research/

> 리서치 자료와 일정 리뷰 근거를 보관하는 폴더.

## 구조

```
research/
├── README.md                # 이 문서
├── deep-research/           # ChatGPT, Gemini 등 외부 AI 딥 리서치 결과
│   ├── {주제}_{출처}.md     # 예: 시드니-골드코스트-로드트립-일정_chatgpt.md
│   └── ...
├── claude-research/         # Claude Code가 직접 조사한 리서치 결과
│   ├── {주제}.md            # 예: 호주-5월-여행환경.md
│   ├── places/              # 지역별 장소 리서치 요약 (Phase 2 결과)
│   │   └── {지역명}.md      # 예: 시드니.md, 블루마운틴.md
│   ├── weather/             # 지역별 날씨 조사
│   │   └── {번호}_{지역명}.md  # 예: 01_시드니.md
│   └── ...
└── ai-review/               # ITINERARY.md AI 리뷰 작성 시 수집한 근거 자료
    ├── {날짜}_{주제}.md     # 예: 0524_야간운전-주의사항.md
    └── ...
```

## 파일 작성 규칙

### deep-research/
- **ChatGPT, Gemini 등 외부 AI**로 딥 리서치한 결과를 저장
- 파일명: `{주제}_{출처}.md` (예: `골드코스트-맛집_gemini.md`)
- 상단에 출처, 검색일, 프롬프트 요약을 기록

```markdown
---
출처: ChatGPT / Gemini 등
검색일: 2026-03-12
프롬프트: (어떤 질문을 했는지 간략 요약)
---
(내용)
```

### claude-research/
- **Claude Code**가 WebSearch/WebFetch 등으로 직접 조사한 결과를 저장
- 파일명: `{주제}.md` (예: `호주-5월-여행환경.md`)
- 상단에 작성일, 조사 목적을 기록

```markdown
---
작성일: 2026-03-12
목적: (무엇을 조사했는지 간략 요약)
---
(내용)
```

### ai-review/
- ITINERARY.md의 AI 리뷰를 작성할 때 근거가 된 검색 결과, 참고 링크, 데이터 등을 저장
- 파일명: `{날짜}_{주제}.md` (예: `0524_시드니공항-렌터카.md`)
- ITINERARY.md 리뷰 상세에서 이 파일을 링크하여 근거를 추적 가능하게 함
