const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_VISUAL_ASSET_BYTES = 15 * 1024 * 1024;
const MAX_VISUAL_ASSETS_PER_FILE = 100;
const MAX_VISUAL_BYTES_PER_FILE = 80 * 1024 * 1024;

function decodeXmlEntities(str = "") {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

function stripXml(str = "") {
  return decodeXmlEntities(str.replace(/<[^>]+>/g, ""));
}

function naturalSort(a, b) {
  const an = Number((a.match(/(\d+)(?=\.[^.]+$)/) || [])[1] || 0);
  const bn = Number((b.match(/(\d+)(?=\.[^.]+$)/) || [])[1] || 0);
  return an - bn;
}

function normalizeZipTarget(basePath, target) {
  const parts = basePath.split("/").slice(0, -1);
  for (const segment of String(target || "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function mimeForPath(path = "") {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return ({
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  })[ext] || "";
}

function parseRelationships(xml = "") {
  const out = [];
  for (const m of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attrs = m[1] || "";
    const id = (attrs.match(/\bId="([^"]+)"/) || [])[1] || "";
    const target = decodeXmlEntities((attrs.match(/\bTarget="([^"]+)"/) || [])[1] || "");
    const type = (attrs.match(/\bType="([^"]+)"/) || [])[1] || "";
    if (id && target) out.push({ id, target, type });
  }
  return out;
}

function extractChartSummary(xml = "") {
  const values = [...xml.matchAll(/<(?:c:)?v[^>]*>([\s\S]*?)<\/(?:c:)?v>/g)]
    .map((m) => decodeXmlEntities(m[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const unique = [...new Set(values)].slice(0, 120);
  if (!unique.length) return "";
  return unique.join(" | ");
}

async function extractPptxDetailed(buffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort(naturalSort);

  const parts = [];
  const visualByPath = new Map();
  let visualBytes = 0;

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const xml = await zip.file(slidePath).async("text");
    const matches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
    const text = matches.map((m) => decodeXmlEntities(m[1])).join(" ").replace(/\s+/g, " ").trim();
    parts.push(`[슬라이드 ${i + 1}]\n${text}`);

    const relPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relXml = await zip.file(relPath)?.async("text");
    const rels = parseRelationships(relXml || "");

    let imageNo = 0;
    let chartNo = 0;
    for (const rel of rels) {
      if (/\/image$/i.test(rel.type)) {
        imageNo += 1;
        const targetPath = normalizeZipTarget(slidePath, rel.target);
        const mime = mimeForPath(targetPath);
        const entry = zip.file(targetPath);
        if (!entry || !mime) continue;
        const existing = visualByPath.get(targetPath);
        if (existing) {
          existing.locations.push(`슬라이드 ${i + 1} · 이미지 ${imageNo}`);
          continue;
        }
        if (visualByPath.size >= MAX_VISUAL_ASSETS_PER_FILE || visualBytes >= MAX_VISUAL_BYTES_PER_FILE) continue;
        const data = await entry.async("nodebuffer");
        if (data.length < 12 * 1024 || data.length > MAX_VISUAL_ASSET_BYTES) continue;
        visualBytes += data.length;
        visualByPath.set(targetPath, {
          kind: "image",
          sourcePath: targetPath,
          mime,
          data,
          bytes: data.length,
          locations: [`슬라이드 ${i + 1} · 이미지 ${imageNo}`],
          slide: i + 1,
          context: text.slice(0, 1600),
        });
      } else if (/\/chart$/i.test(rel.type)) {
        chartNo += 1;
        const targetPath = normalizeZipTarget(slidePath, rel.target);
        const chartXml = await zip.file(targetPath)?.async("text");
        const chartSummary = extractChartSummary(chartXml || "");
        if (chartSummary) parts.push(`[슬라이드 ${i + 1} · 차트 ${chartNo}]\n${chartSummary}`);
      }
    }
  }

  return {
    text: parts.join("\n\n"),
    visuals: [...visualByPath.values()],
    stats: { slides: slidePaths.length, visualAssets: visualByPath.size, visualBytes },
  };
}

function parseSharedStrings(xml = "") {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((m) => {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXmlEntities(x[1]));
    return texts.join("");
  });
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = row[1] || "";
    const rowBody = row[2] || "";
    const rowNumber = (rowAttrs.match(/\br="([^"]+)"/) || [])[1] || String(rows.length + 1);
    const values = [];
    for (const cell of rowBody.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1] || "";
      const body = cell[2] || "";
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1] || "";
      let value = "";
      if (type === "inlineStr") {
        const textParts = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlEntities(m[1]));
        value = textParts.join("");
      } else {
        const raw = (body.match(/<v[^>]*>([\s\S]*?)<\/v>/) || [])[1];
        if (raw != null) {
          if (type === "s") value = sharedStrings[Number(raw)] ?? raw;
          else value = decodeXmlEntities(raw);
        } else {
          value = stripXml(body).trim();
        }
      }
      const cleaned = String(value).replace(/\s+/g, " ").trim();
      if (cleaned) values.push(ref ? `${ref}=${cleaned}` : cleaned);
    }
    if (values.length) rows.push(`[행 ${rowNumber}] ${values.join(" | ")}`);
  }
  return rows.join("\n");
}

