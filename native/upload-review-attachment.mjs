import { createPrivateKey, sign, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// Uploads a file as an App Review Information attachment (App Store Connect →
// App Review Information → Attachments — visible to the reviewer).
// usage: node native/upload-review-attachment.mjs <reviewDetailId> <filePath> [displayName]
const DETAIL_ID = process.argv[2];
const FILE_PATH = process.argv[3];
const DISPLAY_NAME = process.argv[4] ?? FILE_PATH?.split("/").pop();
if (!DETAIL_ID || !FILE_PATH) {
  console.error("usage: node native/upload-review-attachment.mjs <reviewDetailId> <filePath> [displayName]");
  process.exit(1);
}

const ISSUER = "18ea1a6b-9f32-4076-b95b-56b7f0955a4c";
const KEY_ID = "U23PJ7SP52";
const KEY_PATH = `${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

function jwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const p = b64({ iss: ISSUER, iat: now, exp: now + 900, aud: "appstoreconnect-v1" });
  const key = createPrivateKey(readFileSync(KEY_PATH, "utf8"));
  const s = sign("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" });
  return `${h}.${p}.${Buffer.from(s).toString("base64url")}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

const buf = readFileSync(FILE_PATH);
console.log(`file: ${DISPLAY_NAME} (${(buf.length / 1048576).toFixed(1)} MB)`);

// 1) Reserve the attachment
const reserved = await api("POST", "/v1/appStoreReviewAttachments", {
  data: {
    type: "appStoreReviewAttachments",
    attributes: { fileName: DISPLAY_NAME, fileSize: buf.length },
    relationships: {
      appStoreReviewDetail: { data: { type: "appStoreReviewDetails", id: DETAIL_ID } },
    },
  },
});
const attId = reserved.data.id;
const ops = reserved.data.attributes.uploadOperations || [];
console.log(`reserved attachment ${attId} · ${ops.length} upload operation(s)`);

// 2) Upload each chunk
let n = 0;
for (const op of ops) {
  const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
  const chunk = buf.subarray(op.offset, op.offset + op.length);
  const up = await fetch(op.url, { method: op.method, headers, body: chunk });
  if (!up.ok) throw new Error(`chunk ${++n} upload failed ${up.status}`);
  console.log(`  uploaded chunk ${++n}/${ops.length} (${(chunk.length / 1048576).toFixed(1)} MB)`);
}

// 3) Commit
await api("PATCH", `/v1/appStoreReviewAttachments/${attId}`, {
  data: {
    type: "appStoreReviewAttachments",
    id: attId,
    attributes: {
      uploaded: true,
      sourceFileChecksum: createHash("md5").update(buf).digest("hex"),
    },
  },
});
console.log(`✓ committed attachment ${attId}`);
