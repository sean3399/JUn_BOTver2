import { del } from "@vercel/blob";
import { guardRequest } from "@/lib/serverGuards";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const guard = guardRequest(req, "review");
    if (guard) return guard;
    const body = await req.json();
    const pathnames = Array.isArray(body.pathnames) ? body.pathnames.filter((x) => typeof x === "string" && x.startsWith("review/")).slice(0, 5) : [];
    if (pathnames.length) {
      await del(pathnames, {
        storeId: process.env.BLOB_STORE_ID,
        ...(process.env.VERCEL_OIDC_TOKEN ? { oidcToken: process.env.VERCEL_OIDC_TOKEN } : {}),
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "정리 실패" }, { status: 500 });
  }
}
