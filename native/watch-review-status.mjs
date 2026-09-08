import { execSync } from "node:child_process";

const SUB = "db70bae4-878a-4fda-9356-281ce25f064c";
const VER = "5e20b3ad-392d-478b-990a-6d55c2582de6";

function stateOf() {
  try {
    const out = execSync(
      `node native/asc-api.mjs "/v1/appStoreVersions/${VER}?fields[appStoreVersions]=appStoreState" 2>/dev/null`,
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const m = /"appStoreState":\s*"([^"]+)"/.exec(out);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const s = stateOf();
console.log(new Date().toISOString(), "state:", s);
