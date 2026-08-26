function decodeXmlEntities(str = "") {
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function encodeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function compactReplacement(text = "") {
  return String(text || "").replace(/\s*\n+\s*/g, " / ").replace(/\s+/g, " ").trim();
}

function normalizeWithMap(text = "") {
  const source = String(text || "");
  let normalized = "";
  const map = [];
  let pendingSpace = false;
  let pendingIndex = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      if (!pendingSpace && normalized.length) pendingIndex = i;
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && normalized.length) {
      normalized += " ";
      map.push(pendingIndex);
    }
    pendingSpace = false;
    normalized += ch;
    map.push(i);
  }
  return { text: normalized.trim(), map };
}

function plainNormalize(text = "") {
  return String(text || "")
    .replace(/\[[^\]]*(?:페이지|슬라이드|시트|Visual\/OCR)[^\]]*\]/g, " ")
    .replace(/^(?:원문\s*근거|팩트\s*단서|의견\/추정\s*단서)\s*[·:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateAnchors(source = "") {
  const clean = plainNormalize(source);
  const out = new Set();
  if (clean.length >= 4) out.add(clean);
  for (const part of clean.split(/(?:\n|[•●▪]|\s+-\s+|(?<=[.!?。])\s+)/)) {
    const x = plainNormalize(part);
    if (x.length >= 8) out.add(x);
  }
  const words = clean.split(/\s+/).filter(Boolean);
  for (let size = Math.min(18, words.length); size >= 4; size--) {
    for (let i = 0; i + size <= words.length; i += Math.max(1, Math.floor(size / 3))) {
      const x = words.slice(i, i + size).join(" ");
      if (x.length >= 14) out.add(x);
    }
  }
  return [...out].sort((a, b) => b.length - a.length).slice(0, 40);
}

function findAnchor(haystack = "", source = "") {
  const h = plainNormalize(haystack);
  for (const candidate of candidateAnchors(source)) {
    const idx = h.indexOf(candidate);
    if (idx >= 0) return { candidate, index: idx, haystack: h };
  }
  return null;
}

function collectTextNodes(xml, regex) {
  const nodes = [];
  for (const match of xml.matchAll(regex)) {
    const full = match[0];
    const inner = match[2] ?? "";
    const open = match[1] ?? "";
    const start = match.index ?? 0;
    const innerStart = start + full.indexOf(inner);
    nodes.push({ full, open, inner, decoded: decodeXmlEntities(inner), start, innerStart, innerEnd: innerStart + inner.length });
  }
  return nodes;
}

function joinNodeText(nodes) {
  let joined = "";
  const charMap = [];
  nodes.forEach((node, nodeIndex) => {
    const norm = normalizeWithMap(node.decoded);
    if (!norm.text) return;
    if (joined) {
      joined += " ";
      charMap.push(null);
    }
    for (let i = 0; i < norm.text.length; i++) {
      joined += norm.text[i];
      charMap.push({ nodeIndex, originalOffset: norm.map[i] ?? i });
    }
  });
  return { joined, charMap };
}

function replaceAcrossXmlTextNodes(xml, sourceText, revisedText, regex) {
  const nodes = collectTextNodes(xml, regex);
  if (!nodes.length) return { xml, changed: false, reason: "텍스트 노드 없음" };
  const { joined, charMap } = joinNodeText(nodes);
  let matchInfo = null;
  for (const candidate of candidateAnchors(sourceText)) {
    const idx = joined.indexOf(candidate);
    if (idx >= 0) {
      matchInfo = { candidate, index: idx };
      break;
    }
  }
  if (!matchInfo) return { xml, changed: false, reason: "원문 앵커를 찾지 못함" };

  const startPos = charMap.slice(matchInfo.index).find(Boolean);
  const endPos = [...charMap.slice(matchInfo.index, matchInfo.index + matchInfo.candidate.length)].reverse().find(Boolean);
  if (!startPos || !endPos) return { xml, changed: false, reason: "원문 위치 매핑 실패" };

  const first = nodes[startPos.nodeIndex];
  const last = nodes[endPos.nodeIndex];
  const replacement = compactReplacement(revisedText);
  const replacements = new Map();

  if (startPos.nodeIndex === endPos.nodeIndex) {
    const before = first.decoded.slice(0, startPos.originalOffset);
    const after = first.decoded.slice(endPos.originalOffset + 1);
    replacements.set(startPos.nodeIndex, before + replacement + after);
  } else {
    replacements.set(startPos.nodeIndex, first.decoded.slice(0, startPos.originalOffset) + replacement);
    for (let i = startPos.nodeIndex + 1; i < endPos.nodeIndex; i++) replacements.set(i, "");
    replacements.set(endPos.nodeIndex, last.decoded.slice(endPos.originalOffset + 1));
  }

  let out = xml;
  [...replacements.entries()].sort((a, b) => nodes[b[0]].innerStart - nodes[a[0]].innerStart).forEach(([idx, value]) => {
    const node = nodes[idx];
    out = out.slice(0, node.innerStart) + encodeXml(value) + out.slice(node.innerEnd);
  });
  return { xml: out, changed: true, anchor: matchInfo.candidate };
}

function targetNumber(location = "", label) {
  const m = String(location || "").match(new RegExp(`${label}\\s*(\\d+)`, "i"));
  return m ? Number(m[1]) : 0;
}

function editForFile(edit, fileName, totalFiles) {
  const sourceFile = String(edit?.sourceFile || edit?.evidence?.file || "").trim();
  if (!sourceFile) return totalFiles === 1;
  const a = sourceFile.toLowerCase();
  const b = String(fileName || "").toLowerCase();
  return a === b || b.includes(a) || a.includes(b);
}

async function rewritePptx(buffer, edits) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p));
  const log = [];

  for (const edit of edits) {
    const target = targetNumber(edit.evidenceLocation, "슬라이드");
    const ordered = target ? [`ppt/slides/slide${target}.xml`, ...slidePaths.filter((p) => p !== `ppt/slides/slide${target}.xml`)] : slidePaths;
    let done = false;
    for (const slidePath of ordered) {
      const entry = zip.file(slidePath);
      if (!entry) continue;
      const xml = await entry.async("text");
      const result = replaceAcrossXmlTextNodes(xml, edit.originalText, edit.text, /(<a:t\b[^>]*>)([\s\S]*?)(<\/a:t>)/g);
      if (result.changed) {
        zip.file(slidePath, result.xml);
        log.push({ issueId: edit.issueId, status: "applied", location: slidePath.replace("ppt/slides/slide", "슬라이드 ").replace(".xml", "") });
        done = true;
        break;
      }
    }
    if (!done) log.push({ issueId: edit.issueId, status: "not-found", location: edit.evidenceLocation || "" });
  }

  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), log };
}

