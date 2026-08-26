const WEIGHTS = {
  facts: 20,
  causality: 20,
  legitimacy: 20,
  proportionality: 15,
  execution: 15,
  communication: 10,
};

const REPORT_TYPE_KEYWORDS = {
  budget: ["예산", "증액", "총액", "견적", "단가", "M/M", "노임", "사업비", "예산안"],
  policy: ["규정", "제도", "지침", "정책", "기준 변경", "운영 기준", "예외", "전결", "정족수", "유예", "취소 기준", "지급 기준"],
  process: ["프로세스", "업무 개선", "자동화", "일원화", "시스템 개편", "챗봇", "개선안", "운영안"],
  people: ["채용", "인사이동", "조직", "퇴직", "징계", "평가", "인력", "임신", "근태"],
};

export const REPORT_TYPE_LABEL = {
  budget: "예산/비용",
  policy: "제도/규정",
  process: "업무 개선/프로세스",
  people: "인원/조직",
  general: "일반 보고",
};

export const BASIS_STATUS_LABEL = {
  good: "확인",
  partial: "보완 필요",
  missing: "누락",
  na: "해당 없음",
};

export const AXIS_LABEL = {
  facts: "사실성",
  causality: "인과성",
  legitimacy: "정당성",
  proportionality: "비례성",
  execution: "실행성",
  communication: "전달성",
};

