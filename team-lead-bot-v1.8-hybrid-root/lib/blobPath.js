import { randomUUID } from "node:crypto";

/**
 * Blob object keys must not depend on a user's display filename.
 * Keeping the storage pathname ASCII-only avoids scope mismatches caused by
 * Unicode normalization/encoding differences between token signing and PUT.
 */
export function buildReviewBlobPath(originalName, options = {}) {
  const name = String(originalName || "");
  const rawExt = name.includes(".") ? name.split(".").pop() : "";
  const ext = String(rawExt || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ext) throw new Error("파일 확장자를 확인할 수 없습니다.");

  const now = Number.isFinite(options.now) ? Math.trunc(options.now) : Date.now();
  const rawId = String(options.id || randomUUID());
  const id = rawId.replace(/[^a-zA-Z0-9-]/g, "") || randomUUID();
  return `review/${now}-${id}.${ext}`;
}
