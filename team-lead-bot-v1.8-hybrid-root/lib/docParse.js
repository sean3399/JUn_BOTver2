const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

async function extractPptx(buffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort(naturalSort);

  const parts = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.file(slidePaths[i]).async("text");
    const matches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
    const text = matches.map((m) => decodeXmlEntities(m[1])).join(" ");
    parts.push(`[슬라이드 ${i + 1}]\n${text}`);
  }
  return parts.join("\n\n");
}

function parseSharedStrings(xml = "") {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((m) => {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXmlEntities(x[1]));
    return texts.join("");
  });
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const values = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1] || "";
      const body = cell[2] || "";
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
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
      values.push(String(value).replace(/\s+/g, " ").trim());
    }
    if (values.some(Boolean)) rows.push(values.join(" | "));
  }
  return rows.join("\n");
}

async function extractXlsx(buffer) {
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
  return parts.join("\n\n");
}

export async function extractText(file) {
  const name = file.name || "";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (file.size > MAX_FILE_BYTES) throw new Error(`${name}: 파일은 4MB 이하만 업로드할 수 있습니다.`);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text || "";
  }
  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    return value || "";
  }
  if (ext === "pptx") return extractPptx(buffer);
  if (ext === "xlsx") return extractXlsx(buffer);
  if (["txt", "md", "csv"].includes(ext)) return buffer.toString("utf-8");
  throw new Error("지원 형식: pdf, pptx, docx, xlsx, txt, md, csv");
}

export async function extractMany(files) {
  const out = [];
  for (const file of files) out.push({ name: file.name, size: file.size, text: await extractText(file) });
  return out;
}
