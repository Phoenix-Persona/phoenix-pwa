import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { REPO_ROOT } from "../../scripts/env.mjs";

const port = Number(process.env.PORT ?? 48733);
const distDir = path.join(REPO_ROOT, "dist");
const baseUrl = `http://127.0.0.1:${port}`;
const failures = [];

function fail(message) {
  failures.push(message);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json") || filePath.endsWith(".webmanifest")) return "application/json";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const decodedPath = decodeURIComponent(url.pathname);
    const requested = decodedPath === "/" ? "/index.html" : decodedPath;
    let filePath = path.join(distDir, requested);

    if (!filePath.startsWith(distDir)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    if (!existsSync(filePath) && requested.startsWith("/assets/")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Asset not found");
      return;
    }
    if (!existsSync(filePath)) {
      filePath = path.join(distDir, "index.html");
    }

    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Content-Type", contentType(filePath));
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
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
    fail(`${name} expected ${expected}, received ${value ?? "missing"}`);
  }
}

function expectContentType(response, expected, pathname) {
  const value = response.headers.get("content-type") ?? "";
  if (!value.includes(expected)) {
    fail(`${pathname} expected content-type containing ${expected}, received ${value || "missing"}`);
  }
}

const server = await startServer();

try {
  const root = await fetchText("/");
  if (!root.response.ok) fail("Root dist HTML did not load.");
  expectHeader(root.response, "cross-origin-opener-policy", "same-origin");
  expectHeader(root.response, "cross-origin-embedder-policy", "credentialless");
  if (!root.text.includes("http-equiv=\"content-security-policy\"")) {
    fail("dist/index.html is missing CSP meta.");
  }

  const route = await fetchText("/p/npub1missing");
  if (!route.response.ok || !route.text.includes("<div id=\"root\"></div>")) {
    fail("Production SPA fallback did not return dist/index.html.");
  }

  const jsMatch = root.text.match(/<script type="module" src="([^"]+main-[^"]+\.js)"><\/script>/);
  const cssMatch = root.text.match(/<link rel="stylesheet" href="([^"]+index-[^"]+\.css)">/);
  if (!jsMatch?.[1]) fail("dist/index.html is missing a hashed JS asset reference.");
  if (!cssMatch?.[1]) fail("dist/index.html is missing a hashed CSS asset reference.");

  if (jsMatch?.[1]) {
    const js = await fetchText(jsMatch[1]);
    if (!js.response.ok || js.text.length < 1_000) fail(`JS asset did not load: ${jsMatch[1]}`);
    expectContentType(js.response, "javascript", jsMatch[1]);
  }
  if (cssMatch?.[1]) {
    const css = await fetchText(cssMatch[1]);
    if (!css.response.ok || css.text.length < 100) fail(`CSS asset did not load: ${cssMatch[1]}`);
    expectContentType(css.response, "text/css", cssMatch[1]);
    if (css.text.includes("<!DOCTYPE html>")) fail("CSS asset returned HTML.");
  }

  const sw = await fetchText("/sw.js");
  if (!sw.response.ok || !sw.text.includes("zuka-static")) fail("Service worker did not load.");
  expectContentType(sw.response, "javascript", "/sw.js");

  const manifest = await fetchText("/manifest.webmanifest");
  if (!manifest.response.ok) fail("Manifest did not load.");
  expectContentType(manifest.response, "application/json", "/manifest.webmanifest");
  const parsedManifest = JSON.parse(manifest.text);
  for (const icon of parsedManifest.icons ?? []) {
    const iconPath = icon.src;
    const iconResponse = await fetch(`${baseUrl}${iconPath}`);
    if (!iconResponse.ok) fail(`Manifest icon missing: ${iconPath}`);
  }

  if (failures.length > 0) {
    console.error("Production PWA smoke check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Production PWA smoke check passed.");
} finally {
  server.close();
}
