export function getModel() {
  return process.env.OPENAI_MODEL || "gpt-5";
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

export async function createTextResponse({ instructions, input, maxOutputTokens = 1200 }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

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
  return extractOutputText(data);
}
