import { getModel } from "@/lib/openaiClient";

export async function GET() {
  return Response.json({
    status: "ok",
    version: "2.0-beta",
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    model: getModel(),
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "low",
    accessProtected: Boolean(process.env.APP_ACCESS_CODE),
    adaptivePrecedent: true,
    analysisDrawer: true,
    chatAnalysisDrawer: true,
    assumptionTrace: true,
    judgmentOS: true,
    factOpinionSeparation: true,
    decisionOwnership: true,
    defensibilityTrace: true,
    responseGuard: true,
    reviewCycle: true,
    issueFixSuggestions: true,
    versionComparison: true,
    evidenceLocator: true,
    feedbackAccuracy: true,
    submissionPackage: true,
  });
}
