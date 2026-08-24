const RULE_TO_AXIS = {
  "목적/문제": "facts",
  사실성: "facts",
  "팩트/의견": "facts",
  인과성: "causality",
  "가정 추적": "legitimacy",
  "금액 산정": "legitimacy",
  "규정/기준": "legitimacy",
  "전결/책임": "legitimacy",
  "판단 주체": "legitimacy",
  설명가능성: "legitimacy",
  일관성: "legitimacy",
  비례성: "proportionality",
  실행성: "execution",
  리스크: "proportionality",
  대안: "execution",
  "적용 일정": "execution",
  선조치: "execution",
  전달성: "communication",
};

const RULE_TITLES = {
  "목적/문제": "보고 필요성 보완",
  사실성: "팩트 근거 보완",
  "팩트/의견": "팩트와 의견 분리",
  인과성: "원인 연결 보완",
  "가정 추적": "핵심 가정값 근거 보완",
  "금액 산정": "금액 산식 보완",
  "규정/기준": "규정·기준 근거 보완",
  "전결/책임": "의사결정권 확인",
  "판단 주체": "판단 주체 명확화",
  설명가능성: "판단 근거 흔적 보완",
  일관성: "기존 기준과의 일관성 확인",
  비례성: "통제 수준 조정 검토",
  실행성: "담당·일정·절차 보완",
  리스크: "예외·실패 케이스 보완",
  대안: "대안 보완",
  "적용 일정": "단계별 일정 보완",
  선조치: "즉시 조치 가능 항목 확인",
  전달성: "결론·요청사항 명확화",
};

function cleanSnippet(value = "") {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 240);
}

function keywordCandidates(text = "") {
  return [...new Set(String(text)
    .replace(/[?!.(),·:;“”"'\[\]{}]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .filter((x) => !/^(이|그|저|지금|부분|내용|설명|확인|정확히|어떻게|무엇|있나요|인가요|건가요|해주세요|같습니다|필요|기준)$/.test(x))
    .sort((a, b) => b.length - a.length))].slice(0, 12);
}

function locationBefore(text, index) {
  const before = text.slice(0, Math.max(0, index));
  const matches = [...before.matchAll(/\[(슬라이드\s+\d+(?:\s*·[^\]]+)?|페이지\s+\d+(?:\s*·[^\]]+)?|시트\s+\d+:[^\]]+|행\s+\d+|문단\s+\d+)\]/g)];
  if (!matches.length) return "문서 내 텍스트";

  const lastSheet = [...matches].reverse().find((m) => /^시트\s/.test(m[1]));
  const lastLocal = [...matches].reverse().find((m) => !/^시트\s/.test(m[1]));
  if (lastSheet && lastLocal && /^행\s/.test(lastLocal[1]) && lastSheet.index < lastLocal.index) {
    return `${lastSheet[1]} · ${lastLocal[1]}`;
  }
  return matches[matches.length - 1][1];
}

function excerptAround(text, index, length = 180) {
  const start = Math.max(0, index - Math.floor(length / 3));
  const raw = text.slice(start, start + length);
  return cleanSnippet(raw.replace(/\[[^\]]+\]/g, " "));
}

function findEvidence(docs = [], preferredSnippet = "", question = "") {
  const preferred = cleanSnippet(preferredSnippet);
  const questionKeys = keywordCandidates(question);
  const fallbackKeys = keywordCandidates(preferred);

  for (const doc of docs) {
    const text = String(doc.text || "");
    if (!text) continue;

    let index = -1;
    // 질문 안에 구체적인 숫자/항목명이 있으면 일반 축 snippet보다 그 위치를 우선합니다.
    for (const key of questionKeys) {
      if (!/\d/.test(key) && key.length < 4) continue;
      index = text.toLowerCase().indexOf(key.toLowerCase());
      if (index >= 0) break;
    }

    if (index < 0 && preferred.length >= 12) {
      const needle = preferred.slice(0, Math.min(70, preferred.length));
      index = text.indexOf(needle);
      if (index < 0) {
        const shorter = preferred.slice(0, Math.min(28, preferred.length));
        if (shorter.length >= 12) index = text.indexOf(shorter);
      }
    }

    if (index < 0) {
      for (const key of [...questionKeys, ...fallbackKeys]) {
        index = text.toLowerCase().indexOf(key.toLowerCase());
        if (index >= 0) break;
      }
    }

    if (index >= 0) {
      return {
        file: doc.name,
        location: locationBefore(text, index),
        snippet: excerptAround(text, index),
      };
    }
  }

  const first = docs[0];
  return first ? { file: first.name, location: "위치 자동 특정 안 됨", snippet: preferred || "" } : null;
}

export function buildReviewIssues(analysis, docs = []) {
  const questions = analysis?.questions || [];
  const seen = new Set();
  const out = [];

  for (const question of questions) {
    const rule = question.rule || "검토 항목";
    const axis = RULE_TO_AXIS[rule] || "facts";
    const detail = analysis?.axisDetails?.[axis];
    const signature = `${rule}:${question.q}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const evidence = findEvidence(docs, detail?.snippet || "", question.q);
    out.push({
      id: `issue-${out.length + 1}`,
      severity: question.severity || "MEDIUM",
      rule,
      axis,
      title: RULE_TITLES[rule] || `${rule} 보완`,
      question: question.q,
      status: "open",
      evidence,
      gap: detail?.gaps?.[0] || "",
    });
    if (out.length >= 8) break;
  }

  return out;
}

export function summarizeReview(analysis, issues = []) {
  const open = issues.filter((x) => x.status !== "resolved").length;
  const high = issues.filter((x) => x.severity === "HIGH" && x.status !== "resolved").length;
  const total = Number(analysis?.total || 0);
  let readiness = "NOT_READY";
  if (total >= 82 && high === 0) readiness = "READY";
  else if (total >= 68 && high <= 2) readiness = "READY_WITH_RISK";
  return { total, open, high, readiness };
}

export function compareReviewVersions(previous, current) {
  if (!previous || !current) return null;
  const prevQuestions = new Map((previous.issues || []).map((x) => [x.rule, x]));
  const currQuestions = new Map((current.issues || []).map((x) => [x.rule, x]));
  const resolved = [];
  const remaining = [];
  const newIssues = [];

  for (const [rule, issue] of prevQuestions) {
    if (!currQuestions.has(rule)) resolved.push(issue);
    else remaining.push(currQuestions.get(rule));
  }
  for (const [rule, issue] of currQuestions) {
    if (!prevQuestions.has(rule)) newIssues.push(issue);
  }

  const prevScores = previous.analysis?.scores || {};
  const currScores = current.analysis?.scores || {};
  const scoreDelta = {};
  for (const key of Object.keys(currScores)) scoreDelta[key] = (currScores[key] || 0) - (prevScores[key] || 0);

  return {
    totalBefore: Number(previous.analysis?.total || 0),
    totalAfter: Number(current.analysis?.total || 0),
    totalDelta: Number(current.analysis?.total || 0) - Number(previous.analysis?.total || 0),
    scoreDelta,
    resolved,
    remaining,
    newIssues,
  };
}