function normalize(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTerm(text, terms) {
  return terms.reduce((sum, term) => {
    const m = text.match(new RegExp(escapeRegExp(term), "gi"));
    return sum + (m ? m.length : 0);
  }, 0);
}

function findSnippet(raw, terms = [], maxLen = 170) {
  const source = String(raw || "");
  const lower = source.toLowerCase();
  let best = -1;
  for (const term of terms) {
    const idx = lower.indexOf(String(term).toLowerCase());
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  if (best < 0) return "";
  let start = best;
  while (start > 0 && best - start < 90 && !/[\n。.!?]/.test(source[start - 1])) start--;
  let end = best;
  while (end < source.length && end - best < 160 && !/[\n。.!?]/.test(source[end])) end++;
  const clean = source.slice(start, Math.min(source.length, end + 1)).replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
}

function scoreBand(score) {
  if (score >= 82) return "높음";
  if (score >= 65) return "양호";
  if (score >= 50) return "보완 필요";
  return "낮음";
}

function inferReportType(text) {
  const scored = Object.entries(REPORT_TYPE_KEYWORDS).map(([type, kws]) => [type, countTerm(text, kws)]);
  scored.sort((a, b) => b[1] - a[1]);
  return scored[0]?.[1] > 0 ? scored[0][0] : "general";
}

function parseMaxMoney(text) {
  let max = 0;
  const patterns = [
    [/([\d,.]+)\s*억원/g, 100000000],
    [/([\d,.]+)\s*억/g, 100000000],
    [/([\d,.]+)\s*천만원/g, 10000000],
    [/([\d,.]+)\s*백만원/g, 1000000],
    [/([\d,.]+)\s*만원/g, 10000],
    [/([\d,.]+)\s*천원/g, 1000],
    [/([\d,]+)\s*원/g, 1],
  ];
  for (const [re, mult] of patterns) {
    for (const m of text.matchAll(re)) {
      const n = Number(String(m[1]).replace(/,/g, ""));
      if (Number.isFinite(n)) max = Math.max(max, n * mult);
    }
  }
  return max;
}

function clamp(v, min = 15, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function includesAnyText(text = "", terms = []) {
  const source = String(text).toLowerCase();
  return terms.some((term) => source.includes(String(term).toLowerCase()));
}

function extractPrimaryNumber(source = "", preferredUnits = []) {
  const claims = [...String(source).matchAll(/(?:약\s*)?[\d,.]+\s*(?:억원|억|천만원|백만원|만원|천원|원|명|건|회|개월|년|%|M\/M|M)/gi)]
    .map((m) => m[0].replace(/\s+/g, " ").trim());
  if (!claims.length) return "";
  for (const unit of preferredUnits) {
    const hit = claims.find((x) => x.toLowerCase().endsWith(String(unit).toLowerCase()));
    if (hit) return hit;
  }
  return claims.find((x) => !/년$/.test(x)) || claims[0];
}

function extractHeadcountValue(source = "") {
  const direct = [...String(source).matchAll(/(?:예상\s*인원|예상인원|예상\s*증원|증원)[^\d]{0,20}([\d,]+\s*명)/gi)];
  if (direct.length) return direct[direct.length - 1][1].replace(/\s+/g, " ").trim();
  return extractPrimaryNumber(source, ["명"]);
}

function extractLastNumber(source = "", preferredUnits = []) {
  const claims = [...String(source).matchAll(/(?:약\s*)?[\d,.]+\s*(?:억원|억|천만원|백만원|만원|천원|원|명|건|회|개월|년|%|M\/M|M)/gi)]
    .map((m) => m[0].replace(/\s+/g, " ").trim());
  if (!claims.length) return "";
  for (const unit of preferredUnits) {
    const hits = claims.filter((x) => x.toLowerCase().endsWith(String(unit).toLowerCase()));
    if (hits.length) return hits[hits.length - 1];
  }
  return claims[claims.length - 1];
}

// 핵심 숫자의 "부모 근거"까지 추적한다.
// 숫자/산식이 존재하는지보다 왜 그 입력값을 선택했는지를 확인하는 휴리스틱이다.
function extractAssumptionTrace(raw = "") {
  const chunks = String(raw)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const items = [];
  const push = (item) => {
    const key = `${item.type}:${item.value || item.snippet}`;
    if (!items.some((x) => x._key === key)) items.push({ ...item, _key: key });
  };

  for (let i = 0; i < chunks.length; i++) {
    const sentence = chunks[i];
    if (!/\d/.test(sentence)) continue;
    if (includesAnyText(sentence, ["삭제", "제외", "반영하지", "미반영", "제거", "삭제함", "제외함"])) continue;
    const context = [chunks[i - 1], sentence, chunks[i + 1]].filter(Boolean).join(" ");
    let value = extractPrimaryNumber(sentence);

    const isHeadcount = /[\d,.]+\s*명/.test(sentence) && includesAnyText(sentence, ["증원", "예상 인원", "예상인원", "인원 증가", "인원증가", "인력 증가", "인력증가"]);
    const isVariability = includesAnyText(sentence, ["추가 편성", "추가편성", "월평균 대비", "변동성", "여유", "버퍼", "상한 여유"]) || (includesAnyText(sentence, ["월평균"]) && includesAnyText(sentence, ["대비", "기준으로 편성", "편성"]));
    const isHighCostBuffer = includesAnyText(sentence, ["고액", "예비비", "변동 가능성", "변동가능성"]);
    const isUplift = includesAnyText(sentence, ["상향", "증액", "증가율", "인상률"]);
    const isForecast = includesAnyText(sentence, ["가정", "추정", "전망"]) || (includesAnyText(sentence, ["예상"]) && includesAnyText(sentence, ["가정", "산정 기준", "편성 기준", "추정 기준"]));
    if (!(isHeadcount || isVariability || isHighCostBuffer || isUplift || isForecast) || !value) continue;

    let type = "";
    let status = "partial";
    let reason = "";

    if (isHeadcount) {
      value = extractHeadcountValue(sentence);
      type = "인원 가정";
      const strong = /(인력\s*계획|채용\s*계획|정원|전년도.{0,30}예상\s*인원|예산.{0,30}예상\s*인원|과거.{0,20}순증|확정.{0,20}인원|계획.{0,20}인원)/i.test(context);
      const partial = /(현재\s*인원|현원|재직|휴직|대비|증가\s*수준)/i.test(context);
      status = strong ? "good" : partial ? "partial" : "missing";
      reason = strong
        ? "전년도/확정 인력계획 등 인원 가정의 상위 기준이 연결되어 있음"
        : partial
          ? "현재 인원과의 비교는 있으나 왜 그 목표 인원인지 상위 계획 근거가 충분히 보이지 않음"
          : "왜 그 인원수를 가정했는지 인력계획·과거 순증 등 상위 근거가 확인되지 않음";
    } else if (isVariability) {
      value = includesAnyText(sentence, ["대비"])
        ? extractLastNumber(sentence, ["억원", "천만원", "백만원", "만원", "천원", "원", "%"])
        : extractPrimaryNumber(sentence, ["억원", "천만원", "백만원", "만원", "천원", "원", "%"]);
      type = "변동성 버퍼";
      const strong = /(\b9[05]\s*%|백분위|퍼센타일|중앙값|표준편차|최근\s*\d+\s*(?:개월|년).{0,50}(?:분포|실적)|상위\s*\d+\s*%|P\d{2})/i.test(context);
      const partial = /(월별|범위|최대|최소|변동|고액|최근|실적|평균)/i.test(context);
      status = strong ? "good" : partial ? "partial" : "missing";
      reason = strong
        ? "최근 실적 분포·백분위·중앙값 등으로 버퍼 규모를 정한 기준이 연결되어 있음"
        : partial
          ? "변동성이 있다는 근거는 있으나 왜 정확히 그 추가 금액인지 선택 규칙이 닫히지 않음"
          : "추가 편성/버퍼 금액의 크기를 정한 통계·실적 기준이 확인되지 않음";
    } else if (isHighCostBuffer) {
      value = extractPrimaryNumber(sentence, ["억원", "천만원", "백만원", "만원", "천원", "원"]);
      type = "고액·예비비 가정";
      const strong = /(발생\s*빈도|발생빈도|최근\s*\d+\s*년.{0,40}\d+\s*건|평균\s*\d+(?:\.\d+)?\s*건|연간\s*\d+(?:\.\d+)?\s*건|과거.{0,30}건수)/i.test(context);
      const partial = /(최근|과거|실적|발생\s*건수|건수)/i.test(context);
      status = strong ? "good" : partial ? "partial" : "missing";
      reason = strong
        ? "과거 발생빈도·건수로 고액 변동분의 규모가 연결되어 있음"
        : partial
          ? "과거 발생 단서는 있으나 해당 금액 규모까지 이어지는 빈도·금액 산식이 약함"
          : "고액 발생 가능성만 제시되어 있고 왜 그 금액인지 발생빈도·과거 실적 근거가 없음";
    } else if (isUplift || isForecast) {
      value = extractPrimaryNumber(sentence, ["%", "억원", "천만원", "백만원", "만원", "천원", "원", "명"]);
      type = isUplift ? "상향률·증가 가정" : "추정 가정";
      const strong = /(전년.{0,25}증가율|최근.{0,25}증가율|실적.{0,25}추세|과거.{0,25}추세|백분위|퍼센타일|\b9[05]\s*%|계획.{0,25}기준|견적.{0,25}기준)/i.test(context);
      const partial = /(전년|최근|과거|실적|평균|대비|추세|계획|견적)/i.test(context);
      status = strong ? "good" : partial ? "partial" : "missing";
      reason = strong
        ? "상향/추정값을 정한 과거 추세·계획·실적 기준이 연결되어 있음"
        : partial
          ? "참고 실적은 있으나 왜 그 비율·금액을 선택했는지 한 단계 더 설명할 필요가 있음"
          : "상향/추정값의 출처가 확인되지 않음";
    } else {
      continue;
    }

    push({ type, value, status, reason, snippet: sentence });
  }

  const cleaned = items.slice(0, 8).map(({ _key, ...item }) => item);
  const gaps = cleaned.filter((x) => x.status !== "good");
  const missing = cleaned.filter((x) => x.status === "missing");
  const good = cleaned.filter((x) => x.status === "good");
  return {
    relevant: cleaned.length > 0,
    items: cleaned,
    gaps,
    missing,
    good,
    score: cleaned.length ? Math.round((good.length + (cleaned.length - good.length - missing.length) * 0.5) / cleaned.length * 100) : 100,
  };
}


export const DOCUMENT_STAGE_LABEL = {
  concept: "기획·방향성 검토",
  direction_approval: "방향성 승인",
  execution: "실행계획",
  financial_approval: "예산·투자 승인",
  final: "최종 상신",
  working: "일반 검토",
};

function inferDocumentStage(text, c, reportType) {
  const source = String(text || "");
  const concept = countTerm(source, ["검토배경", "검토 배경", "추진 방향", "추진방향", "방향성", "구성(안)", "운영(안)", "사업화 추진 방향", "중점 추진과제", "중장기", "로드맵", "기획안", "초안"]);
  const execution = countTerm(source, ["실행계획", "실행 계획", "세부 일정", "운영 계획", "운영계획", "WBS", "발주", "계약", "시행", "오픈", "담당", "착수", "이행"]);
  const approval = countTerm(source, ["승인 요청", "의사결정 요청", "결재 요청", "확정 요청", "진행 승인", "승인받", "결정 요청"]);
  const financialApproval = countTerm(source, ["예산 승인", "투자 승인", "집행 승인", "예산 확정", "투자비 승인", "집행 결재"]);
  const final = countTerm(source, ["최종 상신", "최종안", "최종 보고", "상신본", "결재 상신"]);

  if (financialApproval > 0) {
    return { key: "financial_approval", label: DOCUMENT_STAGE_LABEL.financial_approval, reason: "금액 집행·투자 판단을 직접 요청하는 단계로 감지되었습니다.", evidenceLevel: "산식·가정·재무근거까지 현재 단계에서 확인" };
  }
  if (final > 0) {
    return { key: "final", label: DOCUMENT_STAGE_LABEL.final, reason: "최종 결재·상신을 전제로 한 문서로 감지되었습니다.", evidenceLevel: "핵심 근거와 실행조건이 닫혀 있어야 함" };
  }
  if (approval > 0) {
    return { key: "direction_approval", label: DOCUMENT_STAGE_LABEL.direction_approval, reason: "방향 또는 진행 여부에 대한 의사결정을 요청하는 단계로 감지되었습니다.", evidenceLevel: "결정 범위·핵심 근거 중심" };
  }
  // 기획자료는 뒤쪽에 일정·조직안이 있어도 '검토배경/추진방향/구성안'이 반복되면 실행승인 문서로 끌어올리지 않습니다.
  if (concept >= 2 && concept >= Math.max(2, Math.floor(execution / 2))) {
    return { key: "concept", label: DOCUMENT_STAGE_LABEL.concept, reason: "현재는 방향·구조를 설계하고 검토하는 기획 단계로 감지되었습니다.", evidenceLevel: "필요성·방향·큰 구조까지만 우선 확인" };
  }
  if (execution >= 4 && (c.owner >= 1 || c.schedule >= 2 || c.operations >= 3)) {
    return { key: "execution", label: DOCUMENT_STAGE_LABEL.execution, reason: "담당·일정·운영방법이 구체화된 실행계획 단계로 감지되었습니다.", evidenceLevel: "담당·일정·비용·예외 등 실행조건 확인" };
  }
  return { key: "working", label: DOCUMENT_STAGE_LABEL.working, reason: "특정 승인 게이트보다 일반적인 업무 검토 단계로 감지되었습니다.", evidenceLevel: reportType === "budget" ? "비용 산정근거까지 확인" : "현재 쟁점에 필요한 근거만 확인" };
}

export const JUN_DEPTH_LABEL = {
  0: "L0 · 바로 실행/수용",
  1: "L1 · 간단 확인",
  2: "L2 · 기준·원인 확인",
  3: "L3 · 리스크·대안 심층 검토",
};

const QUESTION_DEPTH = {
  "목적/문제": 1,
  사실성: 1,
  "팩트/의견": 2,
  인과성: 2,
  "가정 추적": 3,
  "금액 산정": 2,
  "규정/기준": 2,
  "운영 기준": 2,
  "전결/책임": 3,
  "판단 주체": 2,
  설명가능성: 3,
  일관성: 2,
  비례성: 2,
  실행성: 1,
  리스크: 3,
  대안: 3,
  "적용 일정": 2,
  선조치: 1,
  전달성: 1,
  "초견 이해도": 1,
};

function patternStrengthLabel(score) {
  if (score >= 88) return "강함";
  if (score >= 76) return "중간";
  return "약함";
}

function inferJunDepth(text, c, reportType, documentStage, maxMoney) {
  let level = 1; // 최근 실제 대화 기준 기본값: 먼저 한두 가지를 간단히 확인
  const up = [];
  const down = [];
  const specificRisk = countTerm(text, ["형평성", "어뷰징", "오남용", "개인정보", "정보보안", "민감정보", "위약", "규정 위반", "예외 적용"]);
  const explicitRule = countTerm(text, ["규정", "지침", "전결", "결재선", "지급 기준", "운영 기준", "취업규칙"]);
  const simpleOps = countTerm(text, ["명함", "인쇄", "발송", "배송", "주문", "구매", "수량", "회의 시간", "미팅 시간", "샘플", "전달", "공지 크기", "글씨 크기"]);
  const concreteProposal = countTerm(text, ["개인적으로는", "제안드립니다", "제안 드립니다", "방식이 더", "하는 방식", "협조하는 방식", "역할상", "이 방향으로", "해당 방향으로", "검토 부탁"]);

  if (reportType === "budget" || maxMoney >= 10000000) {
    level += 1;
    up.push("금액·산정 판단");
  }
  if (reportType === "budget" && c.assumption >= 2 && c.assumptionSource < c.assumption) {
    level += 1;
    up.push("근거가 덜 닫힌 핵심 가정값 다수");
  }
  if (reportType === "policy" || explicitRule >= 1) {
    level += 1;
    up.push("규정·기준");
  }
  if (specificRisk >= 1) {
    level += 1;
    up.push("형평성·보안·오남용 리스크");
  }
  if (c.companyWide >= 1) {
    level += 1;
    up.push("전사 영향");
  }
  if (reportType === "process" && c.techChange >= 2) {
    level += 1;
    up.push("새 시스템·프로세스");
  }
  if (documentStage?.key === "financial_approval") {
    level = Math.max(level, 2);
    up.push("예산·투자 승인 단계");
  }

  // 단순 운영 건은 깊게 분석하기보다 현재 자원으로 처리 가능한지 먼저 봅니다.
  if (simpleOps >= 2 && !specificRisk && reportType !== "budget" && reportType !== "policy") {
    level -= 1;
    down.push("단순·가역적 운영 업무");
  }
  // 담당자가 현실적인 대안까지 설명한 경우 추가 검증보다 수용/실행 쪽으로 한 단계 낮춥니다.
  if (concreteProposal >= 2 && c.fallback >= 1 && specificRisk === 0) {
    level -= 1;
    down.push("담당자가 현실적 대안까지 제시");
  }
  if (c.uncertainty === 0 && c.risk === 0 && c.operations >= 2 && c.owner >= 1 && c.schedule >= 1) {
    level -= 1;
    down.push("운영 조건이 이미 비교적 닫힘");
  }

  level = Math.max(0, Math.min(3, level));
  return {
    level,
    label: JUN_DEPTH_LABEL[level],
    baseline: "L1 · 간단 확인",
    escalators: [...new Set(up)],
    deescalators: [...new Set(down)],
    reason: level <= 1
      ? "최근 실제 반응처럼 먼저 짧게 확인하거나 바로 실행 가능한 안을 봅니다."
      : level === 2
        ? "비용·기준·형평성·새 프로세스가 걸려 있어 이유와 기준까지 한 단계 더 확인합니다."
        : "규정·금액·형평성·보안 등 영향이 겹쳐 리스크와 대안까지 깊게 확인할 가능성이 높습니다.",
  };
}

function junSimilarity(rule, reportType, stageKey, junDepth) {
  // 숫자는 내부 랭킹에만 쓰고 UI에서는 확률처럼 보이지 않게 강/중/약으로 노출합니다.
  const base = {
    "목적/문제": 84, 사실성: 88, "팩트/의견": 86, 인과성: 82,
    "가정 추적": 67, "금액 산정": 84, "규정/기준": 82, "운영 기준": 86, "전결/책임": 52,
    "판단 주체": 64, 설명가능성: 58, 일관성: 76, 비례성: 80, 실행성: 88,
    리스크: 60, 대안: 55, "적용 일정": 62, 선조치: 86, 전달성: 88, "초견 이해도": 90,
  }[rule] || 60;
  let score = base;
  if (reportType === "budget" && ["가정 추적", "금액 산정", "설명가능성"].includes(rule)) score += 18;
  if (reportType === "policy" && ["규정/기준", "판단 주체", "일관성", "전결/책임"].includes(rule)) score += 14;
  if (reportType === "people" && ["팩트/의견", "사실성", "초견 이해도"].includes(rule)) score += 8;
  if (reportType === "process" && ["목적/문제", "인과성", "실행성", "비례성", "초견 이해도", "운영 기준"].includes(rule)) score += 10;
  if (stageKey === "concept" && ["가정 추적", "금액 산정", "설명가능성", "리스크", "대안", "적용 일정", "전결/책임"].includes(rule)) score -= 30;
  if (stageKey === "financial_approval" && ["가정 추적", "금액 산정", "설명가능성"].includes(rule)) score += 12;

  const qDepth = QUESTION_DEPTH[rule] ?? 2;
  const currentDepth = junDepth?.level ?? 1;
  if (qDepth === Math.max(1, currentDepth)) score += 7;
  if (qDepth > Math.max(1, currentDepth)) score -= 22 * (qDepth - Math.max(1, currentDepth));
  return Math.max(20, Math.min(99, score));
}

function filterJunQuestions(questions, reportType, documentStage, junDepth) {
  const stageKey = documentStage?.key || "working";
  const conceptAllowed = new Set(["목적/문제", "사실성", "팩트/의견", "인과성", "판단 주체", "전달성", "초견 이해도"]);
  const directionAllowed = new Set(["목적/문제", "사실성", "팩트/의견", "인과성", "규정/기준", "운영 기준", "판단 주체", "전결/책임", "일관성", "실행성", "전달성", "초견 이해도"]);
  const allowed = stageKey === "concept" ? conceptAllowed : stageKey === "direction_approval" ? directionAllowed : null;
  const maxDepth = Math.max(1, junDepth?.level ?? 1);

  const ranked = questions
    .map((q) => {
      const score = junSimilarity(q.rule, reportType, stageKey, junDepth);
      const questionDepth = QUESTION_DEPTH[q.rule] ?? 2;
      return { ...q, junSimilarity: score, patternStrength: patternStrengthLabel(score), questionDepth };
    })
    .filter((q) => q.questionDepth <= maxDepth)
    .filter((q) => {
      if (!allowed) return true;
      if (allowed.has(q.rule)) return true;
      if (reportType === "budget" && ["가정 추적", "금액 산정"].includes(q.rule)) return true;
      return false;
    })
    .filter((q) => q.junSimilarity >= 70)
    .sort((a, b) => b.junSimilarity - a.junSimilarity || a.questionDepth - b.questionDepth);

  if ((junDepth?.level ?? 1) === 0) return [];
  const limit = (junDepth?.level ?? 1) === 1 ? 1 : 2;
  return ranked.slice(0, limit);
}

export function analyzeDocument(rawText, note = "") {
  const raw = `${rawText || ""}\n${note || ""}`;
  const text = normalize(raw);
  const reportType = inferReportType(text);
  const maxMoney = parseMaxMoney(text);
  const quantified = (text.match(/\d[\d,.]*(?:\s?%|\s?원|\s?명|\s?건|\s?회|\s?개월|\s?년|\s?M\/M|\s?억|\s?만원|\s?천원|\s?시간|\s?일|\s?주)/gi) || []).length;
  const numberedSections = (raw.match(/(?:^|\n)\s*(?:\d+[.)]|[■□▪▸●○])\s*/gm) || []).length;

  const c = {
    current: countTerm(text, ["현재", "현행", "기존", "운영 현황", "현황", "실제", "최근", "누적", "평균"]),
    evidence: countTerm(text, ["확인", "자료", "데이터", "분석", "조사", "결과", "기록", "이력", "비교", "대비", "근거"]),
    problem: countTerm(text, ["문제", "한계", "비효율", "어려움", "저하", "반복", "수작업", "부족", "이슈", "미흡", "파악 불가", "확인 불가", "오류", "불편", "공백", "어렵", "괴리"]),
    causal: countTerm(text, ["원인", "이유", "때문", "으로 인해", "로 인해", "초래", "발생", "기인", "배경", "왜"]),
    solution: countTerm(text, ["개선", "변경", "전환", "도입", "신설", "정비", "자동화", "일원화", "표준화", "폐지", "완화", "확대", "축소"]),
    effect: countTerm(text, ["효과", "감소", "증가", "향상", "절감", "효율", "안정", "정확도", "편의", "활용"]),
    moneyBasis: countTerm(text, ["단가", "인당", "회당", "수량", "산식", "견적", "노임", "M/M", "맨먼스", "기준으로 산정", "×", "곱하기"]),
    statisticalBasis: countTerm(text, ["백분위", "퍼센타일", "중앙값", "표준편차", "95%", "90%", "최근 실적", "실적 분포", "월평균", "최근 19개월", "최근 12개월", "최근 24개월"]),
    principle: countTerm(text, ["규정", "지침", "전결", "조항", "규칙", "원칙", "지급 기준", "운영 기준", "취업규칙", "법", "정책"]),
    authority: countTerm(text, ["전결", "승인권자", "결재선", "부문장", "본부장", "대표", "상무", "최종 의사결정", "결정권자", "합의선", "승인"]),
    history: countTerm(text, ["관행", "기존부터", "예전부터", "과거", "이전", "히스토리", "전례", "선례", "누가 의사결정", "왜 폐지", "왜 이후"]),
    commitment: countTerm(text, ["공지", "안내", "약속", "기존 공지", "이미 공지", "사전 안내", "안내문", "기존 기준"]),
    operations: countTerm(text, ["프로세스", "절차", "담당", "운영", "신청", "처리", "접수", "제출", "일괄", "시행", "적용", "업무 처리"]),
    owner: countTerm(text, ["담당자", "인사운영팀", "DX팀", "총무팀", "운영진", "업체", "담당 부서", "담당 매니저", "오너"]),
    schedule: countTerm(text, ["일정", "시행일", "오픈", "단계", "기간", "예정", "월 중", "월부터", "주차", "분기", "파일럿", "시범", "정례", "마감"]),
    fallback: countTerm(text, ["대안", "플랜B", "불가능 시", "어려울 경우", "대체", "1안", "2안", "3안", "조건부", "재검토", "다른 방안"]),
    risk: countTerm(text, ["리스크", "예외", "보안", "어뷰징", "오류", "불가", "제한", "위약", "민감", "개인정보", "충돌", "형평성", "오남용", "실패", "중복"]),
    control: countTerm(text, ["의무", "강제", "보류", "폐지", "취소", "제재", "금지", "중단", "즉시", "제외", "제한", "미제출 시", "반려", "전면 통제"]),
    severeControl: countTerm(text, ["유예 불가", "즉시 폐지", "취소 처리", "미제출 시", "지원금 보류", "활동 인증 의무화", "의무화", "즉시 취소"]),
    mitigation: countTerm(text, ["유예", "단계별", "시범", "파일럿", "완화", "예외", "조건부", "최소한", "자율", "현황 확인", "기한 부여", "소명", "사전 안내", "점진", "보완 후"]),
    balance: countTerm(text, ["단계별", "파일럿", "시범", "완화", "조건부", "최소한", "현황 확인 후", "점진", "책임범위", "명백한 이상", "자율 운영 유지", "유예 기간", "기한 부여"]),
    decision: countTerm(text, ["검토 부탁", "의견", "결정", "승인 요청", "승인", "확정", "진행해도", "의사결정 요청", "보고드립니다"]),
    summary: countTerm(text, ["결론", "결과요약", "결과 요약", "보고 개요", "핵심", "요약", "검토 의견", "주요 변경 사항"]),
    headings: countTerm(text, ["보고 개요", "현황 및 한계", "현황 진단", "주요 운영 이슈", "개선 방향", "개선(안)", "운영(안)", "운영 기준", "주요 변경 사항", "단계별 추진 일정", "향후 추진 일정", "검토 의견", "결과요약", "기대효과", "주요 효과"]),
    asis: countTerm(text, ["AS-IS", "AS IS", "현행"]),
    tobe: countTerm(text, ["TO-BE", "TO BE", "개선 후"]),
    companyWide: countTerm(text, ["전사", "전 직원", "전 임직원", "전체 임직원", "공통 적용", "모든 구성원"]),
    sensitive: countTerm(text, ["민감", "개인정보", "보상", "연봉", "징계", "평가결과", "다면평가", "보안", "SSO", "권한", "정보보안"]),
    peopleImpact: countTerm(text, ["구성원", "직원", "임직원", "근로자", "휴가", "경조", "복리후생", "지급", "퇴직", "임신부", "정족수"]),
    techChange: countTerm(text, ["AI", "챗봇", "Chat Bot", "ChatBot", "시스템", "자동화", "API", "연동", "웹뷰", "SSO", "DB", "데이터베이스"]),
    assumption: countTerm(text, ["가정", "추정", "예상", "전망", "상향", "추가 편성", "추가편성", "여유", "버퍼", "변동 가능성", "변동가능성"]),
    assumptionSource: countTerm(text, ["전년도", "전년", "최근", "과거", "실적", "인력계획", "인력 계획", "채용계획", "채용 계획", "발생빈도", "발생 빈도", "백분위", "퍼센타일", "중앙값", "표준편차", "95%", "90%"]),
    factLanguage: countTerm(text, ["팩트", "사실", "확인 결과", "확인된", "실제", "기록상", "이력상", "대조", "검증"]),
    opinionLanguage: countTerm(text, ["의견", "제 생각", "생각에는", "보입니다", "것 같습니다", "같습니다", "추정", "가능성", "애매", "판단됩니다"]),
    decisionTrace: countTerm(text, ["왜 반영", "왜 삭감", "반영 기준", "미반영 기준", "검토 기준", "검토 근거", "산정 사유", "근거를 남", "설명 가능", "설명할 수", "역산", "우선순위", "법적", "필수 비용"]),
    immediateAction: countTerm(text, ["바로 처리", "즉시 처리", "먼저 조치", "조치 완료", "완료 상태", "바로 완료", "즉시 완료", "선조치", "우선 처리"]),
    planOnly: countTerm(text, ["계획서 제출", "계획 수립", "추후 조치", "향후 조치", "예정입니다", "예정으로", "보고 예정", "제출 예정"]),
    uncertainty: countTerm(text, ["검토 중", "검토중", "확인 필요", "추가 확인", "미확인", "미결정", "확정되지", "시안", "샘플", "애매", "조금 더 봐", "보고 싶"]),
    userChoice: countTerm(text, ["본인이 원하는", "본인 선택", "선택권", "당사자 선택", "희망", "선호", "원하는 걸", "원하는 것"]),
    usageFrequency: countTerm(text, ["매일", "매주", "월 1회", "반기", "1년에", "연 1회", "상시", "필요 시", "기간을 정", "사용 빈도", "사용량"]),
    futureOperation: countTerm(text, ["향후", "급여", "권한", "사용이력", "사용 이력", "추적", "연동", "자동화", "운영 구조", "재신청", "기간을 정"]),
    readerFlow: countTerm(text, ["1단계", "2단계", "3단계", "STEP", "프로세스", "절차", "진행 방식", "진행방식", "평가 절차", "관리 절차", "흐름", "순서", "→"]),
    exampleDetail: countTerm(text, ["사례", "예시", "실제 사례", "적용 사례", "화면 예시", "시나리오", "Case", "CASE", "예를 들어"]),
    readerCue: countTerm(text, ["처음 보는", "이해하기", "이해할 수", "쉽게 이해", "한눈에", "설명", "상세히", "상세하게"]),
  };

  const documentStage = inferDocumentStage(text, c, reportType);
  const junDepth = inferJunDepth(text, c, reportType, documentStage, maxMoney);

  const asisTobe = c.asis > 0 && c.tobe > 0;
  const highControl = c.control >= 3 || c.severeControl >= 1;
  const hasMitigation = c.mitigation >= 1;
  const structured = c.headings >= 2 || numberedSections >= 4;

  let riskScore = 0;
  if (reportType === "policy") riskScore += 3;
  if (reportType === "people") riskScore += 2;
  if (reportType === "process") riskScore += 2;
  if (reportType === "budget") riskScore += 1;
  if (maxMoney >= 1000000000) riskScore += 3;
  else if (maxMoney >= 100000000) riskScore += 2;
  else if (maxMoney >= 10000000) riskScore += 1;
  if (c.companyWide >= 1) riskScore += 2;
  if (c.sensitive >= 2) riskScore += 2;
  if (reportType === "process" && c.techChange >= 2) riskScore += 1;
  if (c.peopleImpact >= 4 && ["policy", "people"].includes(reportType)) riskScore += 1;
  if (highControl) riskScore += 1;
  if (c.authority >= 2 || c.principle >= 3) riskScore += 1;
  const riskLevel = riskScore >= 5 ? "HIGH" : riskScore >= 3 ? "MEDIUM" : "LOW";

  const moneyDecision = reportType === "budget" || maxMoney >= 10000000 || (reportType === "policy" && countTerm(text, ["지원금", "지급액", "비용", "예산"]) >= 1);
  const necessityGood = c.problem >= 2 && c.causal >= 1 && quantified >= 2;
  const monetaryGood = !moneyDecision || ((c.moneyBasis >= 2 || c.statisticalBasis >= 2) && quantified >= 4);
  const ruleRelevant = reportType === "policy" || c.principle > 0;
  const ruleGood = !ruleRelevant || c.principle >= 2;
  const authorityRelevant = riskLevel !== "LOW" || c.authority > 0;
  const authorityGood = !authorityRelevant || c.authority >= 1;
  const consistencyRelevant = ["policy", "process"].includes(reportType) && c.solution >= 2;
  const consistencyGood = !consistencyRelevant || c.commitment >= 1 || c.history >= 2;
  const assumptionTrace = extractAssumptionTrace(raw);
  const assumptionTraceRelevant = moneyDecision && assumptionTrace.relevant;
  const assumptionTraceGood = !assumptionTraceRelevant || assumptionTrace.gaps.length === 0;
  const defensibilityRelevant = moneyDecision || reportType === "people" || c.decision >= 1;
  const defensibilityGood = !defensibilityRelevant || c.decisionTrace >= 1 || (c.evidence >= 3 && (monetaryGood || ruleGood || authorityGood));
  const factOpinionRelevant = c.opinionLanguage >= 1 || ["people", "policy"].includes(reportType);
  const factOpinionGood = !factOpinionRelevant || c.factLanguage >= 1 || c.evidence >= 3;
  // 최근 실제 대화에서는 단순 검토 요청만으로 전결/판단주체를 묻지 않았습니다.
  // 규정·당사자 선택·R&R·명시적 승인선이 걸린 경우에만 이 축을 강하게 켭니다.
  const explicitOwnershipCue = countTerm(text, ["R&R", "역할", "책임", "담당 주체", "누가 결정", "의사결정권자", "전결", "결재선", "승인권자"]);
  const decisionOwnershipRelevant = c.authority >= 1 || c.userChoice >= 1 || explicitOwnershipCue >= 1 || reportType === "policy" || (reportType === "people" && c.principle >= 1);
  const decisionOwnershipGood = !decisionOwnershipRelevant || c.authority >= 1 || c.userChoice >= 1 || c.owner >= 1;
  const authorityQuestionRelevant = reportType === "policy" || explicitOwnershipCue >= 1 || (c.companyWide >= 1 && c.principle >= 1);
  const actNowRelevant = ["process", "policy"].includes(reportType) || c.planOnly >= 1 || c.immediateAction >= 1;
  const actNowGood = !actNowRelevant || c.immediateAction >= 1 || c.uncertainty >= 1 || c.schedule >= 2;
  const readerClarityRelevant = c.techChange >= 1 || countTerm(text, ["신규 제도", "평가 프로세스", "JD 평가", "플랫폼", "DNA LAB", "시스템 도입", "신규 시스템", "서비스 소개"]) >= 2;
  const readerClarityGood = !readerClarityRelevant || (c.readerFlow >= 2 && (c.exampleDetail >= 1 || c.operations >= 5)) || c.readerCue >= 2;

  const scores = {
    facts: 22,
    causality: 20,
    legitimacy: 25,
    proportionality: 68,
    execution: 22,
    communication: 25,
  };

  if (quantified >= 2) scores.facts += 12;
  if (quantified >= 6) scores.facts += 10;
  if (c.current >= 3) scores.facts += 12;
  if (c.problem >= 2) scores.facts += 10;
  if (c.evidence >= 3) scores.facts += 12;
  if (c.history >= 2 || c.commitment >= 1) scores.facts += 8;
  if (structured) scores.facts += 6;

  if (c.problem >= 2) scores.causality += 16;
  if (c.causal >= 1) scores.causality += 14;
  if (c.causal >= 3) scores.causality += 8;
  if (c.problem >= 2 && c.causal >= 1 && quantified >= 2) scores.causality += 18;
  if (c.effect >= 2) scores.causality += 8;
  if (c.history >= 1) scores.causality += 5;

  if (necessityGood) scores.legitimacy += 13;
  if (c.evidence >= 3) scores.legitimacy += 7;
  if (c.history >= 2) scores.legitimacy += 7;
  if (c.authority >= 1) scores.legitimacy += 8;
  if (c.principle >= 1) scores.legitimacy += 8;
  if (consistencyRelevant && consistencyGood) scores.legitimacy += 8;
  if (moneyDecision && c.moneyBasis >= 2) scores.legitimacy += 14;
  if (moneyDecision && c.moneyBasis >= 4) scores.legitimacy += 8;
  if (moneyDecision && c.statisticalBasis >= 2) scores.legitimacy += 12;
  if (assumptionTraceRelevant && assumptionTraceGood) {
    scores.legitimacy += 10;
    scores.facts += 4;
  }
  if (assumptionTraceRelevant && assumptionTrace.gaps.length) {
    scores.legitimacy -= Math.min(18, 6 + assumptionTrace.gaps.length * 3);
    scores.causality -= Math.min(12, assumptionTrace.gaps.length * 3);
  }
  if (reportType === "process" && necessityGood) scores.legitimacy += 10;
  if (reportType === "process" && asisTobe) scores.legitimacy += 8;
  if (reportType === "policy" && c.principle >= 2) scores.legitimacy += 12;
  if (reportType === "policy" && c.authority >= 1) scores.legitimacy += 8;
  if (defensibilityRelevant && defensibilityGood) scores.legitimacy += 7;
  if (defensibilityRelevant && !defensibilityGood) scores.legitimacy -= 7;
  if (factOpinionRelevant && factOpinionGood) scores.facts += 5;
  if (factOpinionRelevant && !factOpinionGood) scores.facts -= 5;

  if (highControl && !hasMitigation) scores.proportionality -= 30;
  if (highControl && c.mitigation === 1 && c.control >= 4) scores.proportionality -= 14;
  if (highControl && c.balance >= 1) scores.proportionality += 8;
  if (c.balance >= 2) scores.proportionality += 8;
  if (c.risk >= 2) scores.proportionality += 7;
  if (c.fallback >= 1) scores.proportionality += 5;
  if (reportType === "policy" && c.principle >= 1 && c.mitigation === 0) scores.proportionality -= 8;
  if (c.control === 0 && riskLevel === "LOW") scores.proportionality += 8;

  if (c.operations >= 3) scores.execution += 18;
  if (c.owner >= 1) scores.execution += 14;
  if (c.owner >= 3) scores.execution += 6;
  if (c.schedule >= 2) scores.execution += 16;
  if (c.schedule >= 5) scores.execution += 6;
  if (c.fallback >= 1) scores.execution += 8;
  if (c.mitigation >= 1) scores.execution += 6;
  if (asisTobe) scores.execution += 6;
  if (actNowRelevant && actNowGood) scores.execution += 6;
  if (actNowRelevant && c.planOnly >= 1 && c.immediateAction === 0 && c.uncertainty === 0) scores.execution -= 8;

  if (c.summary >= 1) scores.communication += 16;
  if (c.headings >= 2) scores.communication += 14;
  if (structured) scores.communication += 10;
  if (c.decision >= 1) scores.communication += 12;
  if (asisTobe) scores.communication += 8;
  if (c.effect >= 2) scores.communication += 7;

  if (["process", "budget"].includes(reportType) && quantified < 2) scores.facts = Math.min(scores.facts, 55);
  if (["process", "policy"].includes(reportType) && c.problem < 2) scores.facts = Math.min(scores.facts, 58);
  if (["process", "policy"].includes(reportType) && c.causal < 1) scores.causality = Math.min(scores.causality, 55);
  if (c.problem >= 2 && c.solution >= 3 && c.causal < 1) scores.causality = Math.min(scores.causality, 48);
  if (moneyDecision && c.moneyBasis < 2 && c.statisticalBasis < 2) scores.legitimacy = Math.min(scores.legitimacy, 48);
  if (assumptionTraceRelevant && assumptionTrace.missing.length >= 1) scores.legitimacy = Math.min(scores.legitimacy, 56);
  else if (assumptionTraceRelevant && assumptionTrace.gaps.length >= 2) scores.legitimacy = Math.min(scores.legitimacy, 62);
  if (assumptionTraceRelevant && assumptionTrace.gaps.length >= 2) scores.causality = Math.min(scores.causality, 68);
  if (reportType === "policy" && c.principle < 1) scores.legitimacy = Math.min(scores.legitimacy, 48);
  if (reportType === "policy" && riskLevel === "HIGH" && c.authority < 1) scores.legitimacy = Math.min(scores.legitimacy, 55);
  if (defensibilityRelevant && !defensibilityGood && riskLevel !== "LOW") scores.legitimacy = Math.min(scores.legitimacy, 64);
  if (decisionOwnershipRelevant && !decisionOwnershipGood && ["policy", "people"].includes(reportType)) scores.legitimacy = Math.min(scores.legitimacy, 62);
  if (consistencyRelevant && riskLevel !== "LOW" && !consistencyGood) scores.legitimacy = Math.min(scores.legitimacy, 60);
  if (highControl && !hasMitigation) scores.proportionality = Math.min(scores.proportionality, 42);
  if (highControl && c.control >= 4 && c.balance === 0) scores.proportionality = Math.min(scores.proportionality, 50);
  if (c.severeControl >= 2 && c.balance < 2) scores.proportionality = Math.min(scores.proportionality, 52);
  if (riskLevel === "HIGH" && c.risk < 1) scores.proportionality = Math.min(scores.proportionality, 55);
  if (["process", "policy"].includes(reportType) && c.owner < 1) scores.execution = Math.min(scores.execution, 58);
  if (["process", "policy"].includes(reportType) && c.schedule < 2) scores.execution = Math.min(scores.execution, 58);

  Object.keys(scores).forEach((k) => (scores[k] = clamp(scores[k])));

  const thresholds = riskLevel === "HIGH"
    ? { facts: 65, causality: 65, legitimacy: 70, proportionality: 60, execution: 60, communication: 55 }
    : riskLevel === "MEDIUM"
      ? { facts: 60, causality: 60, legitimacy: 60, proportionality: 55, execution: 55, communication: 50 }
      : { facts: 50, causality: 48, legitimacy: 50, proportionality: 50, execution: 48, communication: 48 };

  const missingCritical = Object.entries(thresholds).filter(([k, v]) => scores[k] < v).map(([k]) => k);
  const penaltyPerMiss = riskLevel === "HIGH" ? 5 : riskLevel === "MEDIUM" ? 4 : 2;
  const gatePenalty = Math.min(24, missingCritical.length * penaltyPerMiss);
  const rawTotal = Math.round(Object.keys(scores).reduce((sum, k) => sum + scores[k] * WEIGHTS[k], 0) / 100);
  let total = Math.max(18, rawTotal - gatePenalty);
  if (riskLevel === "HIGH" && scores.legitimacy < 55) total = Math.min(total, 63);
  if (riskLevel === "HIGH" && scores.causality < 50) total = Math.min(total, 62);
  if (scores.proportionality < 45) total = Math.min(total, 65);
  if (moneyDecision && c.moneyBasis < 2 && c.statisticalBasis < 2) total = Math.min(total, 64);
  if (assumptionTraceRelevant && assumptionTrace.missing.length >= 1) total = Math.min(total, 68);
  else if (assumptionTraceRelevant && assumptionTrace.gaps.length >= 2) total = Math.min(total, 74);

  const basis = [
    {
      key: "necessity", label: "필요성 근거", applicable: true,
      status: necessityGood ? "good" : c.problem >= 1 ? "partial" : "missing",
    },
    {
      key: "money", label: "금액 산정", applicable: moneyDecision,
      status: !moneyDecision ? "na" : monetaryGood ? "good" : (c.moneyBasis >= 1 || c.statisticalBasis >= 1) ? "partial" : "missing",
    },
    {
      key: "assumption", label: "핵심 가정값", applicable: assumptionTraceRelevant,
      status: !assumptionTraceRelevant ? "na" : assumptionTraceGood ? "good" : assumptionTrace.missing.length ? "missing" : "partial",
    },
    {
      key: "rule", label: "규정·기준", applicable: ruleRelevant,
      status: !ruleRelevant ? "na" : ruleGood ? "good" : c.principle >= 1 ? "partial" : "missing",
    },
    {
      key: "authority", label: "결정권·전결", applicable: authorityRelevant,
      status: !authorityRelevant ? "na" : authorityGood ? "good" : "missing",
    },
    {
      key: "consistency", label: "기존 공지·관행", applicable: consistencyRelevant,
      status: !consistencyRelevant ? "na" : consistencyGood ? "good" : "partial",
    },
    {
      key: "defensibility", label: "판단 이력·설명가능성", applicable: defensibilityRelevant,
      status: !defensibilityRelevant ? "na" : defensibilityGood ? "good" : c.evidence >= 2 ? "partial" : "missing",
    },
    {
      key: "ownership", label: "판단 주체", applicable: decisionOwnershipRelevant,
      status: !decisionOwnershipRelevant ? "na" : decisionOwnershipGood ? "good" : "partial",
    },
  ];

  const decisionScopeLabels = [
    includesAnyText(text, ["조직 신설", "부문급 신설", "조직 구성", "전담인력", "전담 인력"]) ? "조직 신설" : "",
    includesAnyText(text, ["법인화", "법인 설립", "자회사", "스핀오프", "Spinoff", "Spin-off"]) ? "법인화" : "",
    includesAnyText(text, ["예산", "투자비", "집행비", "사업비"]) ? "예산" : "",
    includesAnyText(text, ["사업화", "B2B", "B2C", "외부 교육", "교육사업"]) ? "사업화" : "",
  ].filter(Boolean);
  const explicitDecisionAsk = countTerm(text, ["승인 요청", "의사결정 요청", "결재 요청", "확정 요청", "이번 보고에서 승인", "승인받고자"]);
  const operatingChoiceRelevant = countTerm(text, ["선착순", "추첨", "랜덤", "일괄", "월 1회", "매주", "직접 처리", "대행", "운영 방식", "운영방식"]) >= 1;

  const questions = [];
  const addQ = (condition, q, severity = "HIGH", rule = "") => {
    if (condition) questions.push({ q, severity, rule });
  };
  addQ(c.problem < 2, "이 보고가 왜 필요한 건가요? 지금 실제로 문제가 되는 현상이 무엇인지 먼저 설명해주실래요?", "HIGH", "목적/문제");
  addQ(scores.facts < thresholds.facts + 8, "지금 말씀하신 내용 중 확인된 팩트가 어디까지인가요? 수치·현황·이력으로 나눠서 볼 수 있나요?", "HIGH", "사실성");
  addQ(factOpinionRelevant && !factOpinionGood, "이 부분은 확인된 팩트인가요, 아니면 현재 의견이나 추정인가요? 둘은 나눠서 보는 게 좋을 것 같습니다.", "HIGH", "팩트/의견");
  addQ(scores.causality < thresholds.causality + 8, "그게 실제 원인이 맞나요? 현상과 원인을 섞어서 설명하고 있는 부분은 없나요?", "HIGH", "인과성");
  addQ(operatingChoiceRelevant && (c.causal < 2 || c.risk >= 1), "이 방식을 쓰는 이유가 있나요? 다른 방식보다 이게 맞다고 본 기준이 뭐죠?", "HIGH", "운영 기준");
  const assumptionPriority = { "인원 가정": 120, "변동성 버퍼": 115, "고액·예비비 가정": 110, "상향률·증가 가정": 100, "추정 가정": 90 };
  const assumptionValues = [...assumptionTrace.gaps]
    .sort((a, b) => (assumptionPriority[b.type] || 0) - (assumptionPriority[a.type] || 0))
    .map((x) => x.value).filter(Boolean).slice(0, 3);
  addQ(assumptionTraceRelevant && assumptionTrace.gaps.length > 0, assumptionValues.length
    ? `${assumptionValues.join(", ")}은 왜 그 숫자인가요? 계산식뿐 아니라 그 가정값을 잡은 기준까지 같이 설명해주세요.`
    : "산식에 들어간 가정값은 왜 그 숫자인가요? 전년도 계획·최근 실적·발생빈도처럼 상위 근거까지 연결해주세요.", "HIGH", "가정 추적");
  addQ(moneyDecision && !monetaryGood, reportType === "budget"
    ? (c.assumption >= 1 || c.statisticalBasis >= 1
      ? "증액 사유 말고 금액 산정 근거가 뭐죠? 인당·단가형이 아니면 최근 실적·평균·분포 중 어떤 기준으로 이 금액이 나온 건지 설명해주세요."
      : "증액 사유 말고 비용 산정 근거가 뭐죠? 인당·회당·수량·단가 기준으로 설명할 수 있나요?")
    : "이 지원금·비용은 어떤 기준으로 산정된 건가요? 인원·단가·횟수나 기존 지급 기준이 있나요?", "HIGH", "금액 산정");
  addQ(reportType === "policy" && c.principle < 2, "현행 규정이나 운영 기준은 정확히 뭐죠? 이번 안이 어느 기준을 유지하거나 바꾸는 건가요?", "HIGH", "규정/기준");
  addQ(authorityQuestionRelevant && c.authority < 1, "이건 누가 결정하는 건가요? 전결이나 기존 기준이 따로 있나요?", "HIGH", "전결/책임");
  addQ(decisionOwnershipRelevant && !decisionOwnershipGood, "이건 우리가 정할 문제인가요, 당사자 선택을 받을 문제인가요, 아니면 의사결정권자에게 안을 올려야 하는 건가요?", "HIGH", "판단 주체");
  addQ(defensibilityRelevant && !defensibilityGood, "나중에 왜 이건 반영했고 왜 이건 제외했는지 다시 물어봐도 설명할 수 있게 기준이나 검토 흔적이 남아 있나요?", "HIGH", "설명가능성");
  addQ(consistencyRelevant && !consistencyGood, "기존에 이미 공지했거나 관행적으로 운영한 기준과 충돌하는 부분은 없나요? 금회 적용과 차기 개선을 나눠야 하는 건 아닌가요?", "HIGH", "일관성");
  addQ(scores.proportionality < thresholds.proportionality + 8, "문제에 비해 통제가 과한 건 아닌가요? 자율성은 유지하면서 최소한으로 확인할 방법은 없나요?", "HIGH", "비례성");
  addQ((["process", "policy"].includes(reportType) || c.operations >= 3 || c.owner >= 1) && scores.execution < thresholds.execution + 8, "실제로 어떻게 진행되는 건가요? 누가 어떤 순서로 처리하는지 처음 보는 사람도 이해할 수 있게 보이면 좋을 것 같아요.", "HIGH", "실행성");
  addQ(riskLevel !== "LOW" && c.risk < 2, "예외·어뷰징·실패 케이스는 뭐가 있나요? 그 경우에는 어디까지 담당자가 개입하나요?", "HIGH", "리스크");
  addQ((riskLevel === "HIGH" || (riskLevel === "MEDIUM" && total < 80)) && c.fallback < 1, "추천안이 막히면 다음 대안은 무엇인가요?", "MEDIUM", "대안");
  addQ(["process", "policy"].includes(reportType) && c.schedule < 2, "바로 전면 적용하나요? 안내→확인→시범→정례처럼 단계적으로 가는 게 낫지 않나요?", "MEDIUM", "적용 일정");
  addQ(actNowRelevant && c.planOnly >= 1 && c.immediateAction === 0 && c.uncertainty === 0, "계획서 제출 전에 바로 처리해서 완료로 가져갈 수 있는 건 없나요?", "MEDIUM", "선조치");
  addQ(readerClarityRelevant && !readerClarityGood, "처음 보는 사람이 이 내용만 보고 어떻게 진행되고 관리되는지 이해할 수 있을까요? 단계나 실제 사례를 조금 더 풀어주면 좋을 것 같아요.", "HIGH", "초견 이해도");
  addQ(documentStage.key === "concept" && decisionScopeLabels.length >= 2 && explicitDecisionAsk === 0,
    `이번 보고에서 정확히 어디까지 결정받으려는 건가요? 방향성만 보는 건지, ${decisionScopeLabels.slice(0, 3).join("·")}까지 포함하는 건지요?`,
    "HIGH", "전달성");
  addQ(c.decision < 1 && scores.communication < thresholds.communication + 8, "그래서 지금 제게 결정해 달라는 게 정확히 무엇인가요? 한 문장으로 말하면요?", "HIGH", "전달성");

  const priorityByType = {
    budget: { "가정 추적": 125, "금액 산정": 115, "설명가능성": 108, "목적/문제": 90, "사실성": 85, "인과성": 82, "판단 주체": 78, "전달성": 70, "대안": 55, "실행성": 50 },
    policy: { "규정/기준": 112, "팩트/의견": 108, "전결/책임": 105, "판단 주체": 102, "인과성": 95, "일관성": 90, "비례성": 85, "사실성": 80, "설명가능성": 76, "리스크": 70, "선조치": 64, "적용 일정": 60 },
    process: { "초견 이해도": 118, "운영 기준": 116, "목적/문제": 110, "실행성": 108, "인과성": 100, "비례성": 90, "선조치": 86, "일관성": 80, "사실성": 78, "판단 주체": 62, "대안": 60, "적용 일정": 58 },
    people: { "초견 이해도": 116, "팩트/의견": 110, "사실성": 108, "인과성": 100, "전달성": 98, "규정/기준": 94, "비례성": 84, "판단 주체": 66, "전결/책임": 58, "설명가능성": 72, "리스크": 68 },
    general: { "초견 이해도": 112, "팩트/의견": 108, "사실성": 105, "인과성": 98, "목적/문제": 95, "전달성": 88, "실행성": 82, "판단 주체": 62 },
  };
  const pmap = priorityByType[reportType] || priorityByType.general;
  questions.sort((a, b) => {
    const stageBoost = (q) => documentStage.key === "concept" && q.rule === "전달성" ? 40 : 0;
    return ((pmap[b.rule] || 40) + stageBoost(b)) - ((pmap[a.rule] || 40) + stageBoost(a));
  });

  const maxQuestions = riskLevel === "HIGH" ? 4 : riskLevel === "MEDIUM" ? 3 : 2;
  const deduped = [];
  const seen = new Set();
  for (const q of questions) {
    if (!seen.has(q.q)) {
      seen.add(q.q);
      deduped.push(q);
    }
    if (deduped.length >= maxQuestions) break;
  }

  const advisorQuestions = deduped.map((q) => ({ ...q, role: "advisor" }));
  const junQuestions = filterJunQuestions(deduped, reportType, documentStage, junDepth).map((q) => ({ ...q, role: "jun" }));

  const riskReasons = [];
  if (maxMoney >= 100000000) riskReasons.push("금액 영향");
  if (reportType === "policy" || c.principle >= 3) riskReasons.push("규정·기준");
  if (c.companyWide >= 1) riskReasons.push("전사 영향");
  if (c.sensitive >= 2) riskReasons.push("민감정보·보안");
  if (highControl) riskReasons.push("강한 통제");
  if (!riskReasons.length) riskReasons.push("제한적 영향 범위");

  const verdict = total >= 84 ? "상신 준비도 높음" : total >= 68 ? "보완 후 상신" : "현재 상신은 이른 편";
  const weakAreas = Object.entries(scores)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([key, value]) => ({ key, label: AXIS_LABEL[key], value }));

  const axisDetails = {
    facts: {
      label: AXIS_LABEL.facts, score: scores.facts, band: scoreBand(scores.facts),
      summary: quantified >= 4
        ? `수치·현황 표현이 ${quantified}건 확인되어 사실 기반은 비교적 잘 잡혀 있습니다.`
        : `수치·현황 표현이 ${quantified}건으로, 핵심 사실을 더 명확히 보여줄 여지가 있습니다.`,
      positives: [
        c.current >= 2 ? "현재/현행 상태가 문서에 제시됨" : null,
        quantified >= 2 ? `정량 정보 ${quantified}건 확인` : null,
        c.evidence >= 2 ? "자료·이력·비교 근거 표현이 확인됨" : null,
      ].filter(Boolean),
      gaps: [
        quantified < 2 ? "핵심 현상을 뒷받침할 정량 정보가 부족함" : null,
        c.evidence < 2 ? "확인 자료·이력·비교 근거가 약함" : null,
      ].filter(Boolean),
      snippet: findSnippet(raw, ["현재", "현황", "누적", "%", "명", "건"]),
    },
    causality: {
      label: AXIS_LABEL.causality, score: scores.causality, band: scoreBand(scores.causality),
      summary: c.causal >= 1
        ? "문제의 원인 또는 이유를 설명하는 표현이 확인됩니다. 현상과 직접 원인이 실제로 연결되는지가 핵심입니다."
        : "현상과 해결책은 보이지만 왜 그런 문제가 생겼는지 원인 설명이 상대적으로 약합니다.",
      positives: [c.problem >= 2 ? "문제 현상이 구체적으로 제시됨" : null, c.causal >= 1 ? "원인/이유 설명이 포함됨" : null].filter(Boolean),
      gaps: [c.causal < 1 ? "현상과 원인을 구분하는 설명이 부족함" : null, c.problem >= 2 && c.solution >= 3 && c.causal < 1 ? "해결안이 원인 검증보다 먼저 제시됨" : null].filter(Boolean),
      snippet: findSnippet(raw, ["원인", "이유", "때문", "으로 인해", "문제", "한계"]),
    },
    legitimacy: {
      label: AXIS_LABEL.legitimacy, score: scores.legitimacy, band: scoreBand(scores.legitimacy),
      summary: assumptionTraceRelevant && !assumptionTraceGood
        ? "산식이나 증가 필요성은 보여도, 산식에 들어간 핵심 가정값 자체의 출처가 충분히 닫히지 않았습니다."
        : moneyDecision && !monetaryGood
          ? "필요성은 설명되어도 금액 산정 근거는 별개의 근거로 보완이 필요합니다."
          : reportType === "policy" && !ruleGood
            ? "제도 판단에 필요한 현행 규정·기준이 충분히 확인되지 않습니다."
            : "필요성·기준·산정근거·가정값·의사결정 권한 중 현재 사안에 필요한 근거가 비교적 연결되어 있습니다.",
      positives: [necessityGood ? "변경 필요성의 근거가 확인됨" : null, monetaryGood && moneyDecision ? "비용 산식 단서가 확인됨" : null, assumptionTraceRelevant && assumptionTraceGood ? "핵심 가정값의 상위 근거까지 연결됨" : null, ruleGood && ruleRelevant ? "규정·기준 단서가 확인됨" : null, authorityGood && authorityRelevant ? "의사결정/전결 단서가 확인됨" : null].filter(Boolean),
      gaps: [moneyDecision && !monetaryGood ? "인당·회당·수량·단가 등 비용 산식 보완 필요" : null, assumptionTraceRelevant && assumptionTrace.gaps.length ? "핵심 숫자가 왜 그 숫자인지 전년도 계획·실적 분포·발생빈도 등 부모 근거 보완 필요" : null, ruleRelevant && !ruleGood ? "현행 규정·운영 기준 보완 필요" : null, authorityRelevant && !authorityGood ? "최종 의사결정권자·전결 확인 필요" : null].filter(Boolean),
      snippet: findSnippet(raw, ["단가", "인당", "회당", "규정", "전결", "승인", "기준"]),
    },
    proportionality: {
      label: AXIS_LABEL.proportionality, score: scores.proportionality, band: scoreBand(scores.proportionality),
      summary: highControl && !hasMitigation
        ? "문제 대비 통제 강도가 높고 유예·시범·최소 확인 같은 완충 장치가 약합니다."
        : highControl
          ? "강한 통제가 포함되어 있으나 단계적 적용·완화 요소도 함께 확인됩니다."
          : "현재 안은 문제 대비 통제 강도가 과도하게 높지는 않은 것으로 감지됩니다.",
      positives: [c.balance >= 1 ? "단계적 적용/최소 통제 단서가 확인됨" : null, c.fallback >= 1 ? "대안 또는 조건부 운영이 포함됨" : null].filter(Boolean),
      gaps: [highControl && !hasMitigation ? "강한 조치 대비 유예·시범·완화 장치 부족" : null, riskLevel === "HIGH" && c.risk < 1 ? "고영향 사안인데 예외·오류 가능성 검토가 약함" : null].filter(Boolean),
      snippet: findSnippet(raw, ["폐지", "취소", "보류", "유예", "시범", "단계", "자율", "조건부"]),
    },
    execution: {
      label: AXIS_LABEL.execution, score: scores.execution, band: scoreBand(scores.execution),
      summary: c.owner >= 1 && c.schedule >= 2
        ? "담당과 일정이 함께 확인되어 실제 운영 그림이 비교적 닫혀 있습니다."
        : "누가·언제·어떤 순서로 처리하는지 운영 조건을 더 닫을 여지가 있습니다.",
      positives: [c.owner >= 1 ? "담당 주체가 확인됨" : null, c.schedule >= 2 ? "일정·시행 시점이 확인됨" : null, c.operations >= 3 ? "운영 절차가 구체적으로 제시됨" : null, c.fallback >= 1 ? "대안이 포함됨" : null].filter(Boolean),
      gaps: [c.owner < 1 && ["process", "policy"].includes(reportType) ? "담당 주체가 불명확함" : null, c.schedule < 2 && ["process", "policy"].includes(reportType) ? "시행 일정·단계가 부족함" : null].filter(Boolean),
      snippet: findSnippet(raw, ["담당", "시행", "예정", "프로세스", "절차", "일괄", "단계"]),
    },
    communication: {
      label: AXIS_LABEL.communication, score: scores.communication, band: scoreBand(scores.communication),
      summary: c.summary >= 1 && c.decision >= 1
        ? "핵심 요약과 요청/결정 포인트가 비교적 빠르게 보입니다."
        : "결론·요청사항이 한 번에 보이도록 압축하면 전달력이 더 좋아질 수 있습니다.",
      positives: [c.summary >= 1 ? "요약/핵심 표현이 확인됨" : null, structured ? "문서 구조가 구분되어 있음" : null, c.decision >= 1 ? "결정/검토 요청이 제시됨" : null].filter(Boolean),
      gaps: [c.summary < 1 ? "결론·결과요약이 앞에 명확히 보이지 않음" : null, c.decision < 1 ? "무엇을 결정받으려는지 명확하지 않음" : null].filter(Boolean),
      snippet: findSnippet(raw, ["결론", "결과요약", "핵심", "검토 부탁", "의사결정", "주요 변경"]),
    },
  };

  const documentEvidence = basis.filter((b) => b.applicable).map((b) => {
    const reasons = {
      necessity: necessityGood ? "문제·원인·정량 정보가 함께 확인됨" : c.problem >= 1 ? "문제는 보이나 원인 또는 정량 근거가 충분히 연결되지 않음" : "변경 필요성을 뒷받침하는 문제 정의가 약함",
      money: monetaryGood ? (c.statisticalBasis >= 2 ? "최근 실적·평균·분포 등 추정형 산정 기준이 확인됨" : "인당·회당·수량·단가 등 산식 단서가 확인됨") : (c.moneyBasis >= 1 || c.statisticalBasis >= 1) ? "산정 관련 표현은 있으나 계산/추정 구조가 충분히 닫히지 않음" : "비용 산정 구조가 확인되지 않음",
      assumption: assumptionTraceGood ? "핵심 숫자들이 전년도 계획·최근 실적·발생빈도 등 상위 근거와 연결됨" : assumptionTrace.missing.length ? "핵심 가정값 중 출처가 확인되지 않는 숫자가 있음" : "참고 실적은 있으나 정확히 그 숫자를 선택한 논리가 일부 열려 있음",
      rule: ruleGood ? "현행 규정·기준 관련 근거가 확인됨" : "현재 적용되는 규정·운영 기준이 충분히 확인되지 않음",
      authority: authorityGood ? "승인·전결·의사결정 주체 단서가 확인됨" : "최종 의사결정 주체 또는 전결 확인이 필요함",
      consistency: consistencyGood ? "기존 공지·운영 이력과의 관계가 확인됨" : "기존 공지·관행과 충돌 여부를 확인할 필요가 있음",
      defensibility: defensibilityGood ? "반영·미반영·산정 판단을 나중에도 설명할 수 있는 기준/근거 단서가 확인됨" : "결론은 있어도 왜 반영·삭감했는지 다시 설명할 판단 기준이나 검토 흔적이 약함",
      ownership: decisionOwnershipGood ? "결정 주체·담당·당사자 선택 중 누가 판단할지 단서가 확인됨" : "이 판단을 누가 내려야 하는지 역할 구분이 충분히 보이지 않음",
    };
    return { ...b, reason: reasons[b.key] || "", snippet: axisDetails[["money", "assumption", "rule", "authority", "consistency", "defensibility", "ownership"].includes(b.key) ? "legitimacy" : "facts"]?.snippet || "" };
  });

  const adaptiveRiskCue = countTerm(text, ["형평성", "어뷰징", "오남용", "개인정보", "정보보안", "예외 적용", "규정 위반"]);
  const simpleOperationalCue = countTerm(text, ["명함", "인쇄", "발송", "배송", "주문", "구매", "회의 시간", "미팅 시간", "샘플", "전달"]);
  const osIntensity = {
    factFirst: clamp(85 + (["policy", "people"].includes(reportType) ? 5 : 0) + (c.sensitive >= 1 ? 5 : 0), 35, 100),
    whyTrace: clamp(60 + (moneyDecision ? 25 : 0) + (reportType === "policy" ? 15 : 0) + (adaptiveRiskCue >= 1 ? 10 : 0) - (junDepth.level <= 1 ? 8 : 0), 30, 100),
    proportionalControl: clamp(80 + (highControl ? 10 : 0) + (adaptiveRiskCue >= 1 ? 8 : 0), 40, 100),
    revisableOpinion: clamp(85 + (c.fallback >= 1 || c.opinionLanguage >= 1 ? 7 : 0), 45, 100),
    decisionOwner: clamp(45 + (decisionOwnershipRelevant ? 28 : 0) + (reportType === "policy" ? 12 : 0) - (simpleOperationalCue >= 2 ? 12 : 0), 25, 100),
    actWhenClear: clamp(90 + (simpleOperationalCue >= 2 ? 6 : 0) - (junDepth.level >= 3 ? 12 : 0), 45, 100),
    readerClarity: clamp(80 + (readerClarityRelevant ? 15 : 0) - (readerClarityGood ? 3 : 0), 45, 100),
  };
  const intensityLabel = (v) => v >= 88 ? "강하게 작동" : v >= 70 ? "보통 작동" : "필요 시 작동";

  const managerPatterns = [];
  managerPatterns.push(junDepth.level <= 1
    ? "단순·가역적 사안은 깊게 파고들기보다 한두 가지를 확인하고 바로 실행하거나 담당자 안을 수용하는 경향"
    : "비용·규정·형평성·보안처럼 영향이 커지는 순간 질문 깊이를 올리는 경향");
  if (moneyDecision) managerPatterns.push("비용이 걸리면 증액 필요성과 실제 금액 산정 근거를 별개로 확인하는 경향");
  if (assumptionTraceRelevant && junDepth.level >= 3) managerPatterns.push("금액 검토가 깊어지면 산식 입력값의 상위 가정까지 왜 그 숫자인지 한 단계 더 추적하는 경향");
  if (reportType === "policy" || c.principle >= 1) managerPatterns.push("규정·예외·형평성이 걸리면 관행보다 실제 적용 기준을 확인하는 경향");
  if (readerClarityRelevant) managerPatterns.push("새 제도·프로세스·시스템은 처음 보는 사람이 진행 방식과 실제 사례를 이해할 수 있는지 확인하는 경향");
  if (highControl || adaptiveRiskCue >= 1) managerPatterns.push("강한 통제보다 문제에 비례한 최소 필요 통제·단계 적용을 선호하는 경향");
  if (decisionOwnershipRelevant) managerPatterns.push("R&R·규정·선택권이 실제 쟁점일 때만 누가 판단할 문제인지 구분하는 경향");
  if (actNowRelevant || simpleOperationalCue >= 1) managerPatterns.push("명확한 일은 복잡한 검토보다 먼저 처리하고, 담당자가 타당한 대안을 제시하면 빠르게 수용하는 경향");
  if (!managerPatterns.length) managerPatterns.push("결론과 핵심 사실을 먼저 보고 필요한 질문만 좁혀가는 경향");

  const metaPrinciples = [
    {
      key: "factFirst", label: "FACT FIRST", title: "팩트 우선",
      intensity: osIntensity.factFirst, intensityLabel: intensityLabel(osIntensity.factFirst),
      active: factOpinionRelevant || c.evidence >= 1,
      managerRule: "확인된 사실과 의견·추정·책임 해석을 분리합니다.",
      documentSignal: factOpinionGood ? "팩트/근거 단서가 있어 의견과 구분해 볼 수 있습니다." : "의견·추정 표현에 비해 확인된 사실 근거가 약해 먼저 구분이 필요합니다.",
      snippet: findSnippet(raw, ["팩트", "사실", "확인", "의견", "추정", "같습니다", "보입니다"]),
    },
    {
      key: "whyTrace", label: "WHY TRACE", title: "왜의 근원 추적",
      intensity: osIntensity.whyTrace, intensityLabel: intensityLabel(osIntensity.whyTrace),
      active: osIntensity.whyTrace >= 70,
      managerRule: "평소에는 짧게 보지만, 비용·규정·형평성처럼 영향이 커지면 이유와 산정 기준을 더 깊게 추적합니다.",
      documentSignal: moneyDecision ? "금액 판단이 있어 WHY TRACE 강도가 올라갑니다." : reportType === "policy" ? "규정·기준 판단이 있어 WHY TRACE 강도가 올라갑니다." : "현재는 깊은 원인 추적보다 핵심 사실 확인이 우선인 유형입니다.",
      snippet: findSnippet(raw, ["근거", "산정", "가정", "반영", "삭감", "우선순위"]),
    },
    {
      key: "proportionalControl", label: "PROPORTIONAL CONTROL", title: "비례적 통제",
      intensity: osIntensity.proportionalControl, intensityLabel: intensityLabel(osIntensity.proportionalControl),
      active: highControl || c.risk >= 1 || c.usageFrequency >= 1 || ["policy", "process"].includes(reportType),
      managerRule: "전면 통제보다 사용빈도·영향·위험에 맞는 최소 충분 통제를 선호합니다.",
      documentSignal: highControl && !hasMitigation ? "통제 강도에 비해 완충/단계 장치가 약합니다." : c.usageFrequency >= 1 ? "사용빈도에 따라 통제 수준을 달리 볼 수 있는 단서가 있습니다." : "현재 안의 통제 강도가 문제 규모에 맞는지 확인합니다.",
      snippet: findSnippet(raw, ["상시", "필요 시", "매일", "매주", "반기", "제한", "자율", "유예"]),
    },
    {
      key: "revisableOpinion", label: "REVISABLE OPINION", title: "수정 가능한 의견",
      intensity: osIntensity.revisableOpinion, intensityLabel: intensityLabel(osIntensity.revisableOpinion),
      active: true,
      managerRule: "먼저 간단한 안을 제시해도 담당자가 타당한 이유와 현실적 대안을 주면 빠르게 판단을 바꿉니다.",
      documentSignal: c.fallback >= 1 ? "대안이 제시되어 있어 담당자 설명에 따라 판단을 업데이트하기 쉬운 사안입니다." : "새로운 팩트나 타당한 이유가 나오면 결론을 고정하지 않습니다.",
      snippet: findSnippet(raw, ["의견", "제 생각", "검토", "대안", "방식", "가능성"]),
    },
    {
      key: "decisionOwner", label: "RIGHT DECISION OWNER", title: "적절한 판단 주체",
      intensity: osIntensity.decisionOwner, intensityLabel: intensityLabel(osIntensity.decisionOwner),
      active: decisionOwnershipRelevant,
      managerRule: "이 축은 상시 작동하지 않고 규정·R&R·당사자 선택·명시적 승인선이 실제 쟁점일 때 강하게 켜집니다.",
      documentSignal: decisionOwnershipRelevant ? (decisionOwnershipGood ? "이번 사안은 판단 주체가 실제 쟁점이며 관련 단서가 확인됩니다." : "이번 사안은 판단 주체가 실제 쟁점이어서 역할 구분을 확인할 가능성이 있습니다.") : "이번 사안에서는 전결/판단주체를 선제적으로 물을 가능성이 낮습니다.",
      snippet: findSnippet(raw, ["전결", "결정권자", "담당", "본인 선택", "선택권", "승인", "R&R"]),
    },
    {
      key: "actWhenClear", label: "ACT WHEN CLEAR", title: "명확하면 실행",
      intensity: osIntensity.actWhenClear, intensityLabel: intensityLabel(osIntensity.actWhenClear),
      active: true,
      managerRule: "단순하고 가역적인 업무는 깊게 검토하기보다 바로 가능한 방법을 제안하고 실행하는 편입니다.",
      documentSignal: junDepth.level <= 1 ? "현재는 간단 확인 또는 즉시 실행 쪽으로 판단 깊이가 낮아진 상태입니다." : "현재는 영향도가 있어 바로 실행하기 전에 필요한 확인을 먼저 합니다.",
      snippet: findSnippet(raw, ["바로", "즉시", "주문", "발송", "한번에", "조치 완료", "추가 확인"]),
    },
    {
      key: "readerClarity", label: "READER CLARITY", title: "초견 이해도",
      intensity: osIntensity.readerClarity, intensityLabel: intensityLabel(osIntensity.readerClarity),
      active: readerClarityRelevant,
      managerRule: "새 제도·평가·시스템은 처음 보는 사람이 진행 방식과 관리 구조를 이해할 수 있는지, 실제 사례가 충분한지 봅니다.",
      documentSignal: !readerClarityRelevant ? "이번 사안에서는 별도 작동 필요성이 낮습니다." : readerClarityGood ? "진행 흐름과 사례 단서가 있어 초견 이해도가 비교적 확보되어 있습니다." : "진행 흐름 또는 실제 사례 설명을 한 단계 더 풀어줄 필요가 있습니다.",
      snippet: findSnippet(raw, ["프로세스", "절차", "사례", "예시", "평가", "관리", "시스템"]),
    },
  ];

  const stanceSeparation = {
    factSignal: findSnippet(raw, ["팩트", "사실", "확인 결과", "확인된", "실제", "기록", "이력"]),
    opinionSignal: findSnippet(raw, ["의견", "제 생각", "생각에는", "보입니다", "것 같습니다", "추정", "가능성"]),
    summary: factOpinionGood
      ? "확인된 사실을 기준으로 판단하되, 의견·추정은 새로운 사실이 들어오면 수정 가능한 상태로 둡니다."
      : "현재 문서에서는 의견·추정과 확인된 사실을 한 번 더 분리해 보는 편이 팀장 판단 패턴에 가깝습니다.",
  };

  let decisionStage = { key: "verification", label: "검증 단계", reason: "방향은 이해되지만 핵심 근거 한두 개를 더 확인하는 단계입니다." };
  if (junQuestions.length && (scores.facts < thresholds.facts + 8 || scores.causality < thresholds.causality + 8)) {
    decisionStage = { key: "question", label: "확인 단계", reason: "아직 결론보다 사실관계 또는 원인 확인이 먼저 필요한 단계입니다." };
  } else if (!junQuestions.length && total >= 84) {
    decisionStage = { key: "decision", label: "판단 단계", reason: "핵심 논리가 비교적 닫혀 있어 승인·진행 여부를 판단할 수 있는 상태입니다." };
  } else if (total < 68) {
    decisionStage = { key: "revision", label: "보완 단계", reason: "상신 전 핵심 근거 또는 운영 조건 보완이 필요한 상태입니다." };
  }

  return {
    reportType,
    reportTypeLabel: REPORT_TYPE_LABEL[reportType],
    riskLevel,
    riskScore,
    riskReasons,
    maxMoney,
    basis,
    scores,
    total,
    verdict,
    documentStage,
    junDepth,
    osIntensity,
    questions: junQuestions,
    junQuestions,
    advisorQuestions,
    firstTurnQuestions: junQuestions.slice(0, junDepth.level <= 1 ? 1 : 2),
    weakAreas,
    missingCritical,
    axisDetails,
    documentEvidence,
    assumptionTrace,
    managerPatterns: managerPatterns.slice(0, 6),
    metaPrinciples,
    stanceSeparation,
    decisionStage,
    flags: {
      moneyDecision,
      assumptionTraceRelevant,
      assumptionTraceGood,
      ruleRelevant,
      consistencyRelevant,
      defensibilityRelevant,
      defensibilityGood,
      factOpinionRelevant,
      factOpinionGood,
      decisionOwnershipRelevant,
      decisionOwnershipGood,
      actNowRelevant,
      actNowGood,
      highControl,
      hasMitigation,
      asisTobe,
      structured,
    },
  };
}

export function buildAnalysisPrompt(analysis) {
  const junQuestions = analysis.firstTurnQuestions || analysis.junQuestions || analysis.questions || [];
  const qs = junQuestions.length
    ? junQuestions.map((q, i) => `${i + 1}. [패턴 근거 ${q.patternStrength || "중간"} · 질문 깊이 L${q.questionDepth ?? 1}] ${q.q}`).join("\n")
    : "없음 — 억지 질문을 만들지 말고 짧게 승인/진행성 반응을 할 것";
  const depth = analysis.junDepth || { level: 1, label: "L1 · 간단 확인", reason: "먼저 핵심 한두 가지를 확인" };

  return `
[JUN 출력 경계 — 가장 중요]
- 현재 문서 단계: ${analysis.documentStage?.label || "일반 검토"}
- 이번 판단 깊이: ${depth.label}
- 깊이 판단 이유: ${depth.reason || "현재 사안 영향도에 맞춰 조절"}
- 깊이를 올린 요인: ${(depth.escalators || []).join(" · ") || "없음"}
- 깊이를 낮춘 요인: ${(depth.deescalators || []).join(" · ") || "없음"}
- 단계 해석: ${analysis.documentStage?.reason || "현재 쟁점만 확인"}
- 현재 단계에서 요구할 근거 수준: ${analysis.documentStage?.evidenceLevel || "필요한 근거만 확인"}
- 실제 팀장 패턴상 이번 턴에 허용된 질문 후보:
${qs}

[JUN-ness Gate]
1) 당신은 최고의 컨설턴트가 아니라 '이 팀장이라면 실제로 먼저 뭐라고 할지'를 재현합니다.
2) 위 허용 질문 후보에 없는 새 검토축을 스스로 추가하지 마세요. 표현은 자연스럽게 바꿔도 되지만 질문의 범위를 확장하면 안 됩니다.
3) 기획·방향성 단계에서는 실행승인/투자승인 단계의 자료(정교한 손익표, ROI, 수요예측, 상세 통제체계 등)를 선제적으로 요구하지 마세요. 그런 전문 보완은 ADVISOR 역할입니다.
4) 판단 깊이가 L0~L1이면 한 번에 1개만 확인하고, L2~L3이어도 첫 반응은 최대 2개까지만 묻습니다. 깊은 사안도 처음부터 모든 검증항목을 쏟아내지 말고 답을 들으며 다음 단계로 좁혀가세요. 이미 충분하면 '네 이 정도면 될 것 같습니다'처럼 끝낼 수 있습니다.
5) RIGHT DECISION OWNER는 기본 질문이 아닙니다. 규정·R&R·당사자 선택·명시적 승인선이 실제 쟁점일 때만 사용하세요.
6) 새 제도·평가·시스템 소개에서는 READER CLARITY를 우선 고려해, 처음 보는 사람이 진행 방식과 실제 사례를 이해할 수 있는지 보는 반응이 자연스럽습니다.
7) 팀장에게 실제로 반복 관찰된 질문보다 일반 경영컨설팅 모범답안을 우선하지 마세요.
8) 첨부 문서나 실제 선례에 없는 숫자·기한·인원 기준·정책을 만들지 마세요.
`;
}

