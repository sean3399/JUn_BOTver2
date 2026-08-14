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
  };

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
  const monetaryGood = !moneyDecision || (c.moneyBasis >= 2 && quantified >= 4);
  const ruleRelevant = reportType === "policy" || c.principle > 0;
  const ruleGood = !ruleRelevant || c.principle >= 2;
  const authorityRelevant = riskLevel !== "LOW" || c.authority > 0;
  const authorityGood = !authorityRelevant || c.authority >= 1;
  const consistencyRelevant = ["policy", "process"].includes(reportType) && c.solution >= 2;
  const consistencyGood = !consistencyRelevant || c.commitment >= 1 || c.history >= 2;

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
  if (reportType === "process" && necessityGood) scores.legitimacy += 10;
  if (reportType === "process" && asisTobe) scores.legitimacy += 8;
  if (reportType === "policy" && c.principle >= 2) scores.legitimacy += 12;
  if (reportType === "policy" && c.authority >= 1) scores.legitimacy += 8;

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
  if (moneyDecision && c.moneyBasis < 2) scores.legitimacy = Math.min(scores.legitimacy, 48);
  if (reportType === "policy" && c.principle < 1) scores.legitimacy = Math.min(scores.legitimacy, 48);
  if (reportType === "policy" && riskLevel === "HIGH" && c.authority < 1) scores.legitimacy = Math.min(scores.legitimacy, 55);
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
  if (moneyDecision && c.moneyBasis < 2) total = Math.min(total, 64);

  const basis = [
    {
      key: "necessity", label: "필요성 근거", applicable: true,
      status: necessityGood ? "good" : c.problem >= 1 ? "partial" : "missing",
    },
    {
      key: "money", label: "금액 산정", applicable: moneyDecision,
      status: !moneyDecision ? "na" : monetaryGood ? "good" : c.moneyBasis >= 1 ? "partial" : "missing",
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
  ];

  const questions = [];
  const addQ = (condition, q, severity = "HIGH", rule = "") => {
    if (condition) questions.push({ q, severity, rule });
  };
  addQ(c.problem < 2, "이 보고가 왜 필요한 건가요? 지금 실제로 문제가 되는 현상이 무엇인지 먼저 설명해주실래요?", "HIGH", "목적/문제");
  addQ(scores.facts < thresholds.facts + 8, "지금 말씀하신 내용 중 확인된 팩트가 어디까지인가요? 수치·현황·이력으로 나눠서 볼 수 있나요?", "HIGH", "사실성");
  addQ(scores.causality < thresholds.causality + 8, "그게 실제 원인이 맞나요? 현상과 원인을 섞어서 설명하고 있는 부분은 없나요?", "HIGH", "인과성");
  addQ(moneyDecision && !monetaryGood, reportType === "budget"
    ? "증액 사유 말고 비용 산정 근거가 뭐죠? 인당·회당·수량·단가 기준으로 설명할 수 있나요?"
    : "이 지원금·비용은 어떤 기준으로 산정된 건가요? 인원·단가·횟수나 기존 지급 기준이 있나요?", "HIGH", "금액 산정");
  addQ(reportType === "policy" && c.principle < 2, "현행 규정이나 운영 기준은 정확히 뭐죠? 이번 안이 어느 기준을 유지하거나 바꾸는 건가요?", "HIGH", "규정/기준");
  addQ((riskLevel === "HIGH" || reportType === "policy") && c.authority < 1, "이 사안의 최종 의사결정권자는 누구죠? 전결이나 합의선은 확인됐나요?", "HIGH", "전결/책임");
  addQ(consistencyRelevant && !consistencyGood, "기존에 이미 공지했거나 관행적으로 운영한 기준과 충돌하는 부분은 없나요? 금회 적용과 차기 개선을 나눠야 하는 건 아닌가요?", "HIGH", "일관성");
  addQ(scores.proportionality < thresholds.proportionality + 8, "문제에 비해 통제가 과한 건 아닌가요? 자율성은 유지하면서 최소한으로 확인할 방법은 없나요?", "HIGH", "비례성");
  addQ(scores.execution < thresholds.execution + 8, "실제로 누가, 언제, 어떤 순서로 처리하나요? 적용 후 담당자 업무가 어떻게 바뀌죠?", "HIGH", "실행성");
  addQ(riskLevel !== "LOW" && c.risk < 2, "예외·어뷰징·실패 케이스는 뭐가 있나요? 그 경우에는 어디까지 담당자가 개입하나요?", "HIGH", "리스크");
  addQ((riskLevel === "HIGH" || (riskLevel === "MEDIUM" && total < 80)) && c.fallback < 1, "추천안이 막히면 다음 대안은 무엇인가요?", "MEDIUM", "대안");
  addQ(["process", "policy"].includes(reportType) && c.schedule < 2, "바로 전면 적용하나요? 안내→확인→시범→정례처럼 단계적으로 가는 게 낫지 않나요?", "MEDIUM", "적용 일정");
  addQ(scores.communication < thresholds.communication + 8, "그래서 지금 제게 결정해 달라는 게 정확히 무엇인가요? 한 문장으로 말하면요?", "HIGH", "전달성");

  const priorityByType = {
    budget: { "금액 산정": 110, "목적/문제": 90, "사실성": 85, "인과성": 80, "전달성": 70, "대안": 55, "실행성": 50 },
    policy: { "규정/기준": 110, "전결/책임": 105, "인과성": 95, "일관성": 90, "비례성": 85, "사실성": 80, "리스크": 70, "적용 일정": 60 },
    process: { "목적/문제": 110, "인과성": 105, "실행성": 95, "비례성": 90, "일관성": 80, "사실성": 75, "대안": 65, "적용 일정": 60 },
    people: { "사실성": 110, "인과성": 105, "규정/기준": 95, "전결/책임": 90, "비례성": 85, "리스크": 75 },
    general: { "사실성": 105, "인과성": 100, "목적/문제": 95, "전달성": 85, "실행성": 75 },
  };
  const pmap = priorityByType[reportType] || priorityByType.general;
  questions.sort((a, b) => (pmap[b.rule] || 40) - (pmap[a.rule] || 40));

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
      summary: moneyDecision && !monetaryGood
        ? "필요성은 설명되어도 금액 산정 근거는 별개의 근거로 보완이 필요합니다."
        : reportType === "policy" && !ruleGood
          ? "제도 판단에 필요한 현행 규정·기준이 충분히 확인되지 않습니다."
          : "필요성·기준·산정근거·의사결정 권한 중 현재 사안에 필요한 근거가 비교적 연결되어 있습니다.",
      positives: [necessityGood ? "변경 필요성의 근거가 확인됨" : null, monetaryGood && moneyDecision ? "비용 산식 단서가 확인됨" : null, ruleGood && ruleRelevant ? "규정·기준 단서가 확인됨" : null, authorityGood && authorityRelevant ? "의사결정/전결 단서가 확인됨" : null].filter(Boolean),
      gaps: [moneyDecision && !monetaryGood ? "인당·회당·수량·단가 등 비용 산식 보완 필요" : null, ruleRelevant && !ruleGood ? "현행 규정·운영 기준 보완 필요" : null, authorityRelevant && !authorityGood ? "최종 의사결정권자·전결 확인 필요" : null].filter(Boolean),
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
      money: monetaryGood ? "인당·회당·수량·단가 등 산식 단서가 확인됨" : c.moneyBasis >= 1 ? "산식 관련 표현은 있으나 계산 구조가 충분히 닫히지 않음" : "비용 산정 구조가 확인되지 않음",
      rule: ruleGood ? "현행 규정·기준 관련 근거가 확인됨" : "현재 적용되는 규정·운영 기준이 충분히 확인되지 않음",
      authority: authorityGood ? "승인·전결·의사결정 주체 단서가 확인됨" : "최종 의사결정 주체 또는 전결 확인이 필요함",
      consistency: consistencyGood ? "기존 공지·운영 이력과의 관계가 확인됨" : "기존 공지·관행과 충돌 여부를 확인할 필요가 있음",
    };
    return { ...b, reason: reasons[b.key] || "", snippet: axisDetails[b.key === "money" || b.key === "rule" || b.key === "authority" || b.key === "consistency" ? "legitimacy" : "facts"]?.snippet || "" };
  });

  const managerPatterns = [];
  if (moneyDecision) managerPatterns.push("증액 필요성과 비용 산정 근거를 별개로 확인하는 경향");
  if (reportType === "policy" || c.principle >= 1) managerPatterns.push("관행보다 실제 규정·전결·적용 기준을 확인하는 경향");
  if (scores.causality < 65 || c.causal < 1) managerPatterns.push("현상과 직접 원인을 섞지 않고 실제 원인을 다시 확인하는 경향");
  if (consistencyRelevant) managerPatterns.push("기존 공지·약속과의 일관성을 보고 금회 적용과 차기 개선을 분리하는 경향");
  if (highControl || reportType === "policy") managerPatterns.push("강한 통제보다 문제에 비례한 최소 필요 통제·단계 적용을 선호하는 경향");
  if (["process", "policy"].includes(reportType)) managerPatterns.push("아이디어보다 담당·순서·일정이 닫힌 운영안을 높게 보는 경향");
  if (!managerPatterns.length) managerPatterns.push("결론과 핵심 사실을 먼저 보고 필요한 질문만 좁혀가는 경향");

  let decisionStage = { key: "verification", label: "검증 단계", reason: "방향은 이해되지만 핵심 근거 한두 개를 더 확인하는 단계입니다." };
  if (deduped.length && (scores.facts < thresholds.facts + 8 || scores.causality < thresholds.causality + 8)) {
    decisionStage = { key: "question", label: "확인 단계", reason: "아직 결론보다 사실관계 또는 원인 확인이 먼저 필요한 단계입니다." };
  } else if (!deduped.length && total >= 84) {
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
    questions: deduped,
    firstTurnQuestions: deduped.slice(0, riskLevel === "LOW" ? 1 : 2),
    weakAreas,
    missingCritical,
    axisDetails,
    documentEvidence,
    managerPatterns: managerPatterns.slice(0, 4),
    decisionStage,
    flags: {
      moneyDecision,
      ruleRelevant,
      consistencyRelevant,
      highControl,
      hasMitigation,
      asisTobe,
      structured,
    },
  };
}

