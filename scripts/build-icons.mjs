#!/usr/bin/env node
/**
 * Renders the favicon set from the master SVG (src/app/icon.svg):
 *   src/app/favicon.ico        16/32/48 px (PNG-in-ICO)
 *   src/app/apple-icon.png     180 px, opaque, for iOS home screens
 *   public/icons/icon-*.png    192/512 px + maskable 512 px for the web app manifest
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SVG = fs.readFileSync(path.join(ROOT, "src", "app", "icon.svg"), "utf8");
// Square-cornered variant for platforms that apply their own mask (iOS, Android adaptive icons).
const SQUARE_SVG = SVG.replace(/ rx="[\d.]+"/, "");

const render = (size, svg = SVG) =>
  sharp(Buffer.from(svg), { density: Math.max(72, (size / 64) * 72 * 2) }).resize(size, size).png().toBuffer();

/** Minimal ICO writer: a directory of PNG-compressed images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(icoSizes.map(async (size) => ({ size, data: await render(size) })));
fs.writeFileSync(path.join(ROOT, "src", "app", "favicon.ico"), ico(icoImages));

// iOS rounds the corners itself and ignores transparency, so render full-bleed.
fs.writeFileSync(path.join(ROOT, "src", "app", "apple-icon.png"), await render(180, SQUARE_SVG));

const iconsDir = path.join(ROOT, "public", "icons");
fs.mkdirSync(iconsDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), await render(size));
}
// Maskable: full-bleed background; the gamepad already sits inside the 80% safe zone.
fs.writeFileSync(path.join(iconsDir, "icon-maskable-512.png"), await render(512, SQUARE_SVG));

console.log("Icons written: favicon.ico, apple-icon.png, public/icons/*");
