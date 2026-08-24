import { del, get } from "@vercel/blob";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertBlobStoreConfigured() {
  if (!process.env.BLOB_STORE_ID) {
    throw new Error("BLOB_STORE_ID가 없습니다. Vercel 프로젝트의 Private Blob Store 연결을 확인해 주세요.");
  }
}

function validateBlobIdentity(blobUrl, pathname) {
  if (!pathname?.startsWith("review/")) throw new Error("유효하지 않은 Blob pathname입니다.");
  if (!blobUrl) return; // cleanup fallback may only have pathname

  let url;
  try {
    url = new URL(blobUrl);
  } catch {
    throw new Error("유효하지 않은 Blob URL입니다.");
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".private.blob.vercel-storage.com")) {
    throw new Error("Private Vercel Blob URL만 사용할 수 있습니다.");
  }
  const urlPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (urlPath !== pathname) {
    throw new Error(`Blob URL/pathname 불일치: URL=${urlPath}, pathname=${pathname}`);
  }
}

export async function readPrivateBlob(blobUrl, pathname, name, expectedSize = 0) {
  assertBlobStoreConfigured();
  validateBlobIdentity(blobUrl, pathname);

  // Server-side private reads should use the exact URL returned by the successful PUT.
  // Do not reconstruct an object URL from pathname: that is what caused the repeated 404s.
  const delays = [0, 200, 500, 1000, 1800];
  let lastDetail = "";

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]) await wait(delays[attempt]);
    try {
      const result = await get(blobUrl, {
        access: "private",
        storeId: process.env.BLOB_STORE_ID,
        useCache: false,
      });

      if (!result) {
        lastDetail = "Blob not found";
        continue;
      }
      if (result.statusCode !== 200) {
        lastDetail = `Blob GET status ${result.statusCode}`;
        continue;
      }

      const arrayBuffer = await new Response(result.stream).arrayBuffer();
      if (expectedSize > 0 && arrayBuffer.byteLength !== expectedSize) {
        lastDetail = `size mismatch: expected ${expectedSize}, got ${arrayBuffer.byteLength}`;
        if (attempt < delays.length - 1) continue;
        throw new Error(`${name}: 업로드 원본(${expectedSize.toLocaleString()} bytes)과 Blob에서 읽은 파일(${arrayBuffer.byteLength.toLocaleString()} bytes)의 크기가 다릅니다.`);
      }

      return {
        arrayBuffer,
        contentType: result.blob?.contentType || "application/octet-stream",
        actualUrl: result.blob?.url || blobUrl,
        actualPathname: result.blob?.pathname || pathname,
      };
    } catch (error) {
      lastDetail = error?.message || String(error);
      if (/Access denied|forbidden|OIDC|credentials|store/i.test(lastDetail)) {
        throw new Error(`${name}: Private Blob 읽기 인증 실패 · ${lastDetail}`);
      }
      if (attempt === delays.length - 1) break;
    }
  }

  throw new Error(`${name}: PUT 성공 응답의 실제 Blob URL로도 파일을 읽지 못했습니다 · ${lastDetail || "Blob not found"}`);
}

export async function deletePrivateBlob(blobUrl, pathname) {
  assertBlobStoreConfigured();
  if (!pathname?.startsWith("review/")) return;
  if (blobUrl) validateBlobIdentity(blobUrl, pathname);
  try {
    await del(blobUrl || pathname, {
      storeId: process.env.BLOB_STORE_ID,
    });
  } catch (error) {
    // Cleanup must never mask the review result.
    throw new Error(`Blob 삭제 실패: ${error?.message || String(error)}`);
  }
}