async function rewriteDocx(buffer, edits) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("DOCX document.xml을 찾을 수 없습니다.");
  let xml = await entry.async("text");
  const log = [];
  for (const edit of edits) {
    const result = replaceAcrossXmlTextNodes(xml, edit.originalText, edit.text, /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g);
    if (result.changed) {
      xml = result.xml;
      log.push({ issueId: edit.issueId, status: "applied", location: edit.evidenceLocation || "본문" });
    } else {
      log.push({ issueId: edit.issueId, status: "not-found", location: edit.evidenceLocation || "본문" });
    }
  }
  zip.file("word/document.xml", xml);
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), log };
}

function parseSharedStrings(xml = "") {
  return [...String(xml).matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((m) => {
    return [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXmlEntities(x[1])).join("");
  });
}

function cellValue(attrs, body, sharedStrings) {
  const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
  if (type === "inlineStr") return [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlEntities(m[1])).join("");
  const raw = (body.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1];
  if (raw == null) return "";
  return type === "s" ? String(sharedStrings[Number(raw)] ?? raw) : decodeXmlEntities(raw);
}

function replaceCellXml(full, attrs, revisedText) {
  const cleanedAttrs = String(attrs || "").replace(/\s+t="[^"]*"/g, "");
  return `<c${cleanedAttrs} t="inlineStr"><is><t xml:space="preserve">${encodeXml(compactReplacement(revisedText))}</t></is></c>`;
}

async function rewriteXlsx(buffer, edits) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  if (!workbookXml) throw new Error("XLSX workbook.xml을 찾을 수 없습니다.");
  const sharedStrings = parseSharedStrings(sharedXml || "");

  const rels = {};
  for (const m of String(relsXml || "").matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attrs = m[1] || "";
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1];
    const target = (attrs.match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && target) rels[id] = target.replace(/^\//, "");
  }
  const sheets = [];
  for (const m of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const attrs = m[1] || "";
    const name = decodeXmlEntities((attrs.match(/\bname="([^"]+)"/) || [])[1] || `Sheet ${sheets.length + 1}`);
    const rid = (attrs.match(/\br:id="([^"]+)"/) || [])[1];
    let target = rels[rid] || `worksheets/sheet${sheets.length + 1}.xml`;
    if (!target.startsWith("xl/")) target = `xl/${target.replace(/^\.\//, "")}`;
    sheets.push({ name, target });
  }

  const sheetXml = new Map();
  for (const sheet of sheets) sheetXml.set(sheet.target, await zip.file(sheet.target)?.async("text") || "");
  const log = [];

  for (const edit of edits) {
    const targetSheet = targetNumber(edit.evidenceLocation, "시트");
    const ordered = targetSheet && sheets[targetSheet - 1] ? [sheets[targetSheet - 1], ...sheets.filter((_, i) => i !== targetSheet - 1)] : sheets;
    let applied = false;
    for (const sheet of ordered) {
      let xml = sheetXml.get(sheet.target) || "";
      const matches = [...xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)];
      for (const m of matches) {
        const value = cellValue(m[1] || "", m[2] || "", sharedStrings);
        if (!value) continue;
        const found = findAnchor(value, edit.originalText);
        if (!found && !findAnchor(edit.originalText, value)) continue;
        const start = m.index ?? 0;
        const replacement = replaceCellXml(m[0], m[1] || "", edit.text);
        xml = xml.slice(0, start) + replacement + xml.slice(start + m[0].length);
        sheetXml.set(sheet.target, xml);
        const cellRef = ((m[1] || "").match(/\br="([A-Z]+\d+)"/) || [])[1] || "cell";
        log.push({ issueId: edit.issueId, status: "applied", location: `${sheet.name}!${cellRef}` });
        applied = true;
        break;
      }
      if (applied) break;
    }
    if (!applied) log.push({ issueId: edit.issueId, status: "not-found", location: edit.evidenceLocation || "" });
  }

  for (const [target, xml] of sheetXml.entries()) zip.file(target, xml);
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), log };
}

