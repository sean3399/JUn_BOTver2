# 팀장님 시뮬레이터 V1.8 Hybrid

Claude가 만든 Teams형 대화 UX와, 실제 팀장 반응 자료에서 추출한 V1.7.1 판단 엔진을 합친 하이브리드 버전입니다.

## 핵심 구조

1. **규칙 기반 판단 엔진**이 먼저 문서를 분석합니다.
   - 사실성
   - 인과성
   - 정당성
   - 비례성
   - 실행성
   - 전달성
   - LOW / MEDIUM / HIGH 위험도
   - 필요성 / 금액 산정 / 규정·기준 / 결정권·전결 / 기존 공지·관행 진단
   - 실제 패턴상 우선 질문
2. 그 결과를 **LLM 프롬프트에 제약조건으로 넣어**, 범용 컨설팅 답변이 아니라 팀장에게 실제로 걸릴 가능성이 높은 부분부터 자연스럽게 말하게 합니다.
3. 메신저 / 이메일 톤을 분리합니다.
4. 분석이 충분하면 억지 질문을 만들지 않도록 설계했습니다.

## V1.8에서 바뀐 점

- Claude 버전의 Teams형 UI 유지
- V1.7.1의 6축 판단 로직 이식
- `인과성`, `비례성`, `실행성`을 독립 축으로 평가
- 비용의 **필요성 근거와 산정 근거를 분리**
- 규정·전결·기존 공지/관행 충돌 확인
- 강한 폐지·의무·보류안은 유예/최소통제/단계적 적용이 없으면 비례성 감점
- HIGH 위험도에서만 질문 깊이를 늘림
- 고득점 문서에 KPI/성공지표 질문을 자동으로 붙이지 않음
- 문서 내부의 프롬프트 인젝션 문장을 명령으로 취급하지 않도록 지침 추가
- 파서가 보지 못하는 PPT 배치/색/굵기/이미지를 본 것처럼 지적하지 않도록 제한
- 한 번에 최대 5개 문서 비교 검토
- PDF / PPTX / DOCX / XLSX / TXT / MD / CSV 지원
- Vercel Functions 요청 본문 한도를 고려해 첨부파일 합계 약 4MB로 제한
- 접근 코드 옵션 및 간단한 요청 속도 제한 추가
- OpenAI Responses API 호출 시 `store: false`

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local에 OPENAI_API_KEY 입력
# 배포형이라면 APP_ACCESS_CODE도 설정 권장
npm run dev
```

`http://localhost:3000`

## 환경변수

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
APP_ACCESS_CODE=긴-임의-접근코드
```

- `OPENAI_API_KEY`: 필수
- `OPENAI_MODEL`: 선택. 미설정 시 코드 기본값 `gpt-5`
- `APP_ACCESS_CODE`: 배포 시 강력 권장. 설정하면 첫 화면에서 접근 코드를 요구하고 API 라우트도 같은 코드를 검증합니다.

## Vercel 배포

1. 이 폴더 내용을 GitHub 레포 루트에 업로드
2. Vercel → Add New → Project → 해당 GitHub 레포 Import
3. Environment Variables에 아래 추가
   - `OPENAI_API_KEY`
   - `APP_ACCESS_CODE`
   - 필요 시 `OPENAI_MODEL`
4. Deploy
5. `/api/health`에서 `hasApiKey: true`, `accessProtected: true` 확인

## 보안/데이터 주의

- API Key는 서버 환경변수에서만 사용하며 브라우저 코드에 포함하지 않습니다.
- 앱 자체 DB는 없고 첨부 원문 파일을 서버 DB에 저장하지 않습니다.
- **문서에서 추출된 텍스트는 검토를 위해 OpenAI API로 전송됩니다.** 회사 내부 민감정보는 회사 정책/보안 검토 범위 안에서 사용하세요.
- 브라우저 대화 기록은 `localStorage`에 남습니다. 공용 PC에서는 사용 후 `··· → 대화 초기화`를 권장합니다.
- `APP_ACCESS_CODE`와 인메모리 rate limit은 개인/소규모 배포를 위한 최소 보호입니다. 사내 정식 서비스라면 SSO, 중앙 rate limit, 감사로그, 권한관리 등을 별도로 붙이는 편이 적절합니다.
- Vercel Functions는 요청 본문 크기 제한이 있으므로 이 버전은 첨부 합계를 약 4MB로 제한합니다. 더 큰 문서가 필요하면 추후 Vercel Blob의 client upload 방식으로 바꾸는 편이 적절합니다.
- PPT/PDF/DOCX는 현재 **텍스트 추출 기반**입니다. 시각적 레이아웃·이미지·도형 관계는 분석하지 않습니다.

## 주요 파일

- `lib/persona.js` — 실제 관찰 근거 강도를 반영한 말투/판단 페르소나
- `lib/managerLogic.js` — V1.7.1 기반 6축 판단 엔진
- `lib/docParse.js` — 문서 텍스트 추출
- `lib/serverGuards.js` — 접근 코드 / 기본 rate limit
- `app/api/review/route.js` — 문서 분석 → 규칙엔진 → LLM 응답
- `app/api/chat/route.js` — 일반 대화
- `components/ChatPane.js` — Teams형 UI + 판단 엔진 상세 패널

## 판단 점수 해석

화면의 0~100 점수는 통계적 확률이나 실제 평가점수가 아닙니다. 과거 반응에서 추출한 규칙과 문서 신호가 얼마나 맞물리는지를 나타내는 **패턴 기반 상신 준비도 점수**입니다.
