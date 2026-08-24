import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewBlobPath } from "../lib/blobPath.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const generated = buildReviewBlobPath("Parnas_Academy(안)_V4.pdf", { now: 1787547669780, id: "abc-123" });
assert.equal(generated, "review/1787547669780-abc-123.pdf");
assert.match(generated, /^[\x20-\x7E]+$/);
console.log("✓ Unicode display filename is decoupled from ASCII-only Blob pathname");

const chat = fs.readFileSync(path.join(root, "components/ChatPane.js"), "utf8");
assert.ok(!chat.includes("DIRECT_UPLOAD_THRESHOLD"), "small/large upload threshold must be removed");
assert.ok(!chat.includes("new FormData()"), "attachment FormData branch must be removed");
assert.ok(chat.includes("uploadReviewFiles(filesForRequest)"), "all files must use the Blob uploader");
assert.ok(chat.includes('content-type": "application/json"'), "review request must send Blob descriptors as JSON");
console.log("✓ Client uses one Private Blob upload path for every attachment");

const review = fs.readFileSync(path.join(root, "app/api/review/route.js"), "utf8");
assert.ok(!review.includes("req.formData()"), "review API must not accept inline attachment bodies");
assert.ok(review.includes("extractBlobDocuments(blobFiles)"), "review API must consume Blob descriptors");
assert.ok(review.includes("readPrivateBlob(pathname, name, declaredSize)"), "server must verify/read the uploaded Blob");
assert.ok(review.includes("enrichDocumentsWithVisualReview([parsed])"), "each file must complete Visual Review before advancing");
console.log("✓ Review server reads/parses/OCRs Blob files sequentially");

const health = fs.readFileSync(path.join(root, "app/api/health/route.js"), "utf8");
assert.ok(health.includes('version: "2.1.5-beta"'));
assert.ok(health.includes("unifiedBlobUploadPipeline: true"));
assert.ok(health.includes('blobUploadMode: process.env.BLOB_STORE_ID ? "all-files-oidc-signed-put"'));
console.log("✓ Health endpoint exposes V2.1.5 GET-only unified pipeline state");

const blobServer = fs.readFileSync(path.join(root, "lib/blobServer.js"), "utf8");
assert.ok(!blobServer.includes("operation: \"head\""), "Blob read pipeline must not presign HEAD");
assert.ok(!blobServer.includes("[\"head\", \"get\"]"), "Blob read pipeline must not request HEAD");
assert.ok(blobServer.includes("makeSignedBlobUrl(pathname, \"get\")"), "Blob read pipeline must use signed GET");
assert.ok(blobServer.includes("arrayBuffer.byteLength !== expectedSize"), "Blob read pipeline must verify byte length");
console.log("✓ Blob verification uses GET + retry + byte-length check without HEAD");
