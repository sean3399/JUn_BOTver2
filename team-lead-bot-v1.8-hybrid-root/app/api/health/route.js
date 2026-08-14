import { getModel } from "@/lib/openaiClient";

export async function GET() {
  return Response.json({
    status: "ok",
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    model: getModel(),
    accessProtected: Boolean(process.env.APP_ACCESS_CODE),
  });
}
