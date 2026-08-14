export function getModel() {
  return process.env.OPENAI_MODEL || "gpt-5";
}

function getReasoningEffort() {
  return process.env.OPENAI_REASONING_EFFORT || "low";
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function callResponses({ instructions, input, maxOutputTokens, reasoningEffort }) {
  const apiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: getModel(),
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: reasoningEffort },
      store: false,
    }),
  });

  let data;
  try {
    data = await apiRes.json();
  } catch (e) {
    throw new Error(`OpenAI API가 예상치 못한 응답을 반환했습니다 (status ${apiRes.status}).`);
  }

  if (!apiRes.ok) throw new Error(data?.error?.message || "OpenAI API 호출에 실패했습니다.");
  return data;
}

export async function createTextResponse({ instructions, input, maxOutputTokens = 1800 }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  // GPT-5 계열은 max_output_tokens 안에 보이는 답변뿐 아니라 reasoning 토큰도 포함됩니다.
  // 기본 medium reasoning 상태에서 짧은 토큰 한도를 쓰면 HTTP 200인데도 output_text 없이
  // incomplete로 끝날 수 있어, 평상시는 low로 낮추고 여유 있는 출력 예산을 둡니다.
  const firstBudget = Math.max(1800, maxOutputTokens);
  let data = await callResponses({
    instructions,
    input,
    maxOutputTokens: firstBudget,
    reasoningEffort: getReasoningEffort(),
  });

  let text = extractOutputText(data);
  if (text) return text;

  // 토큰 한도로 reasoning만 쓰고 끝난 경우 한 번만 자동 재시도합니다.
  const incompleteReason = data?.incomplete_details?.reason || "";
  if (data?.status === "incomplete" && /max_(output_)?tokens|max_tokens/i.test(incompleteReason)) {
    data = await callResponses({
      instructions,
      input,
      maxOutputTokens: Math.min(5000, Math.max(3000, firstBudget * 2)),
      reasoningEffort: "minimal",
    });
    text = extractOutputText(data);
    if (text) return text;
  }

  const status = data?.status || "unknown";
  const reason = data?.incomplete_details?.reason || data?.error?.message || "output_text 없음";
  throw new Error(`모델 응답 본문을 받지 못했습니다. 상태: ${status}, 사유: ${reason}`);
}
