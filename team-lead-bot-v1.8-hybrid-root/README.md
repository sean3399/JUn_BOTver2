# JUN BOT V2.1.1 — Visual Review + Private Blob OIDC

> Private Vercel Blob의 최신 OIDC/Presigned URL 업로드 방식 대응 버전입니다.

# 팀장님 시뮬레이터 V2.1 Beta · Review Cycle + Visual Document Review

기존 V1.9의 **Judgment OS + 6축 분석 + 팀장님 채팅 시뮬레이션**과 V2.0의 **Review Cycle** 위에, 장표·스캔 문서를 실제 업무에서 검토할 수 있도록 **Visual Document Review(OCR/표/차트/캡처)**를 추가한 버전입니다.

## V2.1 핵심 변화 — 장표/스캔 문서 읽기

### PDF
PDF는 일반 텍스트 추출만 하지 않고 OpenAI의 PDF 시각 입력을 함께 사용합니다.

- 디지털 텍스트 + 페이지 이미지 동시 검토
- 스캔 PDF OCR
- 표/차트/그래프/주석/범례 읽기
- 페이지 단위 근거 위치 유지
- 큰 PDF는 `pdf-lib`로 여러 페이지 묶음으로 나누어 Visual Review
- OpenAI Files API에 `user_data` 용도로 임시 업로드하고 각 묶음 처리 직후 삭제

기본 설정은 최대 120페이지까지 Visual Review를 수행합니다. 더 긴 보고서는 환경변수로 조절할 수 있습니다.

### PPTX
PowerPoint는 서버에서 완전한 슬라이드 렌더링 엔진을 돌리지 않습니다. 대신 장표 안의 정보를 다음처럼 결합합니다.

- 슬라이드의 실제 텍스트 추출
- 네이티브 차트 XML의 라벨/값 추출
- 슬라이드에 삽입된 PNG/JPEG/WebP/GIF 이미지 자동 탐지
- 스크린샷, 표 캡처, 이미지형 차트 등을 OpenAI Vision으로 OCR/해석
- 결과를 원래 슬라이드 번호와 연결

따라서 이미지 캡처가 많은 사내 보고서에서 기존 텍스트 파서보다 훨씬 많은 내용을 검토할 수 있습니다.

### DOCX / XLSX
- DOCX: 본문 텍스트 + 삽입 이미지 Visual OCR
- XLSX: 시트/행/셀 추출 + 통합문서 삽입 이미지 Visual OCR

### OCR 결과도 근거 추적에 포함
Visual 결과는 별도 장식 정보로 끝나지 않고 기존 팀장님봇 분석 본문에 합쳐집니다.

- `[페이지 N · Visual/OCR]`
- `[슬라이드 N · 이미지 M · Visual/OCR]`

형태로 위치가 남아 Issue의 `근거 위치`에도 활용됩니다.

또한 긴 문서를 샘플링할 때 **Visual/OCR 결과에 별도 예산을 예약**해서 문서 뒤쪽에 있다는 이유로 OCR 결과가 통째로 잘리지 않도록 했습니다.

## Review Cycle 기능

1. **수정 전/후 비교** — 점수 변화, 해결/잔존/신규 이슈
2. **Issue별 수정안** — 지적사항 단위 최소 수정안, 실제 재업로드 후 해결 판정
3. **실제 피드백 vs 예측** — 팀장님 실제 반응과 사전 예측 적중도
4. **근거 위치 추적** — PPTX 슬라이드, PDF 페이지, XLSX 시트/행/셀, DOCX 문단 + Visual OCR 위치
5. **상신본 생성** — Teams / 이메일 / 구두 30초 / 1페이지 / 결론 3줄

## 대용량 첨부파일 · Vercel Pro

Vercel Function의 요청 본문 한도를 피하기 위해 **Private Vercel Blob client upload**를 사용합니다.

- 첨부 합계 3.5MB 이하: 기존 FormData 경로
- 3.5MB 초과: 브라우저 → Private Vercel Blob 직접 업로드 → 서버에는 Blob 경로만 전달
- 파일당 최대 200MB
- 한 요청 파일 합계 최대 300MB
- 최대 5개 파일
- 분석 완료/실패 후 Private Blob 원본 삭제
- `/api/review`는 Vercel Pro 기준 `maxDuration = 300`초