async function extractXlsxDetailed(buffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  if (!workbookXml) throw new Error("XLSX workbook.xml을 찾을 수 없습니다.");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const sharedStrings = parseSharedStrings(sharedXml || "");

  const rels = {};
  for (const m of (relsXml || "").matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
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

  const parts = [];
  for (let i = 0; i < sheets.length; i++) {
    const entry = zip.file(sheets[i].target);
    if (!entry) continue;
    const xml = await entry.async("text");
    parts.push(`[시트 ${i + 1}: ${sheets[i].name}]\n${parseSheet(xml, sharedStrings)}`);
  }
  return { text: parts.join("\n\n"), visuals: [], stats: { sheets: sheets.length } };
}

async function extractOfficeMedia(buffer, prefix, locationLabel) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const paths = Object.keys(zip.files).filter((p) => p.startsWith(prefix) && mimeForPath(p)).slice(0, MAX_VISUAL_ASSETS_PER_FILE * 2);
  const visuals = [];
  let total = 0;
  for (const path of paths) {
    if (visuals.length >= MAX_VISUAL_ASSETS_PER_FILE || total >= MAX_VISUAL_BYTES_PER_FILE) break;
    const data = await zip.file(path)?.async("nodebuffer");
    if (!data || data.length < 12 * 1024 || data.length > MAX_VISUAL_ASSET_BYTES) continue;
    total += data.length;
    visuals.push({
      kind: "image",
      sourcePath: path,
      mime: mimeForPath(path),
      data,
      bytes: data.length,
      locations: [`${locationLabel} ${visuals.length + 1}`],
      context: "",
    });
  }
  return visuals;
}

export async function extractDocument(file) {
  const name = file.name || "";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (file.size > MAX_FILE_BYTES) throw new Error(`${name}: 파일당 최대 200MB까지 검토할 수 있습니다.`);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const pageParts = [];
    const data = await pdfParse(buffer, {
      pagerender: async (pageData) => {
        const textContent = await pageData.getTextContent({ normalizeWhitespace: true });
        const text = textContent.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
        pageParts.push(`[페이지 ${pageParts.length + 1}]\n${text}`);
        return text;
      },
    });
    return {
      name,
      size: file.size,
      ext,
      text: pageParts.length ? pageParts.join("\n\n") : (data.text || ""),
      visuals: [],
      sourceBuffer: buffer,
      stats: { pages: Number(data.numpages || pageParts.length || 0), textChars: String(data.text || "").length },
    };
  }

  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    const text = String(value || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => `[문단 ${i + 1}] ${line}`)
      .join("\n");
    const visuals = await extractOfficeMedia(buffer, "word/media/", "문서 이미지");
    return { name, size: file.size, ext, text, visuals, sourceBuffer: null, stats: { visualAssets: visuals.length } };
  }

  if (ext === "pptx") {
    const parsed = await extractPptxDetailed(buffer);
    return { name, size: file.size, ext, sourceBuffer: null, ...parsed };
  }

  if (ext === "xlsx") {
    const parsed = await extractXlsxDetailed(buffer);
    const visuals = await extractOfficeMedia(buffer, "xl/media/", "통합문서 이미지");
    return { name, size: file.size, ext, sourceBuffer: null, ...parsed, visuals, stats: { ...(parsed.stats || {}), visualAssets: visuals.length } };
  }

  if (["txt", "md", "csv"].includes(ext)) {
    return { name, size: file.size, ext, text: buffer.toString("utf-8"), visuals: [], sourceBuffer: null, stats: {} };
  }

  throw new Error("지원 형식: pdf, pptx, docx, xlsx, txt, md, csv");
}

export async function extractText(file) {
  return (await extractDocument(file)).text;
}

export async function extractMany(files) {
  const out = [];
  for (const file of files) out.push(await extractDocument(file));
  return out;
}
