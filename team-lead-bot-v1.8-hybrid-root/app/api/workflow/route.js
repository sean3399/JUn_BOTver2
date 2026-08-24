import { createTextResponse } from "@/lib/openaiClient";
import { guardRequest } from "@/lib/serverGuards";

export const runtime = "nodejs";

function parseJsonObject(text = "") {
  const raw = String(text || "").trim();
  const candidates = [
    raw,
    raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
  ];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (e) {}
  }
  throw new Error("모델의 구조화 응답을 해석하지 못했습니다.");
}

function safeIssue(issue = {}) {
  return {
    id: String(issue.id || ""),
    severity: String(issue.severity || "MEDIUM"),
    rule: String(issue.rule || "검토 항목"),
    title: String(issue.title || "보완 필요"),
    question: String(issue.question || "").slice(0, 1200),
    gap: String(issue.gap || "").slice(0, 800),
    evidence: issue.evidence ? {
      file: String(issue.evidence.file || "").slice(0, 300),
      location: String(issue.evidence.location || "").slice(0, 300),
      snippet: String(issue.evidence.snippet || "").slice(0, 1800),
    } : null,
  };
}

async function suggestFix(body) {
  const issue = safeIssue(body.issue);
  const acceptedEdits = Array.isArray(body.acceptedEdits) ? body.acceptedEdits.slice(-8) : [];
  const instructions = `당신은 사내 보고서의 지적사항을 고치는 편집 도우미입니다.
목표는 문서를 그럴듯하게 꾸미는 것이 아니라, 주어진 지적사항 하나를 해결할 수 있는 최소 수정안을 만드는 것입니다.
절대 문서에 없는 숫자, 규정, 담당자, 일정, 근거를 지어내지 마세요.
사실 확인이 필요한 경우 반드시 [확인 필요: ...] 형태의 자리표시자를 남기세요.
현재 문맥이 불완전하면 전체 문장을 임의로 재작성하지 말고 추가해야 할 문장/근거의 템플릿을 제안하세요.
반드시 JSON 객체 하나만 반환하세요. Markdown 코드블록을 쓰지 마세요.
스키마: {"suggestedText":"수정안", "why":"왜 이 수정이 지적을 줄이는지", "needsInput":["사용자가 확인해야 할 사실"], "confidence":"high|medium|low"}`;
  const input = JSON.stringify({ issue, acceptedEdits }, null, 2);
  const text = await createTextResponse({ instructions, input, maxOutputTokens: 1400 });
  return parseJsonObject(text);
}

async function junRewrite(body) {
  const issue = safeIssue(body.issue);
  const analysis = body.analysis || {};
  const intensity = ["sentence", "structure", "submission"].includes(String(body.intensity)) ? String(body.intensity) : "structure";
  const source = String(issue?.evidence?.snippet || body.sourceText || "").trim().slice(0, 5000);
  if (!source) throw new Error("수정할 원문 근거가 없습니다.");

  const intensityGuide = {
    sentence: "문장 표현과 길이만 다듬습니다. 논리 구조나 의미를 크게 바꾸지 않습니다.",
    structure: "팀장님이 선호할 법한 결론→근거→조건/액션 순으로 재배열하되 원문 사실은 유지합니다.",
    submission: "상신 직전 팀장님이 직접 손보는 수준으로 간결하게 정리합니다. 단, 없는 근거를 채워 넣지 않습니다.",
  }[intensity];

  const instructions = `당신은 JUN Rewrite입니다. 일반적인 문장 교정 AI가 아니라, 실제 팀장님의 반복된 보고 선호를 반영해 문장을 손보는 역할입니다.
목표는 '더 전문적인 컨설팅 문서'가 아니라 '이 팀장에게 보고하기 편한 문장'입니다.
현재 문서 단계는 ${analysis?.documentStage?.label || "일반 검토"}입니다. 현재 단계보다 한 단계 앞선 자료를 새로 요구하거나 의미를 확장하지 마세요.
수정 강도: ${intensityGuide}
절대 원문에 없는 숫자, 일정, 규정, 담당자, 승인, 매출, 손익, 근거를 추가하지 마세요.
의미가 바뀔 가능성이 있거나 사실 확인이 필요한 부분은 [확인 필요: ...]로 남기세요.
과도한 전문용어, ROI/민감도/밸류에이션 같은 컨설턴트식 확장은 금지합니다.
팀장 스타일의 핵심은 짧은 결론, 이유가 보이는 구조, 팩트와 의견 분리, 필요한 확인만 남기는 것입니다.
반드시 JSON 객체 하나만 반환하세요. Markdown 코드블록 금지.
스키마: {"originalText":"원문","revisedText":"수정본","why":"팀장 스타일로 바꾼 이유 1~2문장","changes":["핵심 변경"],"needsInput":["확인 필요한 사실"],"confidence":"high|medium|low"}`;

  const context = {
    documentStage: analysis?.documentStage || null,
    managerPatterns: Array.isArray(analysis?.managerPatterns) ? analysis.managerPatterns.slice(0, 6) : [],
    issue,
    sourceText: source,
  };
  const text = await createTextResponse({ instructions, input: JSON.stringify(context, null, 2), maxOutputTokens: 1600 });
  return parseJsonObject(text);
}

