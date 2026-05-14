import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { REPO_ROOT } from "./env.mjs";

const metaPath = path.join(REPO_ROOT, ".tmp", "build", "meta.json");
const defaultMainBudgetBytes = 550 * 1024;
const defaultLargestChunkBudgetBytes = 750 * 1024;
const mainBudgetBytes = Number(process.env.BUNDLE_MAIN_MAX_BYTES ?? defaultMainBudgetBytes);
const largestChunkBudgetBytes = Number(
  process.env.BUNDLE_LARGEST_JS_MAX_BYTES ?? defaultLargestChunkBudgetBytes,
);
const strict = process.env.BUNDLE_BUDGET_STRICT === "1" || process.argv.includes("--strict");

if (!existsSync(metaPath)) {
  console.error("Missing .tmp/build/meta.json. Run npm run build first.");
  process.exit(1);
}

const metafile = JSON.parse(await readFile(metaPath, "utf8"));
const mainEntry = Object.entries(metafile.outputs).find(([, output]) =>
  output.entryPoint?.endsWith("src/main.tsx"),
);

if (!mainEntry) {
  console.error("Could not locate the src/main.tsx output in .tmp/build/meta.json.");
  process.exit(1);
}

const [file, output] = mainEntry;
const bytes = output.bytes ?? 0;
const jsOutputs = Object.entries(metafile.outputs)
  .filter(([outputFile]) => outputFile.endsWith(".js"))
  .map(([outputFile, jsOutput]) => ({
    file: outputFile,
    bytes: jsOutput.bytes ?? 0,
  }))
  .sort((a, b) => b.bytes - a.bytes);
const largest = jsOutputs[0];
const failures = [];
const zodInputs = Object.keys(metafile.inputs ?? {}).filter((input) =>
  input.includes("node_modules/zod/"),
);

if (bytes > mainBudgetBytes) {
  failures.push(
    `Main bundle ${file}: ${formatBytes(bytes)} / ${formatBytes(mainBudgetBytes)} budget exceeded.`,
  );
} else {
  console.log(`Main bundle ${file}: ${formatBytes(bytes)} / ${formatBytes(mainBudgetBytes)} within budget.`);
}

if (largest && largest.bytes > largestChunkBudgetBytes) {
  failures.push(
    `Largest JS output ${largest.file}: ${formatBytes(largest.bytes)} / ${formatBytes(largestChunkBudgetBytes)} budget exceeded.`,
  );
} else if (largest) {
  console.log(
    `Largest JS output ${largest.file}: ${formatBytes(largest.bytes)} / ${formatBytes(largestChunkBudgetBytes)} within budget.`,
  );
}

if (zodInputs.length > 0) {
  failures.push(`Browser bundle includes Zod inputs (${zodInputs.length}); keep Zod out of production browser chunks.`);
} else {
  console.log("Browser bundle has no Zod inputs.");
}

if (failures.length > 0) {
  for (const failure of failures) {
    if (strict) console.error(failure);
    else console.warn(`${failure} Set BUNDLE_BUDGET_STRICT=1 to fail on this regression.`);
  }
  if (strict) process.exit(1);
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}
