function normalize(s = "") {
  return String(s).replace(/\s+/g, " ").trim().toLowerCase();
}

const NUMERIC_PATTERNS = [
  /\bD\s*\+\s*\d+\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:억(?:원)?|천만(?:원)?|백만(?:원)?|만(?:원)?|천원|원|명|건|회|개월|년|일|시|분|%|M\/M|MM|M)\b/gi,
  /\b\d+\s*[~～-]\s*\d+\s*(?:명|건|회|개|개월|일|시|분|%|M)?\b/gi,
  /[≤≥<>]\s*\d+(?:\.\d+)?\s*(?:명|건|회|개|M|%|원|만원)?/gi,
];

function extractNumericClaims(text) {
  const out = new Set();
  for (const re of NUMERIC_PATTERNS) {
    for (const m of String(text).matchAll(re)) out.add(normalize(m[0]));
  }
  return [...out];
}

const SENSITIVE_POLICY_TERMS = [
  "예외로그", "예외 로그", "리마인드", "체크리스트", "원천세", "4대보험", "사회보험",
  "구매규정", "구매 규정", "견적 2", "견적2", "2~3개 견적", "2-3개 견적",
  "한정 예외", "조건 충족 시", "기준 축소", "엄수", "승인권자 기재",
];

export function validateReply({ reply, sourceText = "", precedent = null, mode = "messenger", review = false }) {
  const problems = [];
  const allowed = normalize(`${sourceText}\n${precedent?.reasoningPattern || ""}\n${precedent?.observedOutcome || ""}`);
  const replyNorm = normalize(reply);

  const unsupportedNumbers = extractNumericClaims(reply).filter((claim) => !allowed.includes(claim));
  if (unsupportedNumbers.length) problems.push(`근거 없는 숫자/기한: ${unsupportedNumbers.join(", ")}`);

  const inventedTerms = SENSITIVE_POLICY_TERMS.filter((term) => replyNorm.includes(normalize(term)) && !allowed.includes(normalize(term)));
  if (inventedTerms.length) problems.push(`근거 없는 절차/정책 표현: ${inventedTerms.join(", ")}`);

  if (review && mode === "messenger") {
    if (reply.length > 520) problems.push(`메신저 검토 답변이 너무 김(${reply.length}자)`);
    const headingLike = String(reply).split(/\n+/).filter((line) => /^(원칙|이유|조건|운영|리스크|타임라인|커뮤니케이션|필수 확인|추가 확인|후속|임시 판단|필요 자료)\s*[:：]?/i.test(line.trim()));
    if (headingLike.length >= 1) problems.push("실제 Teams 대화보다 분석 리포트처럼 섹션을 나눔");
    const bulletCount = String(reply).split(/\n+/).filter((line) => /^\s*[-•▪]|^\s*\d+[.)]/.test(line)).length;
    if (bulletCount > 3) problems.push(`메신저에서 확인사항을 한꺼번에 너무 많이 제시함(${bulletCount}개)`);
  }

  return { ok: problems.length === 0, problems, unsupportedNumbers, inventedTerms };
}

export function buildCorrectionPrompt(problems = []) {
  return `\n\n[응답 검증 실패 — 반드시 다시 작성]\n${problems.map((p) => `- ${p}`).join("\n")}\n- 첨부 문서나 실제 선례에 없는 숫자, 기한, 인원 기준, 정책, 체크리스트를 새로 만들지 마세요.\n- 메신저 검토는 핵심 판단 또는 질문 1~2개만 먼저 말하세요.\n- 사용자가 답하면 그 다음 질문을 하세요. 한 번에 모든 통제 항목을 쏟아내지 마세요.`;
}
