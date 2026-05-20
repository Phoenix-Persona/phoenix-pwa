import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import * as esbuild from "esbuild";

import { REPO_ROOT, esbuildDefines } from "./env.mjs";

const mode = process.env.NODE_ENV === "development" ? "development" : "production";
const distDir = path.join(REPO_ROOT, "dist");
const assetsDir = path.join(distDir, "assets");
const metaDir = path.join(REPO_ROOT, ".tmp", "build");
const sourceHtmlPath = repoPath("public", "index.html");
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

async function buildCss() {
  const tempCss = path.join(assetsDir, "index.tmp.css");
  await run("npx", [
    "tailwindcss",
    "-i",
    "src/index.css",
    "-o",
    tempCss,
    ...(mode === "production" ? ["--minify"] : []),
  ]);
  const css = await readFile(tempCss);
  const hash = createHash("sha256").update(css).digest("hex").slice(0, 8);
  const finalName = `index-${hash}.css`;
  await rename(tempCss, path.join(assetsDir, finalName));
  return `assets/${finalName}`;
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

async function buildJs() {
  const result = await esbuild.build({
    entryPoints: [repoPath("src", "main.tsx")],
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "esnext",
    jsx: "automatic",
    outdir: assetsDir,
    entryNames: "[name]-[hash]",
    chunkNames: "chunk-[name]-[hash]",
    assetNames: "[name]-[hash]",
    sourcemap: mode !== "production",
    minify: mode === "production",
    metafile: true,
    define: await esbuildDefines({ mode }),
    plugins: [aliasPlugin()],
    logLevel: "info",
  });

  const entry = Object.entries(result.metafile.outputs).find(([, output]) =>
    output.entryPoint?.endsWith("src/main.tsx"),
  );
  if (!entry) throw new Error("Could not locate esbuild main.tsx output");
  await mkdir(metaDir, { recursive: true });
  await writeFile(path.join(metaDir, "meta.json"), JSON.stringify(result.metafile, null, 2));
  return path.relative(distDir, path.join(REPO_ROOT, entry[0]));
}

async function writeHtml({ jsPath, cssPath }) {
  const source = await readFile(sourceHtmlPath, "utf8");
  const withCss = source.includes('rel="stylesheet"')
    ? source
    : source.replace(
        "        <title>Zuka — Uncensorable Voices</title>",
        `        <link rel="stylesheet" href="/${cssPath}">\n\n        <title>Zuka — Uncensorable Voices</title>`,
      );
  const html = withCss.replace(
    /<script type="module" src="\/src\/main\.tsx"><\/script>/,
    `<script type="module" src="/${jsPath}"></script>`,
  );
  await writeFile(path.join(distDir, "index.html"), html);
  await writeFile(path.join(distDir, "404.html"), html);
}

await rm(distDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await cp(repoPath("public"), distDir, { recursive: true });

const cssPath = await buildCss();
await copyWalletWasm();
await copyFontFiles();
const jsPath = await buildJs();
await writeHtml({ jsPath, cssPath });

console.log("Project built successfully!");
