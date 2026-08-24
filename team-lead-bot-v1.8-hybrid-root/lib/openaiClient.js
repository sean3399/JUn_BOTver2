export function getModel() {
  return process.env.OPENAI_MODEL || "gpt-5";
}

export function getVisualModel() {
  return process.env.OPENAI_VISUAL_MODEL || getModel();
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

async function callResponses({ instructions, input, maxOutputTokens, reasoningEffort, model = getModel() }) {
  const payload = {
    model,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    store: false,
  };
  if (reasoningEffort) payload.reasoning = { effort: reasoningEffort };

  const apiRes = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
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

  const firstBudget = Math.max(1800, maxOutputTokens);
  let data = await callResponses({
    instructions,
    input,
    maxOutputTokens: firstBudget,
    reasoningEffort: getReasoningEffort(),
  });

  let text = extractOutputText(data);
  if (text) return text;

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

export async function createVisualResponse({ instructions, content, maxOutputTokens = 4200 }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const firstBudget = Math.max(2400, maxOutputTokens);
  let data = await callResponses({
    instructions,
    input: [{ role: "user", content }],
    maxOutputTokens: firstBudget,
    reasoningEffort: null,
    model: getVisualModel(),
  });
  let text = extractOutputText(data);
  if (text) return text;

  const incompleteReason = data?.incomplete_details?.reason || "";
  if (data?.status === "incomplete" && /max_(output_)?tokens|max_tokens/i.test(incompleteReason)) {
    data = await callResponses({
      instructions,
      input: [{ role: "user", content }],
      maxOutputTokens: Math.min(9000, Math.max(5000, firstBudget * 2)),
      reasoningEffort: null,
      model: getVisualModel(),
    });
    text = extractOutputText(data);
    if (text) return text;
  }
  const status = data?.status || "unknown";
  const reason = data?.incomplete_details?.reason || data?.error?.message || "output_text 없음";
  throw new Error(`Visual Review 응답을 받지 못했습니다. 상태: ${status}, 사유: ${reason}`);
}

export async function uploadOpenAIUserFile({ name, buffer, type = "application/pdf" }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", new Blob([buffer], { type }), name);

  const res = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || !data?.id) throw new Error(data?.error?.message || `${name}: OpenAI 임시 파일 업로드에 실패했습니다.`);
  return data;
}

export async function deleteOpenAIFile(fileId) {
  if (!fileId || !process.env.OPENAI_API_KEY) return;
  await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  }).catch(() => {});
}
