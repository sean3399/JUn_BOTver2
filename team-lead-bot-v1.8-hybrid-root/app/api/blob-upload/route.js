export const runtime = "nodejs";
export async function POST() {
  return Response.json({
    error: "이 엔드포인트는 V2.1.2부터 사용하지 않습니다. /api/blob-sign 직접 Signed URL 방식을 사용합니다."
  }, { status: 410 });
}
