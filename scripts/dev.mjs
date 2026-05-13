import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import * as esbuild from "esbuild";

import { REPO_ROOT, esbuildDefines } from "./env.mjs";

const distDir = path.join(REPO_ROOT, "dist");
const assetsDir = path.join(distDir, "assets");
const port = Number(process.env.PORT ?? 8080);

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

function resolveLocalModule(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
    path.join(basePath, "index.jsx"),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (statSync(candidate).isFile()) return candidate;
  }
  return basePath;
}

function aliasPlugin() {
  return {
    name: "zuka-alias",
    setup(build) {
      build.onResolve({ filter: /^@\/test(\/.*)?$/ }, (args) => ({
        path: resolveLocalModule(
          repoPath("test", "node", args.path.replace(/^@\/test\/?/, "")),
        ),
      }));
      build.onResolve({ filter: /^@\// }, (args) => ({
        path: resolveLocalModule(repoPath("src", args.path.slice(2))),
      }));
    },
  };
}

async function writeDevHtml() {
  const source = await readFile(repoPath("index.html"), "utf8");
  const withCss = source.replace(
    "        <title>Zuka — Uncensorable Voices</title>",
    `        <link rel="stylesheet" href="/assets/index.css">\n\n        <title>Zuka — Uncensorable Voices</title>`,
  );
  const html = withCss.replace(
    /<script type="module" src="\/src\/main\.tsx"><\/script>/,
    '<script type="module" src="/assets/main.js"></script>',
  );
  await writeFile(path.join(distDir, "index.html"), html);
}

function startTailwind() {
  return spawn(
    "npx",
    ["tailwindcss", "-i", "src/index.css", "-o", "dist/assets/index.css", "--watch"],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
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
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const decodedPath = decodeURIComponent(url.pathname);
    const requested = decodedPath === "/" ? "/index.html" : decodedPath;
    let filePath = path.join(distDir, requested);
    if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
      filePath = path.join(distDir, "index.html");
    }

    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Content-Type", contentType(filePath));
    createReadStream(filePath).pipe(res);
  });

  server.listen(port, "::", () => {
    console.log(`Dev server listening on http://localhost:${port}`);
  });
  return server;
}

await rm(distDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await cp(repoPath("public"), distDir, { recursive: true });
await writeDevHtml();

const ctx = await esbuild.context({
  entryPoints: [repoPath("src", "main.tsx")],
  outfile: path.join(assetsDir, "main.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "esnext",
  sourcemap: true,
  define: await esbuildDefines({ mode: "development" }),
  plugins: [aliasPlugin()],
  logLevel: "info",
});
await ctx.watch();

const tailwind = startTailwind();
const server = serve();

function shutdown() {
  tailwind.kill();
  server.close();
  void ctx.dispose();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
