import { PERSONA_SYSTEM, MODE_ADDENDUM } from "@/lib/persona";
import { analyzeDocument, buildAnalysisPrompt } from "@/lib/managerLogic";
import { createTextResponse } from "@/lib/openaiClient";
import { guardRequest } from "@/lib/serverGuards";
import { matchPrecedent, buildPrecedentPrompt } from "@/lib/precedents";
import { validateReply, buildCorrectionPrompt } from "@/lib/responseGuard";
import { buildTurnAnalysisSource } from "@/lib/turnContext";

export const runtime = "nodejs";

function publicPrecedent(match) {
  if (!match) return null;
  return {
    id: match.id,
    title: match.title,
    relationship: match.relationship,
    strength: match.strength,
    score: match.score,
    reasoningPattern: match.reasoningPattern,
    observedOutcome: match.observedOutcome,
  };
}

export async function POST(req) {
  try {
    const guard = guardRequest(req, "chat");
    if (guard) return guard;

    const { messages = [], mode = "messenger" } = await req.json();
    const safeMessages = Array.isArray(messages)
      ? messages.slice(-14).map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || "").slice(0, 12000),
        }))
      : [];

    if (!safeMessages.length) return Response.json({ error: "메시지가 없습니다." }, { status: 400 });

    const sourceText = safeMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
    // V1.9.1: 6축 대시보드는 대화 전체 누적이 아니라 "이번 턴"을 분석한다.
    // 직전 팀장 반응 + 이번 사용자 답변만 사용해 후속 답변마다 점수/근거가 새로 계산되도록 한다.
    const turnContext = buildTurnAnalysisSource(safeMessages);
    const analysisSource = turnContext.source;

    const workLike = analysisSource.length >= 40 || /(예산|검토|보고|규정|지급|업무|개선|비용|인원|채용|승인|결재|기한|시스템|운영|방향|근거|전결|추정|산정|왜|이유|원인|단가|횟수|버퍼|전년도|최근|실적)/i.test(analysisSource);
    const analysis = workLike ? analyzeDocument(analysisSource || sourceText) : null;
    if (analysis) {
      analysis.analysisScope = {
        key: turnContext.scope,
        label: turnContext.scopeLabel,
        previousAssistant: turnContext.previousAssistant,
        currentUser: turnContext.currentUser,
      };
      analysis.roleSeparation = {
        jun: "실제 팀장 반응 예측",
        advisor: "별도 문서 품질/전문 분석",
      };
    }
    const precedent = matchPrecedent(sourceText, analysis);
    if (analysis) {
      analysis.precedent = publicPrecedent(precedent);
      analysis.judgmentBasis = [
        { label: "현재 팩트", weight: "최우선", detail: "최근 대화에서 사용자가 제공한 사실관계·수치·조건" },
        { label: "JUN 반복 패턴", weight: "핵심", detail: "실제 팀장 반응에서 반복된 팩트·근거·판단주체·비례성 패턴" },
        { label: "반복 행동패턴", weight: "핵심", detail: "여러 실제 반응에서 반복된 팀장 판단 습관" },
        ...(precedent ? [{ label: "유사 사례", weight: precedent.relationship === "SAME" ? "강한 참고" : "참고", detail: precedent.title }] : []),
      ];
    }

    const instructions = PERSONA_SYSTEM
      + (MODE_ADDENDUM[mode] || MODE_ADDENDUM.messenger)
      + (analysis ? buildAnalysisPrompt(analysis) : "")
      + buildPrecedentPrompt(precedent);

    let reply = await createTextResponse({
      instructions,
      input: safeMessages,
      maxOutputTokens: mode === "mail" ? 1900 : 900,
    });

    let validation = validateReply({ reply, sourceText, precedent, mode, review: false, documentStage: analysis?.documentStage || null });
    if (!validation.ok) {
      reply = await createTextResponse({
        instructions: instructions + buildCorrectionPrompt(validation.problems),
        input: [...safeMessages, { role: "user", content: `[이전 초안]\n${reply}\n위 초안의 근거 없는 숫자/정책과 봇 같은 섹션 구성을 제거하고 실제 Teams 대화처럼 다시 답하세요.` }],
        maxOutputTokens: mode === "mail" ? 1700 : 800,
      });
      validation = validateReply({ reply, sourceText, precedent, mode, review: false, documentStage: analysis?.documentStage || null });
    }

    if (!validation.ok && mode === "messenger") {
      reply = analysis?.firstTurnQuestions?.[0]?.q || "네, 이 부분은 조금 더 확인해보면 좋을 것 같습니다.";
    }

    return Response.json({
      reply,
      analysis,
      precedent: precedent ? { id: precedent.id, title: precedent.title, relationship: precedent.relationship } : null,
      responseMode: precedent ? "v22_jun_stagegate_precedent" : "v22_jun_stagegate_pattern",
    });
  } catch (err) {
    return Response.json({ error: err.message || "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
