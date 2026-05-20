import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "dotenv";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BLOCKED_PRODUCTION_CLIENT_SECRETS = [
  "VITE_APP_USER_NSEC",
  "VITE_PPQ_API_KEY",
  "VITE_PPQ_CREDIT_ID",
  "VITE_WALLET_SEED",
];

async function loadDotEnv(filePath) {
  try {
    return parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return {};
    throw err;
  }
}

function copyClientEnvKeys(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith("VITE_") && typeof value === "string" && value.length > 0) {
      target[key] = value;
    }
  }
}

export async function loadMergedClientEnv({ mode = "development" } = {}) {
  const devEnv = await loadDotEnv(path.join(REPO_ROOT, "dev", ".env"));
  const rootEnv = await loadDotEnv(path.join(REPO_ROOT, ".env"));
  const merged = {};

  copyClientEnvKeys(merged, devEnv);
  copyClientEnvKeys(merged, rootEnv);
  copyClientEnvKeys(merged, process.env);

  if (mode === "production") {
    const present = BLOCKED_PRODUCTION_CLIENT_SECRETS.filter((key) => merged[key]);
    if (present.length > 0) {
      throw new Error(
        `Refusing production build with client-exposed secret env vars: ${present.join(", ")}`,
      );
    }
  }

  return merged;
}

export async function esbuildDefines({ mode = "development" } = {}) {
  const env = await loadMergedClientEnv({ mode });
  return {
    __PHOENIX_ENV__: JSON.stringify(env),
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
  };
}
