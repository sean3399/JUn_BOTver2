import { issueSignedToken, presignUrl } from "@vercel/blob";

const DEFAULT_VALID_MS = 5 * 60 * 1000;

export function assertBlobStoreConfigured() {
  if (!process.env.BLOB_STORE_ID) {
    throw new Error("BLOB_STORE_ID가 없습니다. Vercel 프로젝트의 Private Blob Store 연결을 확인해 주세요.");
  }
}

export async function makeSignedBlobUrls(pathname, operations, options = {}) {
  assertBlobStoreConfigured();
  const ops = [...new Set((Array.isArray(operations) ? operations : [operations]).filter(Boolean))];
  if (!ops.length) throw new Error("Blob 작업 종류가 없습니다.");

  const validUntil = options.validUntil || (Date.now() + DEFAULT_VALID_MS);
  const token = await issueSignedToken({
    pathname,
    operations: ops,
    validUntil,
    storeId: process.env.BLOB_STORE_ID,
  });

  const urls = {};
  for (const operation of ops) {
    const signed = presignUrl(token, {
      pathname,
      operation,
      access: "private",
      validUntil,
      ...(operation === "get" ? { useCache: false } : {}),
      ...(options.presign || {}),
    });
    if (!signed?.presignedUrl) throw new Error(`Blob ${operation} URL을 생성하지 못했습니다.`);
    urls[operation] = signed.presignedUrl;
  }
  return { urls, validUntil };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorDetail(response) {
  try {
    return (await response.text()).slice(0, 700);
  } catch (_) {
    return "";
  }
}

export async function readPrivateBlob(pathname, name, expectedSize = 0) {
  const { urls } = await makeSignedBlobUrls(pathname, ["head", "get"]);
  const delays = [0, 150, 350, 750, 1400];
  let lastStatus = 0;
  let lastDetail = "";

  // 먼저 HEAD로 실제 object가 읽기 가능한 상태인지 확인합니다.
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await wait(delays[attempt]);
    const head = await fetch(urls.head, { method: "HEAD", cache: "no-store" });
    lastStatus = head.status;
    if (head.ok) break;
    lastDetail = await readErrorDetail(head);
    if (head.status !== 404 && head.status < 500) {
      const detail = lastDetail ? ` · ${lastDetail}` : "";
      throw new Error(`${name}: Blob 파일 확인에 실패했습니다 (HTTP ${head.status})${detail}`);
    }
    if (attempt === delays.length - 1) {
      const detail = lastDetail ? ` · ${lastDetail}` : "";
      throw new Error(`${name}: 업로드는 완료됐지만 Blob object가 읽기 가능한 상태가 아닙니다 (HTTP ${lastStatus || "unknown"})${detail}`);
    }
  }

  // HEAD가 성공한 뒤 GET. 일시적 5xx/404만 한 번 더 재시도합니다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(urls.get, { method: "GET", cache: "no-store" });
    lastStatus = response.status;
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      if (expectedSize > 0 && arrayBuffer.byteLength !== expectedSize) {
        throw new Error(`${name}: 업로드 원본(${expectedSize.toLocaleString()} bytes)과 읽은 파일(${arrayBuffer.byteLength.toLocaleString()} bytes)의 크기가 다릅니다.`);
      }
      return {
        arrayBuffer,
        contentType: response.headers.get("content-type") || "application/octet-stream",
      };
    }
    lastDetail = await readErrorDetail(response);
    if (response.status !== 404 && response.status < 500) break;
    await wait(350);
  }

  const detail = lastDetail ? ` · ${lastDetail}` : "";
  throw new Error(`${name}: Blob 파일을 읽지 못했습니다 (HTTP ${lastStatus || "unknown"})${detail}`);
}

export async function deletePrivateBlob(pathname) {
  if (!pathname?.startsWith("review/")) return;
  const { urls } = await makeSignedBlobUrls(pathname, ["delete"]);
  const response = await fetch(urls.delete, { method: "DELETE", cache: "no-store" });
  if (!response.ok && response.status !== 404) {
    const detail = await readErrorDetail(response);
    throw new Error(`Blob 삭제 실패 (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }
}
