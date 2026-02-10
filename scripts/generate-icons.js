#!/usr/bin/env node

/**
 * VoxLink Icon Generator
 * Run: node scripts/generate-icons.js
 *
 * Generates all required PWA icons from the base SVG icon.
 * Requires: npm install sharp
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not installed. Installing...');
  require('child_process').execSync('npm install sharp --save-dev', { stdio: 'inherit' });
  sharp = require('sharp');
}

const sizes = [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');
const svgPath = path.join(iconsDir, 'icon.svg');

async function generateIcons() {
  console.log('🎨 Generating VoxLink icons...\n');

  const svgBuffer = fs.readFileSync(svgPath);

  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`✅ Generated: icon-${size}.png`);
  }

  // Generate apple-icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(iconsDir, 'apple-icon-180.png'));
  console.log('✅ Generated: apple-icon-180.png');

  // Generate maskable icons (with padding for safe area)
  for (const size of [192, 512]) {
    const padding = Math.floor(size * 0.1);
    const innerSize = size - (padding * 2);

    await sharp(svgBuffer)
      .resize(innerSize, innerSize)
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 6, g: 182, b: 212, alpha: 1 }
      })
      .png()
      .toFile(path.join(iconsDir, `maskable-${size}.png`));
    console.log(`✅ Generated: maskable-${size}.png`);
  }

  // Generate favicon.ico (just copy 32x32 for now)
  fs.copyFileSync(
    path.join(iconsDir, 'icon-32.png'),
    path.join(__dirname, '../public/favicon.ico')
  );
  console.log('✅ Generated: favicon.ico');

  console.log('\n🎉 All icons generated successfully!');
}

generateIcons().catch(console.error);
