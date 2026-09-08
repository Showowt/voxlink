import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const iosAssets = join(here, "..", "..", "ios", "App", "App", "Assets.xcassets");

// App Store icon: 1024x1024, opaque, no alpha channel (canonical two-bubble mark)
await sharp(join(here, "entrevoz-icon.svg"))
  .resize(1024, 1024)
  .flatten({ background: "#0D0D0D" })
  .removeAlpha()
  .png()
  .toFile(join(iosAssets, "AppIcon.appiconset", "AppIcon-512@2x.png"));

// Splash: 2732x2732 for 1x/2x/3x slots
const splash = sharp(join(here, "splash.svg")).resize(2732, 2732).png();
const buf = await splash.toBuffer();
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  await sharp(buf).toFile(join(iosAssets, "Splash.imageset", name));
}

console.log("iOS assets rendered");
