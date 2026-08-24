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
assert.ok(review.includes("readPrivateBlob(blobUrl, pathname, name, declaredSize)"), "server must read the exact Blob URL returned by PUT");
assert.ok(review.includes("enrichDocumentsWithVisualReview([parsed])"), "each file must complete Visual Review before advancing");
console.log("✓ Review server reads/parses/OCRs Blob files sequentially");

const health = fs.readFileSync(path.join(root, "app/api/health/route.js"), "utf8");
assert.ok(health.includes('version: "2.1.6-beta"'));
assert.ok(health.includes("unifiedBlobUploadPipeline: true"));
assert.ok(health.includes('blobUploadMode: process.env.BLOB_STORE_ID ? "all-files-oidc-signed-put"'));
console.log("✓ Health endpoint exposes V2.1.6 exact-URL unified pipeline state");

const blobServer = fs.readFileSync(path.join(root, "lib/blobServer.js"), "utf8");
assert.ok(blobServer.includes('get(blobUrl'), "server must use exact PUT-returned Blob URL");
assert.ok(blobServer.includes('storeId: process.env.BLOB_STORE_ID'), "server read must be store-scoped");
assert.ok(!blobServer.includes('makeSignedBlobUrl'), "server must not reconstruct a signed GET URL from pathname");
assert.ok(blobServer.includes("arrayBuffer.byteLength !== expectedSize"), "Blob read pipeline must verify byte length");
console.log("✓ Blob verification uses exact PUT URL + SDK get + byte-length check");
