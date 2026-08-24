import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned } from "@vercel/blob/client";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "pptx", "docx", "xlsx", "txt", "md", "csv"]);

function assertBlobStoreConfigured() {
  if (!process.env.BLOB_STORE_ID) {
    throw new Error("BLOB_STORE_ID가 없습니다. Vercel 프로젝트에 Private Blob Store를 연결한 뒤 재배포해 주세요.");
  }
  if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
    throw new Error("BLOB_WEBHOOK_PUBLIC_KEY가 없습니다. Blob Store 연결 상태를 확인한 뒤 재배포해 주세요.");
  }
}

export async function POST(request) {
  try {
    assertBlobStoreConfigured();
    const body = await request.json();

    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname, clientPayload) => {
        let payload = {};
        try { payload = JSON.parse(clientPayload || "{}"); } catch (e) {}

        const required = process.env.APP_ACCESS_CODE;
        if (required && payload.accessCode !== required) {
          throw new Error("접근 코드가 올바르지 않습니다.");
        }

        const originalName = String(payload.originalName || pathname || "");
        const ext = originalName.split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          throw new Error("지원 형식: pdf, pptx, docx, xlsx, txt, md, csv");
        }
        if (!String(pathname || "").startsWith("review/")) {
          throw new Error("유효하지 않은 업로드 경로입니다.");
        }

        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          maximumSizeInBytes: MAX_FILE_BYTES,
          storeId: process.env.BLOB_STORE_ID,
          ...(process.env.VERCEL_OIDC_TOKEN ? { oidcToken: process.env.VERCEL_OIDC_TOKEN } : {}),
        });

        return {
          token,
          urlOptions: {
            addRandomSuffix: true,
            allowOverwrite: false,
          },
        };
      },
      onUploadCompleted: async () => {},
    });

    return Response.json(jsonResponse);
  } catch (error) {
    console.error("[blob-upload]", error);
    return Response.json(
      { error: error?.message || "Private Blob 업로드 권한 생성에 실패했습니다." },
      { status: 400 },
    );
  }
}
