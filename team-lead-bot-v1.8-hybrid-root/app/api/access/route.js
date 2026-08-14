import { verifyAccess } from "@/lib/serverGuards";

export async function POST(req) {
  const access = verifyAccess(req);
  if (!access.ok) return Response.json({ ok: false, error: "접근 코드가 올바르지 않습니다." }, { status: 401 });
  return Response.json({ ok: true });
}
