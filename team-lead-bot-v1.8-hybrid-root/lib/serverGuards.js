const RATE_WINDOW_MS = 10 * 60 * 1000;

function getBucket() {
  if (!globalThis.__TEAMLEAD_RATE_BUCKET__) globalThis.__TEAMLEAD_RATE_BUCKET__ = new Map();
  return globalThis.__TEAMLEAD_RATE_BUCKET__;
}

export function verifyAccess(req) {
  const required = process.env.APP_ACCESS_CODE;
  if (!required) return { ok: true, protected: false };
  const supplied = req.headers.get("x-app-access-code") || "";
  return { ok: supplied === required, protected: true };
}

export function rateLimit(req, kind = "chat") {
  const limit = kind === "review" ? 10 : 24;
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown")
    .split(",")[0]
    .trim();
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const bucket = getBucket();
  const current = bucket.get(key);
  if (!current || now - current.startedAt > RATE_WINDOW_MS) {
    bucket.set(key, { startedAt: now, count: 1 });
    return { ok: true, remaining: limit - 1 };
  }
  if (current.count >= limit) return { ok: false, retryAfterSec: Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000) };
  current.count += 1;
  bucket.set(key, current);
  return { ok: true, remaining: Math.max(0, limit - current.count) };
}

export function guardRequest(req, kind = "chat") {
  const access = verifyAccess(req);
  if (!access.ok) {
    return Response.json({ error: "접근 코드가 올바르지 않습니다.", code: "ACCESS_DENIED" }, { status: 401 });
  }
  const rl = rateLimit(req, kind);
  if (!rl.ok) {
    return Response.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", code: "RATE_LIMIT" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } }
    );
  }
  return null;
}
