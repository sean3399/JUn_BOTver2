# 팀장님 시뮬레이터 V2.0 Beta · Review Cycle

기존 V1.9의 **Judgment OS + 6축 분석 + 팀장님 채팅 시뮬레이션** 위에, 검토 이후 실제 상신까지 이어지는 **Review Cycle**을 추가한 버전입니다.

## V2.0 핵심 기능

### 1. 수정 전 / 후 비교
같은 문서의 수정본을 다시 올리면 이전 버전과 비교합니다.

- 총점 및 6축 변화
- 해결된 이슈
- 여전히 남은 이슈
- 수정 과정에서 새로 발생한 이슈

파일명이 동일하거나 `v2`, `ver2`, `수정본`, `최종`, 날짜형 suffix(예: `_0813`, `_20260813`)를 사용하면 같은 Review Cycle로 묶습니다.

### 2. Issue별 수정안
각 예상 질문/지적사항에 대해 `수정안 생성`을 누르면 해당 문제만 해결하는 최소 수정안을 제안합니다.

- 문서에 없는 숫자·규정·일정은 만들지 않음
- 필요한 사실이 없으면 `[확인 필요: ...]` 자리표시자로 남김
- `작업본에 채택`한 수정안은 누적됨
- **수정안 채택만으로 문제를 해결 처리하지 않음** — 실제 수정본 재업로드 후 이슈가 사라져야 해결로 판정

### 3. 실제 피드백 vs 예측
보고 후 실제 팀장 피드백을 붙여넣으면 사전 예측과 비교합니다.

- 핵심 쟁점 적중도(0~100)
- 강한/부분 적중
- 예측했지만 실제로 나오지 않은 이슈
- 실제로 나왔지만 예측하지 못한 이슈

### 4. 근거 위치 추적
Issue 카드에서 문제와 관련된 원문 위치를 표시합니다.

- PPTX: 슬라이드
- XLSX: 시트 · 행 · 셀 주소
- DOCX: 문단
- PDF: 페이지
- TXT/MD/CSV: 문서 내 텍스트

복잡한 병합셀, 도형, 이미지 안 텍스트는 정확히 특정되지 않을 수 있습니다.

### 5. 상신본 생성
현재 검토 결과와 채택한 수정안을 기준으로 다음 형식의 상신 문안을 생성합니다.

- Teams
- 이메일
- 구두보고 30초
- 1페이지 보고
- 결론 3줄

미확인 핵심 정보는 임의로 채우지 않고 `확인 중/추가 확인 필요`로 남깁니다.

## 기존 V1.9 기능 유지

- Judgment OS 6개 메타 원칙
- 6가지 문서 판단축: 사실성 / 인과성 / 정당성 / 비례성 / 실행성 / 전달성
- Assumption Traceability
- 유사 선례 매칭
- 팩트/의견 분리
- 판단 주체·설명가능성 진단
- Teams형 짧은 팀장님 반응
- 정책/숫자 창작 및 과잉 단정 가드
- 후속 턴별 6축 재계산

## 테스트

```bash
npm run test:regression
npm run test:workflow
npm run build
```

`test:workflow`는 Issue 생성, XLSX 근거 위치, 버전 간 해결/잔존/신규 이슈 판정을 검증합니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

`http://localhost:3000`

## 환경변수

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
OPENAI_REASONING_EFFORT=low
APP_ACCESS_CODE=긴-임의-접근코드
```

## Vercel 배포

1. ZIP 내용을 기존 GitHub 레포 루트에 덮어쓰기
2. Vercel 재배포
3. `/api/health`에서 `version: 2.0-beta`, `reviewCycle: true` 확인

## 보안/데이터 주의

- API Key는 서버 환경변수에서만 사용합니다.
- 앱 자체 DB는 없고 첨부 원문 파일을 별도 DB에 저장하지 않습니다.
- 문서에서 추출된 텍스트는 검토를 위해 OpenAI API로 전송됩니다.
- 대화 및 Review Cycle 상태는 브라우저 `localStorage`에 남습니다.
- 회사 내부 민감정보 사용은 회사 정책과 보안 검토 범위 안에서 진행하세요.
- 시각적 배치·색상·도형 관계는 현재 분석하지 않습니다.

## 주요 파일

- `components/ChatPane.js` — Teams UI + 채팅/검토 진입
- `components/ReviewWorkspace.js` — V2.0 Review Cycle UI
- `lib/reviewWorkflow.js` — Issue 생성, 근거 위치, 버전 비교
- `app/api/workflow/route.js` — 수정안/피드백 비교/상신본 생성
- `app/api/review/route.js` — 문서 분석 + Review Cycle Issue 생성
- `lib/docParse.js` — PPTX/XLSX/DOCX/PDF 위치 태깅
- `lib/managerLogic.js` — 기존 6축 + Judgment OS
