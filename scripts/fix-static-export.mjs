#!/usr/bin/env node
/**
 * Works around a Next.js static-export bug on Windows: the router's segment prefetch files are
 * written as nested folders (`__next.models/$d$slug/__PAGE__.txt`) instead of flat, dot-separated
 * names (`__next.models.$d$slug.__PAGE__.txt`), because the path is built with OS separators.
 * The client requests the flat names, so prefetches 404. This flattens them. No-op elsewhere.
 */
import fs from "node:fs";
import path from "node:path";

if (process.platform !== "win32") process.exit(0);

const OUT = path.resolve("out");
let moved = 0;

function flatten(parent, name) {
  const root = path.join(parent, name);
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const rel = path.relative(root, path.join(entry.parentPath, entry.name));
    fs.renameSync(path.join(root, rel), path.join(parent, `${name}.${rel.split(path.sep).join(".")}`));
    moved++;
  }
  fs.rmSync(root, { recursive: true });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) flatten(dir, entry.name);
    else walk(path.join(dir, entry.name));
  }
}

if (fs.existsSync(OUT)) {
  walk(OUT);
  console.log(`fix-static-export: flattened ${moved} prefetch file(s)`);
}
