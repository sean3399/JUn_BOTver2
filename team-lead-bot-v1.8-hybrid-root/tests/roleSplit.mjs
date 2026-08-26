import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeDocument, buildAnalysisPrompt } from "../lib/managerLogic.js";

const concept = analyzeDocument(`
PARNAS ACADEMY 검토배경
중점 추진과제 및 사업화 추진 방향
아카데미 조직 구성(안)
2026년 오픈 후 2027년 사업성 검증을 거쳐 자회사 출범을 검토함
Pre-Spinoff 12명 + 법인설립 TF, Post-Spinoff 18+α명
그룹사 및 B2B·B2C 교육사업 확대 방향 검토
`);
assert.equal(concept.documentStage.key, "concept", "기획안은 기획·방향성 단계로 잡혀야 함");
assert.ok(concept.junQuestions.length <= 2, "기획단계 JUN 질문은 최대 2개여야 함");
assert.ok(!concept.junQuestions.some((q) => ["가정 추적", "금액 산정", "리스크", "대안"].includes(q.rule)), "기획단계 일반 조직안에서 재무/컨설팅 질문이 JUN으로 올라오면 안 됨");
assert.ok(Array.isArray(concept.advisorQuestions), "ADVISOR용 질문 풀은 별도 유지되어야 함");

const budget = analyzeDocument(`
2027년 의료비 예산안입니다. 2026년 예상 집행액은 641.6백만원입니다.
2027년은 10% 상향 편성하고 예상 증원 19명을 반영했습니다.
고액 변동 가능성 20백만원을 추가 반영했습니다.
`);
assert.equal(budget.reportType, "budget");
assert.ok(budget.junQuestions.some((q) => ["가정 추적", "금액 산정"].includes(q.rule)), "예산안에서는 기존 팀장 패턴의 숫자 근거 질문이 JUN에 남아야 함");

const prompt = buildAnalysisPrompt(concept);
assert.match(prompt, /JUN-ness Gate/);
assert.match(prompt, /ADVISOR 역할/);
assert.match(prompt, /현재 문서 단계/);


const { validateReply } = await import("../lib/responseGuard.js");
const drift = validateReply({
  reply: "26~27 재무 근거표와 ROI도 붙였나요?",
  sourceText: "아카데미 기획안",
  mode: "messenger",
  review: true,
  documentStage: { key: "concept" },
});
assert.equal(drift.ok, false, "기획단계 JUN의 컨설턴트식 재무 요구는 가드에서 차단되어야 함");
assert.ok(drift.problems.some((x) => x.includes("ADVISOR 수준")));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, "app/api/workflow/route.js"), "utf8");
assert.ok(workflow.includes('action === "jun_rewrite"'), "JUN Rewrite action must exist");
assert.ok(workflow.includes('action === "advisor_review"'), "ADVISOR action must exist");
const workspace = fs.readFileSync(path.join(root, "components/ReviewWorkspace.js"), "utf8");
assert.ok(workspace.includes("JUN Rewrite"));
assert.ok(workspace.includes("ADVISOR · 전문 검토"));
assert.ok(workspace.includes("팀장식 구조화"));
const health = fs.readFileSync(path.join(root, "app/api/health/route.js"), "utf8");
assert.ok(health.includes("roleSplit: true"));
assert.ok(health.includes("junStageGate: true"));

console.log("✓ V2.2 role split: JUN fidelity / JUN Rewrite / ADVISOR / Stage Gate checks passed");
