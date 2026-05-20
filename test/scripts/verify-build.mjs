import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { REPO_ROOT } from "../../scripts/env.mjs";

const distDir = path.join(REPO_ROOT, "dist");
const failures = [];

function fail(message) {
  failures.push(message);
}

function requireFile(relativePath) {
  const fullPath = path.join(distDir, relativePath);
  if (!existsSync(fullPath)) {
    fail(`Missing dist file: ${relativePath}`);
    return;
  }
  if (statSync(fullPath).size === 0) {
    fail(`Dist file is empty: ${relativePath}`);
  }
}

async function assetFiles() {
  const dir = path.join(distDir, "assets");
  if (!existsSync(dir)) {
    fail("Missing dist assets directory.");
    return [];
  }
  return readdir(dir);
}

requireFile("index.html");
requireFile("404.html");
requireFile("manifest.webmanifest");
requireFile("sw.js");
requireFile("icon.svg");
requireFile("icon-192.png");
requireFile("icon-512.png");
requireFile("icon-maskable.png");
requireFile("ffmpeg/ffmpeg-core.js");
requireFile("ffmpeg/ffmpeg-core.wasm");
requireFile("assets/breez_sdk_spark_wasm_bg.wasm");
requireFile("assets/files/inter-latin-standard-normal.woff2");
requireFile("assets/files/fraunces-latin-standard-normal.woff2");

const html = existsSync(path.join(distDir, "index.html"))
  ? await readFile(path.join(distDir, "index.html"), "utf8")
  : "";
if (html.includes("/src/main.tsx")) {
  fail("dist/index.html still references /src/main.tsx.");
}
if (!/<script type="module" src="\/assets\/main-[^"]+\.js"><\/script>/.test(html)) {
  fail("dist/index.html is missing the hashed main JS asset.");
}
if (!/<link rel="stylesheet" href="\/assets\/index-[^"]+\.css">/.test(html)) {
  fail("dist/index.html is missing the hashed CSS asset.");
}

const assets = await assetFiles();
if (!assets.some((file) => /^main-.+\.js$/.test(file))) {
  fail("Missing hashed main JS asset.");
}
if (!assets.some((file) => /^index-.+\.css$/.test(file))) {
  fail("Missing hashed CSS asset.");
}

if (failures.length > 0) {
  console.error("Build verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Build verification passed.");
