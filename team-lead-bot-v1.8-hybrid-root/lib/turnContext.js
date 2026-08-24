function cleanText(value, max = 6000) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, max);
}

export function buildTurnAnalysisSource(messages = []) {
  const safe = Array.isArray(messages) ? messages : [];
  let latestUserIndex = -1;
  for (let i = safe.length - 1; i >= 0; i -= 1) {
    if (safe[i]?.role !== "assistant") {
      latestUserIndex = i;
      break;
    }
  }

  if (latestUserIndex < 0) {
    return {
      source: "",
      scope: "empty",
      scopeLabel: "분석 대상 없음",
      previousAssistant: "",
      currentUser: "",
    };
  }

  const currentUser = cleanText(safe[latestUserIndex]?.content, 12000);
  let previousAssistant = "";
  for (let i = latestUserIndex - 1; i >= 0; i -= 1) {
    if (safe[i]?.role === "assistant") {
      previousAssistant = cleanText(safe[i]?.content, 5000);
      break;
    }
  }

  if (!previousAssistant) {
    return {
      source: currentUser,
      scope: "current_request",
      scopeLabel: "이번 요청 기준",
      previousAssistant: "",
      currentUser,
    };
  }

  return {
    source: `[직전 팀장님 반응]\n${previousAssistant}\n\n[이번 사용자 답변]\n${currentUser}`,
    scope: "follow_up_turn",
    scopeLabel: "직전 질문 + 이번 답변 기준",
    previousAssistant,
    currentUser,
  };
}
