import { issueSignedToken, presignUrl } from "@vercel/blob";

const DEFAULT_VALID_MS = 5 * 60 * 1000;

export function assertBlobStoreConfigured() {
  if (!process.env.BLOB_STORE_ID) {
    throw new Error("BLOB_STORE_ID가 없습니다. Vercel 프로젝트의 Private Blob Store 연결을 확인해 주세요.");
  }
}

function normalizePresignedUrl(result) {
  if (typeof result === "string" && result) return result;
  if (result && typeof result.presignedUrl === "string" && result.presignedUrl) return result.presignedUrl;
  if (result && typeof result.url === "string" && result.url) return result.url;
  return "";
}

export async function makeSignedBlobUrl(pathname, operation, options = {}) {
  assertBlobStoreConfigured();
  if (!pathname || !operation) throw new Error("Blob 경로 또는 작업 종류가 없습니다.");

  const validUntil = options.validUntil || (Date.now() + DEFAULT_VALID_MS);
  const token = await issueSignedToken({
    pathname,
    operations: [operation],
    validUntil,
    storeId: process.env.BLOB_STORE_ID,
  });

  const signedResult = await Promise.resolve(presignUrl(token, {
    pathname,
    operation,
    access: "private",
    validUntil,
    ...(operation === "get" ? { useCache: false } : {}),
    ...(options.presign || {}),
  }));

  const url = normalizePresignedUrl(signedResult);
  if (!url) {
    const shape = signedResult == null
      ? "null"
      : Array.isArray(signedResult)
        ? "array"
        : typeof signedResult;
    throw new Error(`Blob ${operation} URL을 생성하지 못했습니다 (SDK 응답 형태: ${shape}).`);
  }
  return { url, validUntil };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorDetail(response) {
  try {
    return (await response.text()).slice(0, 900);
  } catch (_) {
    return "";
  }
}

export async function readPrivateBlob(pathname, name, expectedSize = 0) {
  // HEAD는 사용하지 않습니다. 일부 Blob SDK/Private Store 조합에서 HEAD presign이
  // 실패할 수 있고, 실제 검토에 필요한 것은 GET 성공과 원본 바이트 검증입니다.
  const { url } = await makeSignedBlobUrl(pathname, "get");
  const delays = [0, 180, 450, 900, 1600];
  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await wait(delays[attempt]);

    let response;
    try {
      response = await fetch(url, { method: "GET", cache: "no-store" });
    } catch (error) {
      lastDetail = error?.message || String(error);
      if (attempt === delays.length - 1) {
        throw new Error(`${name}: Blob 파일 GET 요청에 실패했습니다${lastDetail ? ` · ${lastDetail}` : ""}`);
      }
      continue;
    }

    lastStatus = response.status;
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      if (expectedSize > 0 && arrayBuffer.byteLength !== expectedSize) {
        // 업로드 직후 아주 드물게 완성 전 object가 노출되는 경우를 대비해 마지막 시도가
        // 아니라면 다시 읽습니다. 최종 시도에서도 다르면 손상 가능성으로 중단합니다.
        if (attempt < delays.length - 1) continue;
        throw new Error(`${name}: 업로드 원본(${expectedSize.toLocaleString()} bytes)과 Blob에서 읽은 파일(${arrayBuffer.byteLength.toLocaleString()} bytes)의 크기가 다릅니다.`);
      }
      return {
        arrayBuffer,
        contentType: response.headers.get("content-type") || "application/octet-stream",
      };
    }

    lastDetail = await readErrorDetail(response);

    // 업로드 직후 일시적인 404/409/429/5xx만 재시도합니다.
    const retryable = response.status === 404
      || response.status === 409
      || response.status === 429
      || response.status >= 500;

    if (!retryable || attempt === delays.length - 1) break;
  }

  const detail = lastDetail ? ` · ${lastDetail}` : "";
  throw new Error(`${name}: Blob 파일을 읽지 못했습니다 (GET HTTP ${lastStatus || "unknown"})${detail}`);
}

export async function deletePrivateBlob(pathname) {
  if (!pathname?.startsWith("review/")) return;
  const { url } = await makeSignedBlobUrl(pathname, "delete");
  const response = await fetch(url, { method: "DELETE", cache: "no-store" });
  if (!response.ok && response.status !== 404) {
    const detail = await readErrorDetail(response);
    throw new Error(`Blob 삭제 실패 (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
}
