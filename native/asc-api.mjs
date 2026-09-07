import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

// Minimal App Store Connect API client (ES256 JWT, no deps).
// usage: node native/asc-api.mjs <GET-path> [keyId]
//   e.g. node native/asc-api.mjs /v1/apps
const ISSUER = "18ea1a6b-9f32-4076-b95b-56b7f0955a4c";
const KEY_ID = process.argv[3] ?? "U23PJ7SP52";
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

const path = process.argv[2] ?? "/v1/apps";
const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
  headers: { Authorization: `Bearer ${makeJwt()}` },
});
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2).slice(0, 4000));