async function advisorReview(body) {
  const analysis = body.analysis || {};
  const issues = (Array.isArray(body.issues) ? body.issues : []).slice(0, 10).map(safeIssue);
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 5).map((f) => ({
    name: String(f?.name || ""),
    visualReview: f?.visualReview || null,
  }));
  const advisorQuestions = (Array.isArray(analysis?.advisorQuestions) ? analysis.advisorQuestions : []).slice(0, 8).map((q) => ({
    rule: q.rule, severity: q.severity, question: q.q,
  }));

  const instructions = `당신은 ADVISOR입니다. JUN(팀장 시뮬레이터)과 역할이 분리된 전문 검토자입니다.
문서의 논리·재무·조직·실행·리스크를 더 깊게 볼 수 있지만, 현재 문서 단계와 다음 단계 요구사항을 반드시 구분하세요.
현재 단계: ${analysis?.documentStage?.label || "일반 검토"}.
현재 기획단계에서 없어도 되는 정교한 손익표/ROI/수요예측 등을 '현재 누락'으로 몰아붙이지 마세요. 필요하면 '다음 단계에서 준비'로 분리하세요.
근거가 없는 숫자·규정·일정·결론을 만들지 마세요. 제공된 분석/이슈/근거 위치 밖의 사실을 본 것처럼 말하지 마세요.
JUN의 말투를 흉내 내지 말고 전문적이되 실무적으로 작성하세요.
반드시 JSON 객체 하나만 반환하세요. Markdown 코드블록 금지.
스키마: {"overall":"strong|balanced|needs-work","summary":"총평 2~3문장","strengths":["잘 된 점"],"now":[{"title":"현재 단계에서 보완할 점","why":"이유","evidence":"근거/위치가 있으면 짧게"}],"later":[{"title":"다음 단계에서 준비할 점","why":"왜 나중에 필요한지"}]}`;

  const context = {
    documentStage: analysis?.documentStage || null,
    reportType: analysis?.reportTypeLabel || "일반 보고",
    scores: analysis?.scores || {},
    verdict: analysis?.verdict || "",
    advisorQuestions,
    issues,
    files,
    note: String(body.note || "").slice(0, 3000),
  };
  const text = await createTextResponse({ instructions, input: JSON.stringify(context, null, 2), maxOutputTokens: 2200 });
  return parseJsonObject(text);
}

async function compareFeedback(body) {
  const issues = (Array.isArray(body.issues) ? body.issues : []).slice(0, 10).map(safeIssue);
  const actualFeedback = String(body.actualFeedback || "").trim().slice(0, 8000);
  if (!actualFeedback) throw new Error("실제 팀장 피드백을 입력해 주세요.");

  const instructions = `당신은 예측 검증기입니다. 예측된 팀장 검토 이슈와 실제 팀장 피드백을 비교하세요.
문장 표현이 달라도 핵심 쟁점이 같으면 적중으로 볼 수 있지만, 억지로 적중 처리하지 마세요.
실제 피드백에 없는 내용은 실제로 있었다고 추정하지 마세요.
accuracy는 핵심 쟁점 기준 0~100 정수입니다.
반드시 JSON 객체 하나만 반환하세요. Markdown 코드블록 금지.
스키마: {"accuracy":0,"summary":"한 줄", "matched":[{"prediction":"예측","actual":"실제","strength":"strong|partial"}], "missed":["예측했지만 실제 언급 없음"], "surprises":["실제 있었지만 예측 못한 쟁점"]}`;
  const text = await createTextResponse({
    instructions,
    input: JSON.stringify({ predictedIssues: issues, actualFeedback }, null, 2),
    maxOutputTokens: 1800,
  });
  return parseJsonObject(text);
}

