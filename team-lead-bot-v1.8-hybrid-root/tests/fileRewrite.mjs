import fs from "node:fs";
import assert from "node:assert/strict";

const workspace = fs.readFileSync("components/ReviewWorkspace.js", "utf8");
const chat = fs.readFileSync("components/ChatPane.js", "utf8");
const route = fs.readFileSync("app/api/rewrite-file/route.js", "utf8");
const engine = fs.readFileSync("lib/fileRewrite.js", "utf8");

assert.match(workspace, /수정본 파일 생성/);
assert.match(workspace, /수정안 채택/);
assert.match(workspace, /originalText:/);
assert.match(workspace, /evidenceLocation:/);
assert.match(chat, /reviewSourceFilesRef/);
assert.match(chat, /\/api\/rewrite-file/);
assert.match(chat, /link\.download = fileName/);
assert.match(route, /rewriteFileBuffer/);
assert.match(route, /x-jun-applied-edits/);
assert.match(engine, /rewritePptx/);
assert.match(engine, /rewriteDocx/);
assert.match(engine, /rewriteXlsx/);
assert.match(engine, /rewritePdf/);
assert.match(engine, /Subtype: "Text"/);
assert.doesNotMatch(engine, /BLOB_READ_WRITE_TOKEN/);

console.log("file rewrite export static checks passed");
