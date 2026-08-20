function normalize(text = "") {
  return String(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function containsAny(text, terms = []) {
  return terms.some((term) => text.includes(String(term).toLowerCase()));
}

function hitGroups(text, groups = []) {
  return groups.map((group) => containsAny(text, group));
}

export const PRECEDENTS = [
  {
    id: "bereavement-deadline",
    title: "경조금 신청기한 경과",
    strength: "HIGH",
    groups: [
      ["경조금", "경조사"],
      ["신청기한", "신청 기한", "기한"],
      ["경과", "지났", "다음날", "다음 날", "하루 지남", "하루 지났"],
    ],
    reasoningPattern: "개인 사정의 안타까움과 제도 판단을 분리한다. 이미 정해진 신청기한이 명확하다면 감정적 사유만으로 기준을 뒤집지 않고, 반복 문제는 안내 프로세스 개선으로 풀려는 경향이 있다.",
    observedOutcome: "과거 유사 사례에서는 기한 경과 건을 현행 기준대로 처리하고, 별도로 신청 가능 기한 안내 방식을 보완하는 방향을 제시했다.",
    doNot: ["하루 차이라는 이유만으로 자동 예외 승인", "새로운 90일/D+ 규칙 생성", "급여마감 자체를 미지급의 직접 원인으로 단정"],
  },
  {
    id: "payroll-cutoff",
    title: "급여/과표 마감 이후 추가 지급 요청",
    strength: "HIGH",
    groups: [
      ["과표", "급여"],
      ["마감", "마감일", "기한"],
      ["이번달", "이번 달", "다음달", "다음 달", "이월", "추가 지급"],
    ],
    reasoningPattern: "마감이 지났다는 사실만으로 결론내리지 않고, 이번 달 처리가 실제로 왜 어려운지 실무 제약을 먼저 확인한다. 제약이 확인되면 현실적인 다음 처리 시점으로 정리한다.",
    observedOutcome: "과거 사례에서는 '이번 달 안 되는 이유'를 먼저 확인한 뒤 과표 처리가 이미 마무리되어 재처리가 어렵다는 설명을 듣고 다음 달 지급/과표 반영으로 이월했다.",
    doNot: ["임의의 인원/금액 상한 생성", "D+ 리마인드·예외로그 같은 새 절차 생성", "세무/4대보험 체크리스트를 근거 없이 추가"],
  },
  {
    id: "budget-assumption-traceability",
    title: "예산 가정값의 상위 근거 추적",
    strength: "MEDIUM",
    groups: [
      ["예상", "추정", "가정", "편성"],
      ["증원", "월평균", "추가 편성", "상향", "변동", "고액", "예비비"],
      ["근거", "산정", "기준", "증가", "왜"],
    ],
    reasoningPattern: "산식이나 총액만 확인하지 않고, 그 산식에 들어간 핵심 가정값 자체가 왜 그 숫자인지 한 단계 위의 근거까지 추적한다. 인원 가정은 인력계획·과거 순증, 버퍼는 최근 실적 분포·백분위, 고액 변동분은 실제 발생빈도처럼 재현 가능한 근거를 요구하는 경향이 있다.",
    observedOutcome: "최근 예산 검토 사례에서는 예상 증원 인원, 월 추가 편성액, 고액 경조 변동분 각각에 대해 '왜 그 숫자인가'를 다시 질문했고, 가정값의 출처를 보완하도록 요구했다. 발생빈도 근거가 약한 고액 버퍼는 별도 근거 없이 유지하기보다 제거하거나 재산정하는 방향이 적합했다.",
    doNot: ["단순히 10% 상향이라고 근거가 닫혔다고 판단", "변동성이 있다는 이유만으로 임의 버퍼를 정당화", "숫자가 많다는 이유로 사실성/정당성을 과대평가"],
  },
  {
    id: "soccer-budget-basis",
    title: "동호회/대회 예산 증액 산정근거",
    strength: "HIGH",
    groups: [
      ["증액", "예산", "지원금"],
      ["축구", "연습경기", "회식비", "중식", "대회"],
      ["70명", "인당", "회당", "참가비", "차량 대절", "선수단"],
    ],
    reasoningPattern: "'왜 증액하는가'와 '왜 그 금액인가'를 구분한다. 비용 판단에서는 총액보다 인당 단가·회당 금액·횟수·수량 같은 산식을 확인하려는 경향이 강하다.",
    observedOutcome: "과거 사례에서는 증액 취지를 들은 뒤에도 비용 산정 근거를 다시 요구했고, 인당 단가와 연습경기 횟수×회당 금액이 제시되자 검토를 종료했다.",
    doNot: ["일반 내부통제 체크리스트로 확장", "근거 없는 견적 개수/구매 규정 요구", "총액을 새 기준으로 재환산해 상한 창작"],
  },
  {
    id: "approval-tradition",
    title: "관행성 내부품의/전결",
    strength: "HIGH",
    groups: [
      ["전결", "결재선", "내부품의", "내부 품의"],
      ["본부장", "부문장", "상무"],
      ["관행", "예전부터", "기존부터", "규정상", "규정"],
    ],
    reasoningPattern: "관행을 그 자체로 근거로 인정하지 않는다. 규정상 필요한 절차인지와 적정 전결선을 먼저 확인하고, 필요하지 않은 절차라면 없애는 쪽을 선호한다.",
    observedOutcome: "과거 사례에서는 기존 내부품의가 규정상 필수가 아니라 관행으로 보이자 불필요한 절차를 유지할 필요가 없다고 판단했다.",
  },
  {
    id: "resort-reallocation",
    title: "리조트 미당첨분 선착순 vs 재추첨",
    strength: "HIGH",
    groups: [
      ["리조트"],
      ["선착순", "재추첨", "추첨"],
      ["공지", "안내", "최초 공지"],
    ],
    reasoningPattern: "더 합리적인 방식이 있어도 이미 구성원에게 안내한 기준과의 일관성을 중요하게 본다. 금회 운영과 차기 개선을 분리하는 경향이 있다.",
    observedOutcome: "과거 사례에서는 재추첨이 더 합리적이라고 봤지만 이미 선착순으로 공지한 사실을 확인한 뒤 금회는 기존 안내를 유지하고 차기부터 개선하기로 했다.",
  },
  {
    id: "fact-only-investigation",
    title: "경영진단/사실관계 답변",
    strength: "HIGH",
    groups: [
      ["경영진단", "진단", "감사", "조사"],
      ["답변", "소명", "사유"],
      ["잘잘못", "책임", "왜 승인", "팩트", "사실"],
    ],
    reasoningPattern: "책임 공방보다 질문의 요지에 맞는 사실관계와 시간순 인과를 우선한다. 사실과 해석을 섞지 않으려는 경향이 있다.",
    observedOutcome: "과거 조사성 답변에서는 잘잘못을 가리는 서술보다 팩트만 정리하도록 지시했다.",
  },
  {
    id: "club-governance",
    title: "사내 동호회 관리 공백",
    strength: "MEDIUM",
    groups: [
      ["동호회"],
      ["정족수", "유령", "활동", "가입", "탈퇴"],
      ["지원금", "비용", "정산", "잔액"],
    ],
    reasoningPattern: "관리 공백의 히스토리와 실제 활동·지원금 집행을 확인하되, 문제 확인 후 곧바로 강한 통제로 가지 않고 현실적으로 필요한 최소 관리기준과 단계적 적용을 찾는다.",
    observedOutcome: "과거 개선안은 즉시 취소·강한 통제 방향에서 자율성을 유지하는 최소 확인·단계적 관리 방향으로 정교화됐다.",
  },
  {
    id: "resort-process-improvement",
    title: "리조트 예약업무 개선",
    strength: "MEDIUM",
    groups: [
      ["리조트"],
      ["예약", "문의", "챗봇", "자동화"],
      ["업무 개선", "프로세스", "업무량", "반복 문의", "AS-IS", "TO-BE"],
    ],
    reasoningPattern: "솔루션 자체보다 현재 업무량, 왜 바꾸는지, 가장 큰 변화, 실제 운영 프로세스와 담당자 역할 변화가 닫혀 있는지를 확인한다.",
    observedOutcome: "과거 개선안은 문제·업무량을 먼저 보여주고 AS-IS/TO-BE, 운영 방식, 단계적 추진으로 구체화되면서 평가가 좋아졌다.",
  },
  {
    id: "hr-ai-sensitive-data",
    title: "HR AI 마스터데이터",
    strength: "MEDIUM",
    groups: [
      ["AI", "인공지능"],
      ["직원", "인적사항", "마스터파일", "엑셀", "HR 데이터"],
      ["연봉", "보상", "민감", "징계", "평가"],
    ],
    reasoningPattern: "새로운 기술에는 개방적이지만 민감정보 범위를 구분하고 고위험 정보는 선을 긋는다. 급하게 전면 적용하기보다 단계적으로 정리하려는 경향이 있다.",
    observedOutcome: "과거 HR 데이터 활용 아이디어에서는 보상·연봉 정보를 제외하고 민감정보임을 강조하며 차근차근 진행하도록 했다.",
  },
  {
    id: "companywide-pregnancy",
    title: "임신부 관련 전사 적용 기준",
    strength: "MEDIUM",
    groups: [
      ["임신부", "임산부", "임신"],
      ["근무", "현장", "배려", "안전"],
      ["전사", "웨스틴", "IC", "제주", "공통 적용", "본부장"],
    ],
    reasoningPattern: "개별 현장의 선의만으로 결정하기보다 전사 공통 적용 가능성과 적절한 의사결정 주체를 먼저 확인한다.",
    observedOutcome: "과거 사례에서는 복수 사업장에 공통 적용될 수 있는 사안이라는 이유로 전사 기준과 의사결정 주체를 확인한 뒤 HR 후속조치로 정리했다.",
  },
  {
    id: "result-summary",
    title: "질의사항 결과요약",
    strength: "MEDIUM",
    groups: [
      ["질의", "문의사항", "확인 요청"],
      ["결과", "확인 결과", "답변"],
      ["보고", "메일", "회신"],
    ],
    reasoningPattern: "질의 회신은 배경보다 결과를 앞에 두고 단문으로 정리하는 것을 선호한다.",
    observedOutcome: "과거 질의 답변 문서는 [결과요약]을 먼저 두는 방식으로 수정하도록 피드백했다.",
  },
];

export function matchPrecedent(rawText, analysis = null) {
  const text = normalize(rawText);
  if (!text) return null;

  const candidates = PRECEDENTS.map((p) => {
    const hits = hitGroups(text, p.groups);
    const hitCount = hits.filter(Boolean).length;
    const ratio = p.groups.length ? hitCount / p.groups.length : 0;
    let score = ratio * 100;

    if (analysis?.reportType === "budget" && p.id === "soccer-budget-basis") score += 8;
    if (analysis?.reportType === "budget" && p.id === "budget-assumption-traceability") score += 7;
    if (analysis?.reportType === "policy" && ["bereavement-deadline", "approval-tradition", "club-governance"].includes(p.id)) score += 5;
    if (analysis?.reportType === "process" && p.id === "resort-process-improvement") score += 5;

    return { ...p, hitCount, hitRatio: ratio, score: Math.min(100, Math.round(score)) };
  }).sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) return null;

  const minRatio = best.strength === "HIGH" ? 2 / 3 : 2 / 3;
  if (best.hitRatio < minRatio) return null;

  const uncertain = containsAny(text, ["확인 중", "확인중", "여부 확인", "여부를 확인", "아직 확인", "미확인", "확정되지"]);

  let relationship = "PATTERN";
  if (best.strength === "HIGH" && best.hitRatio === 1 && !uncertain) relationship = "SAME";
  else if (best.hitRatio >= 2 / 3) relationship = "SIMILAR";

  return {
    id: best.id,
    title: best.title,
    strength: best.strength,
    relationship,
    score: best.score,
    reasoningPattern: best.reasoningPattern,
    observedOutcome: best.observedOutcome,
    doNot: best.doNot || [],
  };
}

export function buildPrecedentPrompt(match) {
  if (!match) return `\n\n[과거 사례 매칭]\n- 현재 사안과 충분히 유사한 과거 사례가 확인되지 않았습니다. 과거 결론을 억지로 끌어오지 말고 반복적으로 관찰된 팀장 판단 원칙과 현재 사실관계로 판단하세요.`;

  const weight = match.relationship === "SAME" ? "강한 참고" : match.relationship === "SIMILAR" ? "중간 참고" : "보조 참고";
  return `\n\n[과거 사례 매칭: ${match.title} · ${match.relationship} · ${weight}]
- 반복 판단 패턴: ${match.reasoningPattern}
- 과거 실제 결과 요지: ${match.observedOutcome}
${match.doNot?.length ? `- 과거 테스트에서 확인된 오류 금지: ${match.doNot.join(" / ")}\n` : ""}
[적용 원칙]
1) 현재 사실관계가 최우선입니다.
2) 그 다음은 여러 사례에서 반복된 팀장 판단 원칙입니다.
3) 위 과거 사례는 정답지가 아니라 판단을 보정하는 증거입니다.
4) 현재 상황의 핵심 사실이 과거와 다르면 과거 결론을 그대로 복사하지 말고 차이를 반영해 새롭게 판단하세요.
5) 반대로 핵심 사실이 사실상 동일하다면 특별한 차이가 없는 한 과거 판단과 일관성을 유지하세요.`;
}
