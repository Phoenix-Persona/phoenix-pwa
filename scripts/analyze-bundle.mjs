import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import * as esbuild from "esbuild";

import { REPO_ROOT } from "./env.mjs";

const metaPath = path.join(REPO_ROOT, ".tmp", "build", "meta.json");

if (!existsSync(metaPath)) {
  console.error("Missing .tmp/build/meta.json. Run npm run build first.");
  process.exit(1);
}

const metafile = JSON.parse(await readFile(metaPath, "utf8"));
const analysis = await esbuild.analyzeMetafile(metafile, {
  verbose: false,
  color: false,
});

const outputs = Object.entries(metafile.outputs)
  .map(([file, output]) => ({
    file,
    bytes: output.bytes ?? 0,
  }))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 10);

console.log("Top output files:");
for (const output of outputs) {
  console.log(`- ${output.file}: ${formatBytes(output.bytes)}`);
}

console.log("\nEsbuild analysis:");
console.log(analysis.trim());

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}