### Vercel 설정

1. Vercel 프로젝트 → Storage → Blob Store 생성/연결
2. **Private** access 사용
3. `BLOB_STORE_ID` 및 `BLOB_WEBHOOK_PUBLIC_KEY` 연결 확인 (Private Blob/OIDC)
4. 재배포

## Visual Review 환경변수

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
OPENAI_REASONING_EFFORT=low

# 비워두면 OPENAI_MODEL 사용
OPENAI_VISUAL_MODEL=
OPENAI_VISUAL_REVIEW=true

# 비용/처리시간 상한
OPENAI_VISUAL_MAX_PDF_PAGES=120
OPENAI_VISUAL_PDF_CHUNK_PAGES=12
OPENAI_VISUAL_MAX_IMAGES=72
OPENAI_VISUAL_CONCURRENCY=2

APP_ACCESS_CODE=긴-임의-접근코드
BLOB_STORE_ID=Vercel-Blob-연결-시-자동-주입
BLOB_WEBHOOK_PUBLIC_KEY=Vercel-Blob-연결-시-자동-주입
# VERCEL_OIDC_TOKEN은 Vercel Runtime에서 자동 제공
```

장표가 100~150장 이상인 자료를 자주 검토하면 `OPENAI_VISUAL_MAX_PDF_PAGES`를 올릴 수 있지만 비용과 처리시간도 같이 증가합니다.

## 보안/데이터 흐름

- API Key와 Blob token은 서버 환경변수에서만 사용합니다.
- 앱 자체 DB에는 첨부 원문을 저장하지 않습니다.
- 대용량 원본은 Private Vercel Blob에 임시 저장하고 검토 종료 시 삭제합니다.
- PDF Visual Review 시 필요한 PDF 조각은 OpenAI Files API에 임시 업로드하고 해당 Visual 호출 직후 삭제합니다.
- PPTX/DOCX/XLSX의 이미지형 시각자료는 Responses API의 이미지 입력으로 전송합니다.
- Responses API 호출은 `store: false`입니다.
- 대화/Review Cycle 상태는 브라우저 `localStorage`에 남습니다.
- 회사 내부 민감정보 사용은 회사 정책 및 보안 검토 범위 안에서 진행하세요.

## 현실적인 한계

PPTX는 PowerPoint 자체와 동일한 완전 렌더링을 서버에서 수행하는 방식이 아닙니다. 따라서 다음은 제한될 수 있습니다.

- SmartArt의 정확한 공간 관계
- 복잡한 애니메이션/겹침
- OLE 임베드 객체
- EMF/WMF 등 Vision API에서 바로 읽기 어려운 이미지 형식

대신 **텍스트 + 네이티브 차트 데이터 + 삽입 이미지 Vision**을 결합해 일반적인 사내 경영 장표 검토에 초점을 맞췄습니다.

## 테스트

```bash
npm install
npm run test:regression
npm run test:workflow
npm run build
```

## 주요 파일

- `components/ChatPane.js` — Teams UI + 대용량 업로드 + OCR 상태 표시
- `components/ReviewWorkspace.js` — Review Cycle + Visual Review 커버리지 UI
- `lib/docParse.js` — 문서 구조/텍스트/삽입 이미지/차트 데이터 추출
- `lib/visualReview.js` — PDF Vision OCR + 삽입 이미지 OCR 파이프라인
- `lib/openaiClient.js` — 텍스트/멀티모달 Responses + OpenAI 임시 파일 관리
- `lib/reviewWorkflow.js` — Issue 생성, Visual 근거 위치, 버전 비교
- `app/api/review/route.js` — 문서 분석 + Visual Review + Review Cycle

## 배포 확인

재배포 후 `/api/health`에서 아래를 확인합니다.

- `version: "2.1-beta"`
- `visualDocumentReview: true`
- `pdfVisionOcr: true`
- `presentationImageOcr: true`
- `blobConfigured: true`
- `blobAuthMode: "oidc-presigned"`
