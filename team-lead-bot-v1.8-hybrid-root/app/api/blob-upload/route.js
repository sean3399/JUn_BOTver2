import { handleUpload } from "@vercel/blob/client";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "pptx", "docx", "xlsx", "txt", "md", "csv"]);

export async function POST(request) {
  try {
    const body = await request.json();
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload = {};
        try { payload = JSON.parse(clientPayload || "{}"); } catch (e) {}

        const required = process.env.APP_ACCESS_CODE;
        if (required && payload.accessCode !== required) throw new Error("접근 코드가 올바르지 않습니다.");

        const originalName = String(payload.originalName || pathname || "");
        const ext = originalName.split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error("지원 형식: pdf, pptx, docx, xlsx, txt, md, csv");

        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_FILE_BYTES,
          tokenPayload: JSON.stringify({ originalName }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json({ error: error?.message || "업로드 토큰 생성에 실패했습니다." }, { status: 400 });
  }
}
