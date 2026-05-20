import { spawn } from "node:child_process";

import { chromium } from "playwright";

import { REPO_ROOT } from "../../scripts/env.mjs";

const port = Number(process.env.PORT ?? 48732);
const baseUrl = `http://127.0.0.1:${port}`;
const failures = [];

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
      reject(new Error(`Dev server exited before browser smoke completed: ${code}`));
    });
  });
}

function isFirstParty(url) {
  return url.startsWith(baseUrl);
}

const child = spawn(process.execPath, ["scripts/dev.mjs"], {
  cwd: REPO_ROOT,
  env: { ...process.env, PORT: String(port), VITE_ZUKA_RUNTIME: "test" },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser;
try {
  await waitForServer(child);
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

    const contentType = response.headers()["content-type"] ?? "";
    if (pathname.endsWith(".js") && !contentType.includes("javascript")) {
      failures.push(`${pathname} served with ${contentType || "missing content-type"}`);
    }
    if (pathname.endsWith(".css") && !contentType.includes("text/css")) {
      failures.push(`${pathname} served with ${contentType || "missing content-type"}`);
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
    console.error("Browser smoke check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("Browser smoke check passed.");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
}
