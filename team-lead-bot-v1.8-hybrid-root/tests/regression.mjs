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
  "예산 가정값 상위 근거",
  `2027년 의료비 예산은 10% 상향 편성하고 예상 증원은 19명으로 가정했습니다. 월평균 대비 5.3백만원을 추가 편성했고 고액 경조 변동 가능성 20백만원을 반영했습니다. 산정 근거를 검토합니다.`,
  "budget-assumption-traceability",
  "SIMILAR",
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



const weakAssumptionBudget = analyzeDocument(`
2027년 의료비 및 경조금 예산안입니다.
2026년 예상 집행액은 641.6백만원, 월평균 53.5백만원입니다.
2027년은 10% 상향한 705.7백만원으로 편성했습니다.
2027년 예상 증원은 19명으로 가정했으며 현재 대비 1.4% 증가입니다.
증원 영향은 월 0.7백만원입니다.
월평균 대비 5.3백만원은 월별 집행액 46.3~69.1백만원의 변동성과 고액진료 가능성을 고려했습니다.
경조금은 임원 및 고액 경조 변동 가능성 20백만원을 추가 반영했습니다.
`);
assert.equal(weakAssumptionBudget.reportType, "budget");
assert.ok(weakAssumptionBudget.assumptionTrace?.relevant, "예산의 핵심 가정 추적이 활성화되어야 함");
assert.ok(weakAssumptionBudget.assumptionTrace.gaps.length >= 2, "19명/5.3백만원/20백만원 같은 상위 근거 약한 가정을 잡아야 함");
assert.ok(weakAssumptionBudget.questions.some((q) => q.rule === "가정 추적"), "예산 가정값의 why 질문이 우선 생성되어야 함");
assert.ok(weakAssumptionBudget.managerPatterns.some((p) => p.includes("상위 가정")), "팀장 패턴에 가정 추적 성향이 표시되어야 함");
console.log("✓ 핵심 숫자의 부모 근거까지 추적하는 Assumption Traceability");

const supportedAssumptionBudget = analyzeDocument(`
2027년 의료비 예산안입니다.
전년도 예산 수립 시 2026년 예상인원을 1,406명으로 산정한 기준을 참고해, 확정 인력계획 전 예산 부족 가능성을 고려하여 2027년 예상인원을 1,410명으로 보수적으로 가정했습니다. 현재 1,391명 대비 19명 증가입니다.
최근 19개월 의료비 실적의 약 95%가 월 58.8백만원 이하에 포함되어 월 58.8백만원을 기준으로 편성했습니다. 기존 월평균 53.5백만원 대비 약 5.3백만원 증가입니다.
고액 경조 20백만원은 발생빈도 근거가 부족하여 별도 버퍼에서 삭제했습니다.
`);
assert.ok(supportedAssumptionBudget.assumptionTrace?.items?.length >= 2, "보완된 문서에서도 가정값 추적 내역이 보여야 함");
assert.ok(supportedAssumptionBudget.assumptionTrace.good.length >= 1, "전년도 인력계획/95% 실적 분포처럼 상위 근거가 있는 가정은 확인 처리되어야 함");
console.log("✓ 상위 근거가 연결된 가정은 확인 상태로 개선");


console.log("\nBase V1.8.4 regression checks passed.");

precedentTest(
  "사업계획 예산 설명가능성",
  `2027년 사업계획 예산입니다. 전략기획에서 총액 삭감 가능성이 있어 항목별 산식과 버퍼, 법적 필수 비용을 구분하고 증원 반영 및 미반영 기준을 남기려고 합니다.`,
  "budget-defensibility",
  "SIMILAR",
);

precedentTest(
  "권한 사용빈도 기반 통제",
  `시스템 권한을 정리합니다. 매일 사용하는 권한은 상시 유지하고 1년에 한 번 쓰는 권한은 회수 후 필요 시 기간을 정해 재신청하는 방식입니다.`,
  "access-frequency-control",
  "SIMILAR",
);

precedentTest(
  "선조치 후 보고",
  `경영진단 후속조치입니다. 8월 말 계획서 제출 전에 바로 처리할 수 있는 항목은 먼저 조치 완료 상태로 만들고 보고하려고 합니다.`,
  "action-before-plan",
  "SIMILAR",
);

