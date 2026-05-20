import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import * as esbuild from "esbuild";

import { REPO_ROOT, esbuildDefines } from "./env.mjs";

const distDir = path.join(REPO_ROOT, "dist");
const assetsDir = path.join(distDir, "assets");
const port = Number(process.env.PORT ?? 8080);
const sourceHtmlPath = repoPath("public", "index.html");
const cssOutputPath = path.join(assetsDir, "index.css");
const walletWasmSourcePath = repoPath(
  "node_modules",
  "@breeztech",
  "breez-sdk-spark",
  "web",
  "breez_sdk_spark_wasm_bg.wasm",
);
const walletWasmOutputPath = path.join(assetsDir, "breez_sdk_spark_wasm_bg.wasm");
const fontOutputDir = path.join(assetsDir, "files");

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
      build.onResolve({ filter: /^@nostrify\/nostrify$/ }, () => ({
        path: repoPath("src", "lib", "vendor", "nostrifyRuntime.ts"),
      }));
      build.onResolve({ filter: /@nostrify\/nostrify\/dist\/NSchema\.js$/ }, () => ({
        path: repoPath("src", "lib", "vendor", "nostrifySchemaShim.ts"),
      }));
      build.onResolve({ filter: /\/node_modules\/@nostrify\/nostrify\/dist\/NSchema\.js$/ }, () => ({
        path: repoPath("src", "lib", "vendor", "nostrifySchemaShim.ts"),
      }));
      build.onResolve({ filter: /^\.\/NSchema\.js$/ }, (args) => {
        if (!args.importer.includes(`${path.sep}@nostrify${path.sep}nostrify${path.sep}dist${path.sep}`)) {
          return undefined;
        }
        return { path: repoPath("src", "lib", "vendor", "nostrifySchemaShim.ts") };
      });
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function buildCssOnce() {
  await run("npx", [
    "tailwindcss",
    "-i",
    "src/index.css",
    "-o",
    cssOutputPath,
  ]);
}

async function copyWalletWasm() {
  await cp(walletWasmSourcePath, walletWasmOutputPath);
}

async function copyFontFiles() {
  await mkdir(fontOutputDir, { recursive: true });
  for (const family of ["fraunces", "inter"]) {
    const sourceDir = repoPath("node_modules", "@fontsource-variable", family, "files");
    for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".woff2")) {
        await cp(path.join(sourceDir, entry.name), path.join(fontOutputDir, entry.name));
      }
    }
  }
}

async function writeDevHtml() {
  const source = await readFile(sourceHtmlPath, "utf8");
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

async function collectCssWatchFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".tmp" || entry.name === "dist") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectCssWatchFiles(full));
    } else if (/\.(css|html|js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function cssWatchFiles() {
  return [
    sourceHtmlPath,
    ...await collectCssWatchFiles(repoPath("src")),
  ];
}

function cssWatchSignature(files) {
  return files
    .map((file) => {
      if (!existsSync(file)) return `${file}:missing`;
      const stat = statSync(file);
      return `${file}:${stat.mtimeMs}:${stat.size}`;
    })
    .join("\n");
}

async function startCssPoller() {
  let files = await cssWatchFiles();
  let signature = cssWatchSignature(files);
  let rebuilding = false;
  let lastFileRefresh = Date.now();
  const timer = setInterval(() => {
    void (async () => {
      if (rebuilding) return;
      if (Date.now() - lastFileRefresh > 10_000) {
        files = await cssWatchFiles();
        lastFileRefresh = Date.now();
      }
      const nextSignature = cssWatchSignature(files);
      if (nextSignature === signature) return;

      rebuilding = true;
      try {
        await buildCssOnce();
        files = await cssWatchFiles();
        signature = nextSignature;
        lastFileRefresh = Date.now();
        console.log("[tailwind] rebuilt dist/assets/index.css");
      } catch (error) {
        console.error("[tailwind] rebuild failed:", error);
      } finally {
        rebuilding = false;
      }
    })();
  }, 1_000);

  return {
    kill() {
      clearInterval(timer);
    },
  };
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

  server.listen(port, "::", () => {
    console.log(`Dev server listening on http://localhost:${port}`);
  });
  return server;
}

await rm(distDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await cp(repoPath("public"), distDir, { recursive: true });
await copyWalletWasm();
await copyFontFiles();
await buildCssOnce();
await writeDevHtml();

const ctx = await esbuild.context({
  entryPoints: [repoPath("src", "main.tsx")],
  outfile: path.join(assetsDir, "main.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "esnext",
  jsx: "automatic",
  sourcemap: true,
  define: await esbuildDefines({ mode: "development" }),
  plugins: [aliasPlugin()],
  logLevel: "info",
});
await ctx.rebuild();
await ctx.watch();

const tailwind = await startCssPoller();
const server = serve();

function shutdown() {
  tailwind.kill();
  server.close();
  void ctx.dispose();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
