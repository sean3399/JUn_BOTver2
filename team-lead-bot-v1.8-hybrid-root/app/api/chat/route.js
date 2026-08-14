import { PERSONA_SYSTEM, MODE_ADDENDUM } from "@/lib/persona";
import { createTextResponse } from "@/lib/openaiClient";
import { guardRequest } from "@/lib/serverGuards";

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

    const instructions = PERSONA_SYSTEM + (MODE_ADDENDUM[mode] || MODE_ADDENDUM.messenger);
    const reply = await createTextResponse({
      instructions,
      input: safeMessages,
      maxOutputTokens: mode === "mail" ? 2200 : 1800,
    });

    return Response.json({ reply });
  } catch (err) {
    return Response.json({ error: err.message || "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
