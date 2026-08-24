export const runtime = "nodejs";
export async function POST() {
  return Response.json({
    error: "이 엔드포인트는 V2.1.4에서 사용하지 않습니다. 모든 첨부는 /api/blob-sign OIDC Signed URL 단일 경로를 사용합니다."
  }, { status: 410 });
}
