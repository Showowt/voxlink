// ─────────────────────────────────────────────────────────────────────────────
// render-brand.mjs — regenerate every Entrevoz brand raster from the canonical
// two-bubble SVG sources. Run: node native/assets/render-brand.mjs
//   Sources : entrevoz-icon.svg (full-bleed dark), entrevoz-maskable.svg,
//             entrevoz-mark.svg (transparent), splash.svg
//   Outputs : public/icons/*  ·  public/favicon.ico  ·  ios AppIcon + Splash
// ─────────────────────────────────────────────────────────────────────────────
import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const iconsDir = join(root, "public", "icons");
const iosAssets = join(root, "ios", "App", "App", "Assets.xcassets");

const iconSvg = join(here, "entrevoz-icon.svg");
const maskSvg = join(here, "entrevoz-maskable.svg");
const splashSvg = join(here, "splash.svg");

// Opaque square PNG from the full-bleed dark icon
const icon = (size) =>
  sharp(iconSvg).resize(size, size).flatten({ background: "#0D0D0D" }).png();

// 1) PWA / favicon "any" icons
const anySizes = [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512];
for (const s of anySizes) {
  await icon(s).toFile(join(iconsDir, `icon-${s}.png`));
}
// Apple touch icon (opaque, 180)
await icon(180).toFile(join(iconsDir, "apple-icon-180.png"));

// 2) Maskable icons (safe-zone variant)
for (const s of [192, 512]) {
  await sharp(maskSvg)
    .resize(s, s)
    .flatten({ background: "#0D0D0D" })
    .png()
    .toFile(join(iconsDir, `maskable-${s}.png`));
}

// 3) favicon.ico — ICO wrapping 16 + 32 + 48 PNG entries
const icoPngs = await Promise.all(
  [16, 32, 48].map(async (s) => ({
    size: s,
    buf: await icon(s).toBuffer(),
  })),
);
const count = icoPngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(count, 4);
const dir = Buffer.alloc(16 * count);
let offset = 6 + 16 * count;
icoPngs.forEach((e, i) => {
  const b = dir.subarray(i * 16, i * 16 + 16);
  b.writeUInt8(e.size >= 256 ? 0 : e.size, 0); // width
  b.writeUInt8(e.size >= 256 ? 0 : e.size, 1); // height
  b.writeUInt8(0, 2); // palette
  b.writeUInt8(0, 3); // reserved
  b.writeUInt16LE(1, 4); // color planes
  b.writeUInt16LE(32, 6); // bpp
  b.writeUInt32LE(e.buf.length, 8); // size of PNG data
  b.writeUInt32LE(offset, 12); // offset
  offset += e.buf.length;
});
writeFileSync(
  join(root, "public", "favicon.ico"),
  Buffer.concat([header, dir, ...icoPngs.map((e) => e.buf)]),
);

// 4) iOS App Store icon (1024, opaque, no alpha)
await sharp(iconSvg)
  .resize(1024, 1024)
  .flatten({ background: "#0D0D0D" })
  .removeAlpha()
  .png()
  .toFile(join(iosAssets, "AppIcon.appiconset", "AppIcon-512@2x.png"));

// 5) iOS splash (2732 square, three slots)
const splashBuf = await sharp(splashSvg)
  .resize(2732, 2732)
  .flatten({ background: "#0C0C0C" })
  .png()
  .toBuffer();
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  await sharp(splashBuf).toFile(join(iosAssets, "Splash.imageset", name));
}

console.log("Entrevoz brand assets rendered ✓");
