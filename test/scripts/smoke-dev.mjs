import { spawn } from "node:child_process";

import { REPO_ROOT } from "../../scripts/env.mjs";

const port = 48731;
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for dev server.")), 20_000);
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      if (text.includes("Dev server listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Dev server exited before smoke checks completed: ${code}`));
    });
  });
}

async function fetchText(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  return { response, text };
}

function expectHeader(response, name, expected) {
  const value = response.headers.get(name);
  if (value !== expected) {
    throw new Error(`${name} expected ${expected}, received ${value ?? "missing"}`);
  }
}

const child = spawn(process.execPath, ["scripts/dev.mjs"], {
  cwd: REPO_ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(child);

  const root = await fetchText("/");
  if (!root.response.ok || !root.text.includes("/assets/main.js")) {
    throw new Error("Root dev HTML did not load the dev JS asset.");
  }
  expectHeader(root.response, "cross-origin-opener-policy", "same-origin");
  expectHeader(root.response, "cross-origin-embedder-policy", "credentialless");

  const route = await fetchText("/fake/persona/route");
  if (!route.response.ok || !route.text.includes("<div id=\"root\"></div>")) {
    throw new Error("SPA fallback did not return index.html.");
  }

  const main = await fetchText("/assets/main.js");
  if (!main.response.ok || main.text.length < 1_000) {
    throw new Error("Dev main JS asset is missing or unexpectedly small.");
  }

  const css = await fetchText("/assets/index.css");
  if (!css.response.ok || css.text.length < 100) {
    throw new Error("Dev CSS asset is missing or unexpectedly small.");
  }
  expectHeader(css.response, "content-type", "text/css; charset=utf-8");
  if (css.text.includes("<!DOCTYPE html>")) {
    throw new Error("Dev CSS asset returned the SPA fallback HTML.");
  }

  const manifest = await fetchText("/manifest.webmanifest");
  if (!manifest.response.ok || !manifest.text.includes("\"short_name\": \"Zuka\"")) {
    throw new Error("Manifest did not load from the dev server.");
  }

  console.log("Dev smoke check passed.");
} finally {
  child.kill("SIGTERM");
}
