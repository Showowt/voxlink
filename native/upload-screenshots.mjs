import { createPrivateKey, sign, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

// Uploads native/screenshots/*.png to an App Store version localization.
// usage: node native/upload-screenshots.mjs <localizationId> [displayType]
const LOC_ID = process.argv[2];
const DISPLAY_TYPE = process.argv[3] ?? "APP_IPHONE_67";
if (!LOC_ID) {
  console.error("usage: node native/upload-screenshots.mjs <localizationId> [displayType]");
  process.exit(1);
}

const ISSUER = "18ea1a6b-9f32-4076-b95b-56b7f0955a4c";
const KEY_ID = "U23PJ7SP52";
const KEY_PATH = `${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;
const SHOT_DIR = new URL("./screenshots/", import.meta.url).pathname;

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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

// Find or create the screenshot set for this display type
const sets = await api(
  "GET",
  `/v1/appStoreVersionLocalizations/${LOC_ID}/appScreenshotSets?filter[screenshotDisplayType]=${DISPLAY_TYPE}`,
);
let setId = sets.data?.[0]?.id;
if (!setId) {
  const created = await api("POST", "/v1/appScreenshotSets", {
    data: {
      type: "appScreenshotSets",
      attributes: { screenshotDisplayType: DISPLAY_TYPE },
      relationships: {
        appStoreVersionLocalization: {
          data: { type: "appStoreVersionLocalizations", id: LOC_ID },
        },
      },
    },
  });
  setId = created.data.id;
}
console.log(`set ${DISPLAY_TYPE}: ${setId}`);

const files = readdirSync(SHOT_DIR).filter((f) => f.endsWith(".png")).sort();
for (const file of files) {
  const buf = readFileSync(`${SHOT_DIR}${file}`);
  const reserved = await api("POST", "/v1/appScreenshots", {
    data: {
      type: "appScreenshots",
      attributes: { fileName: file, fileSize: buf.length },
      relationships: {
        appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } },
      },
    },
  });
  const shotId = reserved.data.id;
  for (const op of reserved.data.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const chunk = buf.subarray(op.offset, op.offset + op.length);
    const up = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (!up.ok) throw new Error(`chunk upload failed ${up.status} for ${file}`);
  }
  await api("PATCH", `/v1/appScreenshots/${shotId}`, {
    data: {
      type: "appScreenshots",
      id: shotId,
      attributes: {
        uploaded: true,
        sourceFileChecksum: createHash("md5").update(buf).digest("hex"),
      },
    },
  });
  console.log(`uploaded ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
}
console.log("done");
