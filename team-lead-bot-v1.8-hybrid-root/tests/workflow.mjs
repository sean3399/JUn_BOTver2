import assert from "node:assert/strict";
import { buildReviewIssues, compareReviewVersions, summarizeReview } from "../lib/reviewWorkflow.js";

const analysisV1 = {
  total: 62,
  scores: { facts: 60, causality: 58, legitimacy: 48, proportionality: 70, execution: 60, communication: 65 },
  axisDetails: {
    legitimacy: { snippet: "의료비 680백만원, 변동성 버퍼 20백만원", gaps: ["비용 산식 보완 필요"] },
    execution: { snippet: "추후 진행 예정", gaps: ["담당 주체가 불명확함"] },
  },
  questions: [
    { severity: "HIGH", rule: "금액 산정", q: "20백만원은 어떤 기준으로 산정된 건가요?" },
    { severity: "HIGH", rule: "실행성", q: "실제로 누가 언제 처리하나요?" },
  ],
};

const docs = [{
  name: "2027예산_0813.xlsx",
  text: "[시트 1: 예산]\\n[행 17] F17=의료비 680백만원 | G17=변동성 버퍼 20백만원\\n[행 20] A20=추후 진행 예정",
}];

const issuesV1 = buildReviewIssues(analysisV1, docs);
assert.equal(issuesV1.length, 2);
assert.match(issuesV1[0].evidence.location, /시트 1: 예산 · 행 17/);
assert.equal(issuesV1[0].evidence.file, "2027예산_0813.xlsx");
const summary = summarizeReview(analysisV1, issuesV1);
assert.equal(summary.readiness, "NOT_READY");

const analysisV2 = {
  total: 81,
  scores: { facts: 72, causality: 70, legitimacy: 78, proportionality: 72, execution: 62, communication: 72 },
  axisDetails: { execution: { snippet: "추후 진행 예정", gaps: ["담당 주체가 불명확함"] } },
  questions: [
    { severity: "HIGH", rule: "실행성", q: "실제로 누가 언제 처리하나요?" },
    { severity: "MEDIUM", rule: "대안", q: "추천안이 막히면 다음 대안은 무엇인가요?" },
  ],
};
const issuesV2 = buildReviewIssues(analysisV2, docs);
const comparison = compareReviewVersions(
  { analysis: analysisV1, issues: issuesV1 },
  { analysis: analysisV2, issues: issuesV2 },
);
assert.equal(comparison.totalDelta, 19);
assert.deepEqual(comparison.resolved.map((x) => x.rule), ["금액 산정"]);
assert.deepEqual(comparison.remaining.map((x) => x.rule), ["실행성"]);
assert.deepEqual(comparison.newIssues.map((x) => x.rule), ["대안"]);
assert.equal(comparison.scoreDelta.legitimacy, 30);


const visualAnalysis = {
  total: 70,
  scores: { facts: 60, causality: 60, legitimacy: 60, proportionality: 60, execution: 60, communication: 60 },
  axisDetails: { legitimacy: { snippet: "525만원", gaps: ["견적 근거 확인"] } },
  questions: [{ severity: "HIGH", rule: "금액 산정", q: "525만원은 어디에서 확인된 금액인가요?" }],
};
const visualDocs = [{
  name: "연동검토.pptx",
  text: "[슬라이드 8] 연동방식 비교\n[슬라이드 8 · 이미지 2 · Visual/OCR] API 방식 견적 525만원 (VAT 별도)",
}];
const visualIssues = buildReviewIssues(visualAnalysis, visualDocs);
assert.match(visualIssues[0].evidence.location, /슬라이드 8 · 이미지 2 · Visual\/OCR/);

console.log("✓ Review Cycle issue/evidence/version comparison + Visual evidence checks passed");
