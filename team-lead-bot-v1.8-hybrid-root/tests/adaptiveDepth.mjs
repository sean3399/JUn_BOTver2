import assert from 'node:assert/strict';
import { analyzeDocument, buildAnalysisPrompt } from '../lib/managerLogic.js';

const simpleOrder = analyzeDocument(`
명함 제작 관련하여 200매 주문 시 660,000원이며 1,000매 주문 시 1,020,000원입니다.
주문 수량 말씀 주시면 구매 요청서 올리겠습니다.
`);
assert.equal(simpleOrder.junDepth.level, 0, '단순 구매·수량 결정은 L0로 낮아져야 함');
assert.equal(simpleOrder.junQuestions.length, 0, 'L0에서는 억지 확인 질문을 만들지 않아야 함');

const budget = analyzeDocument(`
2026년 대회 지원 예산을 증액하고자 합니다.
중식 및 회식비는 70명 기준 350만원에서 420만원으로 증액합니다.
연습경기비는 기존 1회 70만원에서 총 3회 150만원으로 확대합니다.
검토 부탁드립니다.
`);
assert.ok(budget.junDepth.level >= 2, '예산·금액 판단은 L2 이상이어야 함');
assert.ok(budget.junQuestions.some((q) => q.rule === '금액 산정'), '예산에서는 비용 산정 근거 질문이 우선되어야 함');

const fairness = analyzeDocument(`
리조트 미당첨 객실을 선착순으로 배정하는 운영안입니다.
예약일까지 시간이 촉박해 기존에는 선착순으로 운영했으며 위약금 발생 전 취소가 필요합니다.
형평성 이슈가 있어 재추첨 방식도 검토 중입니다.
`);
assert.ok(fairness.junDepth.level >= 2, '형평성 이슈는 판단 깊이를 올려야 함');
assert.equal(fairness.junQuestions[0]?.rule, '운영 기준', '형평성 운영안에서는 왜 그 방식을 쓰는지 먼저 묻는 패턴이 우선되어야 함');

const systemIntro = analyzeDocument(`
신규 JD 평가 프로세스를 도입하고 DNA LAB에서 결과를 관리합니다.
평가와 관리 기능을 제공하며 검토 부탁드립니다.
`);
assert.equal(systemIntro.junDepth.level, 1, '신규 시스템 소개만으로 과도한 심층 검토를 시작하지 않아야 함');
assert.equal(systemIntro.junQuestions[0]?.rule, '초견 이해도', '신규 평가/시스템 소개는 처음 보는 사람의 이해도 질문이 우선되어야 함');

const genericOrg = analyzeDocument(`
조직 신설 및 인원 운영 방향을 정리한 기획안입니다.
사업화 방향과 조직 구성안을 검토 부탁드립니다.
`);
assert.ok(!genericOrg.junQuestions.some((q) => q.rule === '전결/책임' || q.rule === '판단 주체'), '일반 검토 요청만으로 전결/판단주체 질문을 만들면 안 됨');

const highRisk = analyzeDocument(`
전사 공통 지급 규정을 변경하고 예외 적용 기준을 신설합니다.
개인정보와 정보보안 이슈가 있으며 어뷰징 가능성도 있어 결재선과 운영 기준을 함께 검토해야 합니다.
예산 2억원 집행이 포함됩니다.
`);
assert.equal(highRisk.junDepth.level, 3, '금액·규정·보안·전사영향이 겹치면 L3이어야 함');

const prompt = buildAnalysisPrompt(budget);
assert.match(prompt, /이번 판단 깊이/);
assert.match(prompt, /패턴 근거/);
assert.doesNotMatch(prompt, /JUN 유사도/);

console.log('✓ V2.2.2 adaptive JUN depth / conditional owner / reader clarity checks passed');
