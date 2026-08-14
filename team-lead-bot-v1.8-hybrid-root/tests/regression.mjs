import assert from "node:assert/strict";
import { matchPrecedent } from "../lib/precedents.js";
import { validateReply } from "../lib/responseGuard.js";
import { analyzeDocument } from "../lib/managerLogic.js";

function precedentTest(name, source, expectedId, expectedRelationship) {
  const match = matchPrecedent(source);
  assert.ok(match, `${name}: precedent should match`);
  assert.equal(match.id, expectedId, `${name}: wrong precedent`);
  assert.equal(match.relationship, expectedRelationship, `${name}: wrong relationship`);
  assert.ok(match.reasoningPattern, `${name}: reasoning pattern missing`);
  assert.ok(match.observedOutcome, `${name}: observed outcome missing`);
  console.log(`✓ ${name} -> ${match.title} (${match.relationship})`);
}

precedentTest(
  "경조금 신청기한 경과",
  `경조금 신청 가능 기한은 5월 21일까지였고 5월 22일 문의가 들어왔습니다. 신청기한이 경과한 건이라 예외 지급 여부를 검토 요청드립니다.`,
  "bereavement-deadline",
  "SAME",
);

precedentTest(
  "PAYCO 과표 마감",
  `7월 급여 과표 추가 요청은 16일자로 마감됐고 오늘 추가 지급 요청이 왔습니다. 이번 달 지급 검토 또는 다음 달 이월 중 어떤 방향으로 할까요?`,
  "payroll-cutoff",
  "SAME",
);

precedentTest(
  "축구동호회 예산 증액",
  `축구동호회 대회 예산 증액안입니다. 참석 70명, 중식 및 회식비 증액, 연습경기 지원, 차량 대절비를 포함했습니다.`,
  "soccer-budget-basis",
  "SAME",
);

precedentTest(
  "전결 관행",
  `기존에는 내부품의를 본부장님까지 올렸습니다. 전결 규정상 부문장 승인으로 보이지만 예전부터 관행으로 진행해왔습니다.`,
  "approval-tradition",
  "SAME",
);

precedentTest(
  "리조트 재배정 공지",
  `리조트 미당첨 객실은 선착순으로 재배정해왔습니다. 재추첨이 더 합리적으로 보이지만 최초 공지에서 미당첨 차수는 선착순으로 안내했습니다.`,
  "resort-reallocation",
  "SAME",
);

// 과거 사례는 정답 잠금이 아니라 현재 사실을 보정하는 참고 근거여야 한다.
const partial = matchPrecedent(`경조금 관련해서 신청 기한 확인이 필요합니다. 아직 실제 기한 경과 여부는 확인 중입니다.`);
assert.ok(partial === null || partial.relationship !== "SAME", "불완전한 사실관계를 SAME으로 과잉 매칭하면 안 됨");
console.log("✓ 불완전한 사례는 강한 과거 결론으로 잠그지 않음");

const hallucinatedPayroll = `원칙: 이월. 단 조건 충족 시 예외 승인. 대상 인원 ≤10명, 총지급 ≤10M, 4대보험/원천세 재계산, D+60 리마인드, 예외로그 작성.`;
const sourcePayroll = `7월 과표 추가 요청은 16일 마감되었습니다. 다음 달 지급 및 과표 반영으로 이월 검토.`;
const payrollGuard = validateReply({ reply: hallucinatedPayroll, sourceText: sourcePayroll, mode: "messenger", review: true });
assert.equal(payrollGuard.ok, false, "hallucinated payroll policy should be rejected");
assert.ok(payrollGuard.problems.some((p) => p.includes("근거 없는")), "guard should report unsupported claims");
console.log("✓ 과표 과잉 정책 생성 가드 차단");

const longAudit = `필수 확인\n- 70명 산정\n- 연습경기 1,500천원\n운영/리스크\n- 일정 확인\n타임라인\n- 오늘 15시까지 취합\n커뮤니케이션\n- 예외로그 작성`;
const budgetGuard = validateReply({ reply: longAudit, sourceText: `70명 기준 예산 증액`, mode: "messenger", review: true });
assert.equal(budgetGuard.ok, false, "audit checklist should be rejected");
console.log("✓ 감사 체크리스트형 과잉 답변 가드 차단");

const botLike = `원칙\n이 건은 다음달 지급입니다.\n이유\n마감이 지났습니다.`;
const botLikeGuard = validateReply({ reply: botLike, sourceText: `마감이 지났습니다.`, mode: "messenger", review: true });
assert.equal(botLikeGuard.ok, false, "sectioned bot-like messenger response should be rejected");
console.log("✓ 봇 같은 섹션형 Teams 응답 차단");

const analysis = analyzeDocument(`
축구동호회 2026년 대회 지원 예산 증액안
참석인원 70명 기준으로 중식 및 회식비를 지원하고 연습경기 지원을 확대하고자 합니다.
대회 참가를 차질 없이 지원하고 선수단을 격려하기 위한 취지입니다.
총 예산 7,460천원이며 차량 대절비 400천원을 신규 반영합니다.
`);
assert.equal(analysis.reportType, "budget");
assert.ok(analysis.axisDetails?.legitimacy, "6축 상세 근거가 있어야 함");
assert.ok(Array.isArray(analysis.documentEvidence), "현재 문서 근거가 있어야 함");
assert.ok(Array.isArray(analysis.managerPatterns), "팀장 행동패턴 근거가 있어야 함");
assert.ok(analysis.decisionStage?.label, "현재 판단 단계가 있어야 함");
assert.ok(analysis.questions.some((q) => q.rule === "금액 산정"), "예산 증액안에서 산정근거 질문이 우선되어야 함");
console.log("✓ 6축 + 근거 + 판단단계 대시보드 데이터 생성");

console.log("\nAll V1.8.3 Adaptive Manager regression checks passed.");
