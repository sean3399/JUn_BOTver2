import JSZip from "jszip";
import { guardRequest } from "@/lib/serverGuards";
import { readPrivateBlob, deletePrivateBlob } from "@/lib/blobServer";
import { rewriteFileBuffer, revisedFileName, mimeForFileName } from "@/lib/fileRewrite";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILES = 5;
const MAX_EDITS = 20;

function safeEdit(edit = {}) {
  return {
    issueId: String(edit.issueId || ""),
    issueTitle: String(edit.issueTitle || "").slice(0, 300),
    source: String(edit.source || ""),
    intensity: String(edit.intensity || ""),
    text: String(edit.text || "").slice(0, 12000),
    originalText: String(edit.originalText || "").slice(0, 12000),
    sourceFile: String(edit.sourceFile || "").slice(0, 500),
    evidenceLocation: String(edit.evidenceLocation || "").slice(0, 500),
  };
}

function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function POST(req) {
  let blobFiles = [];
  try {
    const guard = guardRequest(req, "workflow");
    if (guard) return guard;
    const body = await req.json();
    blobFiles = Array.isArray(body.blobFiles) ? body.blobFiles.slice(0, MAX_FILES) : [];
    const edits = (Array.isArray(body.edits) ? body.edits : []).slice(0, MAX_EDITS).map(safeEdit)
      .filter((x) => x.source === "jun-rewrite" && x.text && x.originalText);

    if (!blobFiles.length) return Response.json({ error: "수정할 원본 파일이 없습니다." }, { status: 400 });
    if (!edits.length) return Response.json({ error: "채택된 JUN Rewrite 수정안이 없습니다." }, { status: 400 });

    const outputs = [];
    const allLog = [];
    for (const descriptor of blobFiles) {
      const pathname = String(descriptor?.pathname || "");
      const blobUrl = String(descriptor?.blobUrl || "");
      const name = String(descriptor?.name || pathname.split("/").pop() || "attachment");
      const size = Number(descriptor?.size || 0);
      if (!pathname.startsWith("review/") || !blobUrl || !size) throw new Error(`${name}: 원본 Blob 정보가 올바르지 않습니다.`);
      const result = await readPrivateBlob(blobUrl, pathname, name, size);
      const rewritten = await rewriteFileBuffer({
        buffer: Buffer.from(result.arrayBuffer),
        name,
        edits,
        totalFiles: blobFiles.length,
      });
      const outputName = revisedFileName(name);
      outputs.push({ name: outputName, buffer: rewritten.buffer, mime: mimeForFileName(outputName) });
      allLog.push(...(rewritten.log || []).map((x) => ({ ...x, file: name })));
    }

    const directlyApplied = allLog.filter((x) => x.status === "applied" || x.status === "annotated").length;
    const fallbackNotes = allLog.filter((x) => x.status === "fallback-note").length;
    const missed = allLog.filter((x) => x.status === "not-found" || x.status === "fallback-note").length;
    const applied = directlyApplied + fallbackNotes;
    if (!applied && allLog.length) {
      return Response.json({ error: "채택한 수정안의 원문 위치를 원본 파일에서 찾지 못했습니다. 원문 근거 범위를 다시 선택해 주세요.", rewriteLog: allLog }, { status: 422 });
    }

    if (outputs.length === 1) {
      return new Response(outputs[0].buffer, {
        status: 200,
        headers: {
          "content-type": outputs[0].mime,
          "content-disposition": contentDisposition(outputs[0].name),
          "x-jun-applied-edits": String(applied),
          "x-jun-unmatched-edits": String(missed),
          "cache-control": "no-store",
        },
      });
    }

    const zip = new JSZip();
    outputs.forEach((output) => zip.file(output.name, output.buffer));
    zip.file("JUN_REWRITE_LOG.json", JSON.stringify({ applied, unmatched: missed, items: allLog }, null, 2));
    const zipped = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new Response(zipped, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition("JUN_수정본_파일.zip"),
        "x-jun-applied-edits": String(applied),
        "x-jun-unmatched-edits": String(missed),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: err.message || "수정본 파일 생성 중 오류가 발생했습니다." }, { status: 500 });
  } finally {
    await Promise.allSettled(blobFiles.map((f) => deletePrivateBlob(String(f?.blobUrl || ""), String(f?.pathname || ""))));
  }
}
