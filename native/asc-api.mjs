import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// Minimal App Store Connect API client (ES256 JWT, no deps).
// usage: node native/asc-api.mjs <path> [keyId]                  → GET
//        node native/asc-api.mjs <METHOD> <path> [keyId] < body.json
//   e.g. node native/asc-api.mjs /v1/apps
//        node native/asc-api.mjs PATCH /v1/appStoreVersionLocalizations/<id> < body.json
const HTTP_METHODS = ["GET", "POST", "PATCH", "DELETE"];
const hasMethod = HTTP_METHODS.includes(process.argv[2]);
const METHOD = hasMethod ? process.argv[2] : "GET";
const PATH_ARG = hasMethod ? process.argv[3] : process.argv[2];
const KEY_ARG = hasMethod ? process.argv[4] : process.argv[3];

const ISSUER = "18ea1a6b-9f32-4076-b95b-56b7f0955a4c";
const KEY_ID = KEY_ARG ?? "U23PJ7SP52";
const KEY_PATH = `${homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

const b64url = (buf) =>
  Buffer.from(buf).toString("base64url");

function makeJwt() {
  const header = b64url(
    JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      iss: ISSUER,
      iat: now,
      exp: now + 900,
      aud: "appstoreconnect-v1",
    }),
  );
  const key = createPrivateKey(readFileSync(KEY_PATH, "utf8"));
  const sig = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${b64url(sig)}`;
}

const path = PATH_ARG ?? "/v1/apps";
let body;
if (METHOD !== "GET" && !process.stdin.isTTY) {
  body = readFileSync(0, "utf8");
}
const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
  method: METHOD,
  headers: {
    Authorization: `Bearer ${makeJwt()}`,
    ...(body ? { "Content-Type": "application/json" } : {}),
  },
  body,
});
console.log(`HTTP ${res.status}`);
const text = await res.text();
console.log(text ? JSON.stringify(JSON.parse(text), null, 2).slice(0, 4000) : "(empty)");
