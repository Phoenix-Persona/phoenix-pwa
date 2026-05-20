import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { REPO_ROOT } from "../../scripts/env.mjs";

const failures = [];
const sourceHtmlLabel = "public/index.html";

function fail(message) {
  failures.push(message);
}

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function checkNoInlineScripts(html) {
  const withoutComments = stripHtmlComments(html);
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of withoutComments.matchAll(scriptPattern)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    if (!/\bsrc\s*=/i.test(attributes) && body.trim().length > 0) {
      fail(`${sourceHtmlLabel} contains an inline <script> body; use external scripts only.`);
    }
  }
}

function requirePattern(source, pattern, message) {
  if (!pattern.test(source)) fail(message);
}

function manifestPathFromHtml(html) {
  const link = html.match(/<link\b(?=[^>]*\brel=["']manifest["'])([^>]*)>/i);
  if (!link) return undefined;
  return link[1]?.match(/\bhref=["']([^"']+)["']/i)?.[1];
}

function resolveManifestPath(href, htmlDir) {
  if (href.startsWith("/")) return repoPath("public", href.slice(1));
  return path.resolve(htmlDir, href);
}

async function checkHtmlPolicy() {
  const htmlPath = repoPath("public", "index.html");
  const html = await readFile(htmlPath, "utf8");
  const htmlDir = path.dirname(htmlPath);

  checkNoInlineScripts(html);
  requirePattern(html, /<meta\b[^>]*name=["']viewport["'][^>]*>/i, `${sourceHtmlLabel} is missing viewport meta.`);
  requirePattern(html, /<meta\b[^>]*name=["']description["'][^>]*>/i, `${sourceHtmlLabel} is missing description meta.`);
  requirePattern(html, /<meta\b[^>]*property=["']og:type["'][^>]*>/i, `${sourceHtmlLabel} is missing og:type meta.`);
  requirePattern(html, /<meta\b[^>]*property=["']og:title["'][^>]*>/i, `${sourceHtmlLabel} is missing og:title meta.`);
  requirePattern(html, /<meta\b[^>]*property=["']og:description["'][^>]*>/i, `${sourceHtmlLabel} is missing og:description meta.`);

  const manifestHref = manifestPathFromHtml(html);
  if (!manifestHref) {
    fail(`${sourceHtmlLabel} is missing a web manifest link.`);
    return;
  }
  const manifestPath = resolveManifestPath(manifestHref, htmlDir);
  if (!existsSync(manifestPath)) {
    fail(`${sourceHtmlLabel} manifest link points to a missing file: ${manifestHref}`);
  }
}

function checkNoLegacyArtifacts() {
  const blocked = [
    "index.html",
    "eslint-rules",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    ".eslintcache",
    "test-results",
  ];
  for (const artifact of blocked) {
    if (existsSync(repoPath(artifact))) fail(`Remove legacy/generated root artifact: ${artifact}`);
  }
}

async function walkFiles(dir) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".tmp" ||
      entry.name === ".git" ||
      entry.name === ".agents"
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function checkComments() {
  const files = await walkFiles(REPO_ROOT);
  const commentPattern = /(\/\/\s*in a real\b|\/\*+\s*in a real\b|FIXME\b)/i;
  for (const file of files) {
    if (path.relative(REPO_ROOT, file) === "test/scripts/check-source-policy.mjs") continue;
    const source = await readFile(file, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (commentPattern.test(line)) {
        fail(`${path.relative(REPO_ROOT, file)}:${index + 1} contains a blocked placeholder/FIXME comment.`);
      }
    });
  }
}

checkNoLegacyArtifacts();
await checkHtmlPolicy();
await checkComments();

if (failures.length > 0) {
  console.error("Source policy check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Source policy check passed.");
