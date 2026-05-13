import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { REPO_ROOT } from "./env.mjs";

const metaPath = path.join(REPO_ROOT, ".tmp", "build", "meta.json");
const defaultMainBudgetBytes = 550 * 1024;
const mainBudgetBytes = Number(process.env.BUNDLE_MAIN_MAX_BYTES ?? defaultMainBudgetBytes);
const strict = process.env.BUNDLE_BUDGET_STRICT === "1";

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
const message = `Main bundle ${file}: ${formatBytes(bytes)} / ${formatBytes(mainBudgetBytes)}`;

if (bytes > mainBudgetBytes) {
  const warning = `${message} budget exceeded.`;
  if (strict) {
    console.error(warning);
    process.exit(1);
  }
  console.warn(`${warning} Set BUNDLE_BUDGET_STRICT=1 to fail on this regression.`);
} else {
  console.log(`${message} within budget.`);
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}