function replacePlainText(source, edit) {
  const original = String(source || "");
  for (const candidate of candidateAnchors(edit.originalText)) {
    const idx = plainNormalize(original).indexOf(candidate);
    if (idx < 0) continue;
    // Plain files do not need XML offset preservation; prefer exact literal anchor when available.
    const literalIdx = original.indexOf(candidate);
    if (literalIdx >= 0) return original.slice(0, literalIdx) + edit.text + original.slice(literalIdx + candidate.length);
  }
  return null;
}

async function rewritePdf(buffer, edits) {
  const { PDFDocument, PDFName, PDFArray, PDFHexString } = await import("pdf-lib");
  const pdf = await PDFDocument.load(buffer);
  const pages = pdf.getPages();
  if (!pages.length) throw new Error("PDF 페이지를 찾을 수 없습니다.");
  const log = [];
  const perPageCount = new Map();

  for (const edit of edits) {
    const requested = targetNumber(edit.evidenceLocation, "페이지");
    const hasExactPage = requested > 0 && requested <= pages.length;
    const pageIndex = hasExactPage ? requested - 1 : 0;
    const page = pages[pageIndex];
    const { width, height } = page.getSize();
    const count = perPageCount.get(pageIndex) || 0;
    perPageCount.set(pageIndex, count + 1);

    const x = Math.max(12, width - 34);
    const y = Math.max(12, height - 34 - count * 24);
    const contents = [
      `JUN Rewrite · ${edit.issueTitle || "수정 항목"}`,
      edit.evidenceLocation ? `위치: ${edit.evidenceLocation}` : "",
      edit.originalText ? `원문: ${String(edit.originalText).slice(0, 1200)}` : "",
      `수정안: ${String(edit.text || "").slice(0, 4000)}`,
    ].filter(Boolean).join("\n\n");

    const annotation = pdf.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [x, y, x + 18, y + 18],
      Contents: PDFHexString.fromText(contents),
      T: PDFHexString.fromText("JUN Rewrite"),
      Name: "Comment",
      Open: false,
      C: [0.36, 0.37, 0.78],
    });
    const ref = pdf.context.register(annotation);
    let annots = page.node.lookup(PDFName.of("Annots"), PDFArray);
    if (!annots) {
      annots = pdf.context.obj([]);
      page.node.set(PDFName.of("Annots"), annots);
    }
    annots.push(ref);
    log.push({
      issueId: edit.issueId,
      status: hasExactPage ? "annotated" : "fallback-note",
      location: hasExactPage ? `페이지 ${pageIndex + 1} · JUN Rewrite 주석` : "페이지 1 · 위치 미확인 JUN Rewrite 주석",
    });
  }

  return { buffer: Buffer.from(await pdf.save()), log };
}

export function revisedFileName(name = "document") {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return `${name}_JUN수정본`;
  return `${name.slice(0, idx)}_JUN수정본${name.slice(idx)}`;
}

export function mimeForFileName(name = "") {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ({
    pdf: "application/pdf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    csv: "text/csv; charset=utf-8",
  })[ext] || "application/octet-stream";
}

export async function rewriteFileBuffer({ buffer, name, edits = [], totalFiles = 1 }) {
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  const applicable = edits.filter((edit) => editForFile(edit, name, totalFiles));
  if (!applicable.length) return { buffer, log: [], unchanged: true };

  if (ext === "pptx") return rewritePptx(buffer, applicable);
  if (ext === "docx") return rewriteDocx(buffer, applicable);
  if (ext === "xlsx") return rewriteXlsx(buffer, applicable);
  if (ext === "pdf") return rewritePdf(buffer, applicable);
  if (["txt", "md", "csv"].includes(ext)) {
    let text = Buffer.from(buffer).toString("utf8");
    const log = [];
    for (const edit of applicable) {
      const replaced = replacePlainText(text, edit);
      if (replaced == null) log.push({ issueId: edit.issueId, status: "not-found", location: edit.evidenceLocation || "" });
      else { text = replaced; log.push({ issueId: edit.issueId, status: "applied", location: edit.evidenceLocation || "본문" }); }
    }
    return { buffer: Buffer.from(text, "utf8"), log };
  }
  throw new Error(`${name}: 수정본 생성이 지원되지 않는 파일 형식입니다.`);
}
