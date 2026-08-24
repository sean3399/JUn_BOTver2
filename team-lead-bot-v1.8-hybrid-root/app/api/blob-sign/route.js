import { issueSignedToken, presignUrl } from "@vercel/blob";
import { guardRequest } from "@/lib/serverGuards";
import { buildReviewBlobPath } from "@/lib/blobPath";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "pptx", "docx", "xlsx", "txt", "md", "csv"]);

function assertBlobStoreConfigured() {
  if (!process.env.BLOB_STORE_ID) {
    throw new Error("BLOB_STORE_ID가 없습니다. Vercel 프로젝트의 Private Blob Store 연결을 확인해 주세요.");
  }
}

export async function POST(request) {
  try {
    const guard = guardRequest(request, "review");
    if (guard) return guard;
    assertBlobStoreConfigured();

    const body = await request.json();
    const originalName = String(body?.originalName || "");
    const size = Number(body?.size || 0);

    const ext = originalName.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return Response.json({ error: "지원 형식: pdf, pptx, docx, xlsx, txt, md, csv" }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
      return Response.json({ error: "파일당 최대 200MB까지 업로드할 수 있습니다." }, { status: 400 });
    }

    // Never use the display filename in the signed Blob key. Unicode filenames
    // can be normalized/decoded differently between signing and the actual PUT.
    const pathname = buildReviewBlobPath(originalName);
    const validUntil = Date.now() + 15 * 60 * 1000;
    const token = await issueSignedToken({
      pathname,
      operations: ["put"],
      validUntil,
      maximumSizeInBytes: MAX_FILE_BYTES,
      storeId: process.env.BLOB_STORE_ID,
    });

    const { presignedUrl } = await presignUrl(token, {
      pathname,
      operation: "put",
      access: "private",
      validUntil,
      maximumSizeInBytes: MAX_FILE_BYTES,
      allowOverwrite: false,
    });

    return Response.json({
      ok: true,
      presignedUrl,
      pathname,
      expiresAt: validUntil,
      authMode: "oidc-direct-signed-url",
    });
  } catch (error) {
    console.error("[blob-sign]", error);
    const message = error?.message || "Private Blob 업로드 URL 생성에 실패했습니다.";
    let hint = "";
    if (/OIDC.*environment|environment.*OIDC/i.test(message)) {
      hint = "Blob Store의 Projects/Environments에서 현재 배포 환경(Production 또는 Preview)이 허용되어 있는지 확인해 주세요.";
    } else if (/No blob credentials|OIDC token|credentials/i.test(message)) {
      hint = "Blob Store가 이 Vercel 프로젝트에 연결되어 있는지 확인해 주세요. BLOB_STORE_ID만 수동 복사한 상태로는 부족할 수 있습니다.";
    } else if (/Access denied|forbidden/i.test(message)) {
      hint = "현재 배포 프로젝트의 OIDC 권한이 이 Blob Store에 연결되어 있지 않습니다.";
    } else if (/store does not exist|store_not_found/i.test(message)) {
      hint = "BLOB_STORE_ID가 현재 연결된 Blob Store와 일치하지 않습니다.";
    }
    return Response.json({ error: message, hint, stage: "issue-signed-url" }, { status: 400 });
  }
}
