import { getModel } from "@/lib/openaiClient";

export async function GET() {
  return Response.json({
    status: "ok",
    version: "1.8.3",
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    model: getModel(),
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "low",
    accessProtected: Boolean(process.env.APP_ACCESS_CODE),
    adaptivePrecedent: true,
    analysisDrawer: true,
    responseGuard: true,
  });
}