const meetingStyleAnalysis = analyzeDocument(`
2027년 사업계획 예산을 검토 중입니다.
각 항목의 인원 × 단가 × 횟수와 버퍼 산정 사유를 남기고, 법적으로 필요한 필수 비용은 별도로 표시하려고 합니다.
증원 요청은 사업장별 필요성과 우선순위를 확인해 반영/미반영 근거를 기록하겠습니다.
시스템 권한은 매일 사용하는 권한과 연 1회 사용하는 권한을 구분해 상시 여부를 달리 검토합니다.
후속조치 중 바로 처리 가능한 건은 계획서 제출 전에 먼저 완료하고, 샘플 확인이 필요한 건은 시안을 본 뒤 결정하겠습니다.
제 생각에는 새 방식이 더 나아 보이지만 기존 안내 내용도 확인 후 판단하겠습니다.
`);
assert.equal(meetingStyleAnalysis.metaPrinciples?.length, 7, "V2.2.2 판단 OS 7개(Reader Clarity 포함)가 있어야 함");
for (const key of ["factFirst", "whyTrace", "proportionalControl", "revisableOpinion", "decisionOwner", "actWhenClear", "readerClarity"]) {
  assert.ok(meetingStyleAnalysis.metaPrinciples.some((x) => x.key === key), `판단 OS ${key} 누락`);
}
assert.ok(meetingStyleAnalysis.metaPrinciples.filter((x) => x.active).length >= 4, "회의형 문서에서 여러 판단 OS가 활성화되어야 함");
assert.ok(meetingStyleAnalysis.stanceSeparation?.summary, "팩트/의견 분리 해설이 있어야 함");
assert.ok(meetingStyleAnalysis.documentEvidence.some((x) => x.key === "defensibility"), "판단 이력·설명가능성 근거 카드가 있어야 함");
assert.ok(!meetingStyleAnalysis.documentEvidence.some((x) => x.key === "ownership"), "일반 예산/권한 문맥만으로 판단주체 카드를 강제하면 안 됨");
console.log("✓ V2.2.2 판단 OS + 설명가능성 + 조건부 판단주체 데이터 생성");

const uncertainSource = `이 방식이 더 나아 보이는데 아직 샘플 확인이 필요하고 최종 결정은 미정입니다.`;
const tooCertain = `무조건 이 방식이 정답입니다.`;
const certaintyGuard = validateReply({ reply: tooCertain, sourceText: uncertainSource, mode: "messenger", review: true });
assert.equal(certaintyGuard.ok, false, "불확실한 사안에서 과도한 단정을 차단해야 함");
assert.ok(certaintyGuard.problems.some((p) => p.includes("확정적으로")), "확정적 단정 가드 사유가 보여야 함");
console.log("✓ 의견은 수정 가능한 스탠스로 유지하는 과잉 단정 가드");

console.log("\nAll V1.9 Judgment OS regression checks passed.");

// V1.9.1: 후속 대화의 6축 분석은 최초 입력 누적본이 아니라 직전 질문 + 이번 답변으로 재계산해야 한다.
const { buildTurnAnalysisSource } = await import("../lib/turnContext.js");
const turn1 = buildTurnAnalysisSource([
  { role: "user", content: "의료비 예산을 10% 상향했습니다. 19명 증원을 가정했습니다." },
]);
assert.equal(turn1.scope, "current_request");
assert.ok(turn1.source.includes("19명"), "첫 요청은 현재 요청 자체를 분석해야 함");

const turn2 = buildTurnAnalysisSource([
  { role: "user", content: "의료비 예산을 10% 상향했습니다. 19명 증원을 가정했습니다." },
  { role: "assistant", content: "19명은 어떤 기준으로 잡은 건가요?" },
  { role: "user", content: "전년도 예상인원 1,406명을 기준으로 1,410명까지 보수적으로 보고 현재 1,391명 대비 19명으로 잡았습니다." },
]);
assert.equal(turn2.scope, "follow_up_turn");
assert.ok(turn2.source.includes("직전 팀장님 반응"));
assert.ok(turn2.source.includes("전년도 예상인원"));
assert.ok(!turn2.source.includes("의료비 예산을 10% 상향했습니다. 19명 증원을 가정했습니다."), "최초 사용자 입력을 후속 분석에 그대로 누적하면 안 됨");
const turn2Analysis = analyzeDocument(turn2.source);
assert.ok(turn2Analysis.scores.facts !== weakAssumptionBudget.scores.facts || turn2Analysis.scores.legitimacy !== weakAssumptionBudget.scores.legitimacy, "후속 턴 분석은 최초 6축과 독립적으로 재계산되어야 함");
console.log("✓ V1.9.1 후속 턴 6축 분석 재계산 — 최초 분석 고정 오류 방지");