export function buildAnalysisPrompt(analysis) {
  const axisLine = Object.entries(analysis.scores)
    .map(([k, v]) => `${AXIS_LABEL[k]} ${v}`)
    .join(" / ");
  const basisLine = analysis.basis
    .filter((b) => b.applicable)
    .map((b) => `${b.label}=${BASIS_STATUS_LABEL[b.status]}`)
    .join(", ");
  const firstTurn = analysis.firstTurnQuestions || analysis.questions || [];
  const qs = firstTurn.length
    ? firstTurn.map((q, i) => `${i + 1}. ${q.q}`).join("\n")
    : "없음 — 핵심 누락이 없으면 억지 질문을 만들지 말 것";

  return `
[팀장 판단 엔진 — 실제 사례에서 추출한 우선순위]
- 보고 유형: ${analysis.reportTypeLabel}
- 위험도: ${analysis.riskLevel} (${analysis.riskReasons.join(", ")})
- 상신 준비도 규칙 점수: ${analysis.total}/100 · ${analysis.verdict}
- 6축: ${axisLine}
- 근거 진단: ${basisLine || "해당 항목 없음"}
- 실제 패턴상 우선 확인 가능성이 높은 질문:\n${qs}

이 숫자는 통계적 확률이 아니라 규칙 기반 패턴 점수입니다. 답변에서 점수 자체를 과장하지 마세요.
HIGH여도 첫 응답에서는 가장 중요한 질문 1~2개만 먼저 하세요. 답변을 받은 뒤 다음 질문으로 좁혀가세요.
LOW면 불필요하게 캐묻지 마세요.
예상 질문이 '없음'이면 KPI/성공지표 같은 범용 컨설팅 질문을 억지로 추가하지 마세요.
문서나 실제 선례에 없는 숫자·기한·인원 기준·새 정책을 만들지 마세요.`;
}