function formatInstruction(format) {
  switch (format) {
    case "mail": return "격식 있는 내부 이메일. 핵심 판단→이유→후속 순서, 짧게.";
    case "oral": return "30초 내 구두보고 스크립트. 결론부터 말하고 4~6문장.";
    case "onepage": return "1페이지 보고 메모 형식. 결론/핵심 근거/남은 확인사항/요청사항을 짧은 항목으로.";
    case "three": return "상사에게 바로 보낼 결론 3줄. 정확히 3개의 짧은 문장.";
    default: return "Teams 메신저 보고. 3~6문장, 결론부터 자연스럽게.";
  }
}

async function buildSubmission(body) {
  const format = String(body.format || "teams");
  const issues = (Array.isArray(body.issues) ? body.issues : []).slice(0, 10).map(safeIssue);
  const acceptedEdits = (Array.isArray(body.acceptedEdits) ? body.acceptedEdits : []).slice(0, 12).map((x) => ({
    issueTitle: String(x.issueTitle || "").slice(0, 300),
    text: String(x.text || "").slice(0, 1800),
  }));
  const axisContext = Object.entries(body.analysis?.axisDetails || {}).slice(0, 6).map(([key, value]) => ({
    key,
    score: Number(value?.score || 0),
    summary: String(value?.summary || "").slice(0, 500),
    positives: Array.isArray(value?.positives) ? value.positives.slice(0, 3).map((x) => String(x).slice(0, 300)) : [],
    snippet: String(value?.snippet || "").slice(0, 600),
  }));
  const context = {
    files: Array.isArray(body.files) ? body.files.slice(0, 5).map((x) => String(x.name || x).slice(0, 300)) : [],
    note: String(body.note || "").slice(0, 3000),
    total: Number(body.analysis?.total || 0),
    verdict: String(body.analysis?.verdict || "").slice(0, 500),
    decisionStage: String(body.analysis?.decisionStage?.label || "").slice(0, 200),
    axisContext,
    assumptionTrace: Array.isArray(body.analysis?.assumptionTrace?.items)
      ? body.analysis.assumptionTrace.items.slice(0, 6).map((x) => ({ type: x.type, value: x.value, source: x.source, status: x.status }))
      : [],
    openIssues: issues.filter((x) => x.status !== "resolved"),
    acceptedEdits,
  };

  const instructions = `당신은 상신 직전 정리 도우미입니다.
주어진 검토 결과와 사용자가 채택한 수정안만 사용해 상신용 문안을 만드세요.
문서 원문 전체가 제공된 것이 아니므로 새로운 사실·숫자·규정·일정·결론을 만들어내지 마세요.
정보가 부족한 핵심 항목은 숨기지 말고 "확인 중" 또는 "추가 확인 필요"라고 표현하세요.
출력 형식: ${formatInstruction(format)}
최종 문안만 반환하고 해설은 붙이지 마세요.`;
  const text = await createTextResponse({ instructions, input: JSON.stringify(context, null, 2), maxOutputTokens: 1800 });
  return { text };
}

export async function POST(req) {
  try {
    const guard = guardRequest(req, "workflow");
    if (guard) return guard;
    const body = await req.json();
    const action = String(body.action || "");

    let result;
    if (action === "suggest_fix") result = await suggestFix(body);
    else if (action === "jun_rewrite") result = await junRewrite(body);
    else if (action === "advisor_review") result = await advisorReview(body);
    else if (action === "compare_feedback") result = await compareFeedback(body);
    else if (action === "submit_package") result = await buildSubmission(body);
    else return Response.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });

    return Response.json({ result });
  } catch (err) {
    return Response.json({ error: err.message || "워크플로우 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
