import { deletePrivateBlob } from "@/lib/blobServer";
import { guardRequest } from "@/lib/serverGuards";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const guard = guardRequest(req, "review");
    if (guard) return guard;
    if (!process.env.BLOB_STORE_ID) {
      return Response.json({ ok: false, error: "BLOB_STORE_ID가 없습니다." }, { status: 400 });
    }
    const body = await req.json();
    const pathnames = Array.isArray(body.pathnames)
      ? body.pathnames.filter((x) => typeof x === "string" && x.startsWith("review/")).slice(0, 5)
      : [];
    const results = await Promise.allSettled(pathnames.map(deletePrivateBlob));
    const failed = results.filter((r) => r.status === "rejected");
    return Response.json({ ok: failed.length === 0, deleted: pathnames.length - failed.length, failed: failed.length });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "정리 실패" }, { status: 500 });
  }
}
