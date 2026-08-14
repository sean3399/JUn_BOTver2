import { PERSONA_SYSTEM, MODE_ADDENDUM } from "@/lib/persona";
import { createTextResponse } from "@/lib/openaiClient";
import { guardRequest } from "@/lib/serverGuards";
import { matchPrecedent, buildPrecedentPrompt } from "@/lib/precedents";
import { validateReply, buildCorrectionPrompt } from "@/lib/responseGuard";

export const runtime = "nodejs";

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
    const precedent = matchPrecedent(sourceText);
    const instructions = PERSONA_SYSTEM + (MODE_ADDENDUM[mode] || MODE_ADDENDUM.messenger) + buildPrecedentPrompt(precedent);
    let reply = await createTextResponse({
      instructions,
      input: safeMessages,
      maxOutputTokens: mode === "mail" ? 1900 : 900,
    });

    let validation = validateReply({ reply, sourceText, precedent, mode, review: false });
    if (!validation.ok) {
      reply = await createTextResponse({
        instructions: instructions + buildCorrectionPrompt(validation.problems),
        input: [...safeMessages, { role: "user", content: `[이전 초안]\n${reply}\n위 초안의 근거 없는 숫자/정책과 봇 같은 섹션 구성을 제거하고 실제 Teams 대화처럼 다시 답하세요.` }],
        maxOutputTokens: mode === "mail" ? 1700 : 800,
      });
    }

    return Response.json({
      reply,
      precedent: precedent ? { id: precedent.id, title: precedent.title, relationship: precedent.relationship } : null,
      responseMode: precedent ? "adaptive_precedent" : "adaptive_pattern",
    });
  } catch (err) {
    return Response.json({ error: err.message || "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
