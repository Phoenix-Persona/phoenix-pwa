import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

import { REPO_ROOT } from "../../scripts/env.mjs";

const port = Number(process.env.PORT ?? 48734);
const distDir = path.join(REPO_ROOT, "dist");
const baseUrl = `http://127.0.0.1:${port}`;
const failures = [];

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
    const relativePath = path.relative(distDir, filePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
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

function isFirstParty(url) {
  return url.startsWith(baseUrl);
}

const server = await startServer();
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("pageerror", (error) => {
    failures.push(`page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`console.error: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (isFirstParty(request.url())) {
      failures.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`);
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!isFirstParty(url)) return;

    const pathname = new URL(url).pathname;
    if (response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${pathname}`);
      return;
    }

    const responseContentType = response.headers()["content-type"] ?? "";
    if (pathname.endsWith(".js") && !responseContentType.includes("javascript")) {
      failures.push(`${pathname} served with ${responseContentType || "missing content-type"}`);
    }
    if (pathname.endsWith(".css") && !responseContentType.includes("text/css")) {
      failures.push(`${pathname} served with ${responseContentType || "missing content-type"}`);
    }
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#root")?.textContent?.includes("Zuka"),
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const title = await page.title();
  if (!title.includes("Zuka")) {
    failures.push(`unexpected page title: ${title}`);
  }

  const rootText = await page.locator("#root").innerText({ timeout: 5_000 });
  if (!rootText.includes("Zuka")) {
    failures.push("root did not render expected app content.");
  }

  if (failures.length > 0) {
    console.error("Production browser smoke check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Production browser smoke check passed.");
} finally {
  await browser?.close();
  server.close();
}
