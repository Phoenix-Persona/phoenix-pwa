import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import * as esbuild from "esbuild";

import { REPO_ROOT, esbuildDefines } from "../../scripts/env.mjs";

const mode = process.argv.includes("--integration") ? "integration" : "unit";
const selectedFiles = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .map((arg) => path.resolve(REPO_ROOT, arg));
const outDir = path.join(REPO_ROOT, ".tmp", `node-test-${mode}`);
const unitRoots = ["src"];
const integrationRoots = ["test/integration"];
const testFilePattern = /\.(test|integration\.test)\.(ts|tsx)$/;

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

async function listFiles(root) {
  const absRoot = repoPath(root);
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (testFilePattern.test(entry.name)) {
        out.push(full);
      }
    }
  }
  await walk(absRoot);
  return out;
}

function resolveMockSpecifier(specifier, importer) {
  if (specifier.startsWith("@/test")) {
    return resolveLocalModule(repoPath("test", "node", specifier.replace(/^@\/test\/?/, "")));
  }
  if (specifier.startsWith("@/")) {
    return resolveLocalModule(repoPath("src", specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return resolveLocalModule(path.resolve(path.dirname(importer), specifier));
  }
  return specifier;
}

function findModuleMocks(source, importer) {
  const mocks = new Map();
  let cursor = 0;
  while (true) {
    const start = source.indexOf("mockModule(", cursor);
    if (start === -1) break;
    const quoteIndex = source.slice(start).search(/["']/);
    if (quoteIndex === -1) break;
    const quotePos = start + quoteIndex;
    const quote = source[quotePos];
    const endQuote = source.indexOf(quote, quotePos + 1);
    if (endQuote === -1) break;
    const specifier = source.slice(quotePos + 1, endQuote);

    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === "(") depth += 1;
      if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }

    const block = source.slice(start, end);
    const exportNames = new Set();
    for (const match of block.matchAll(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g)) {
      const name = match[1];
      if (name !== "default") exportNames.add(name);
    }
    const id = resolveMockSpecifier(specifier, importer);
    mocks.set(id, {
      original: specifier,
      id,
      exportNames,
      passthrough: block.includes("...actual"),
    });
    cursor = end;
  }
  return mocks;
}

function rewriteMockSpecifiers(source, importer, mockMap) {
  let out = source;
  for (const mock of mockMap.values()) {
    const escaped = mock.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`mockModule\\((["'])${escaped}\\1`, "g"),
      `mockModule("${mock.id}"`,
    );
  }
  return out;
}

function testPlugin({ entry, mockMap }) {
  return {
    name: "zuka-node-test",
    setup(build) {
      build.onResolve({ filter: /^@\/test(\/.*)?$/ }, (args) => ({
        path: resolveLocalModule(
          repoPath("test", "node", args.path.replace(/^@\/test\/?/, "")),
        ),
      }));
      build.onResolve({ filter: /^@\// }, (args) => {
        const resolved = resolveLocalModule(repoPath("src", args.path.slice(2)));
        const mock = mockMap.get(resolved);
        if (mock) return { path: mock.id, namespace: "zuka-mock" };
        return { path: resolved };
      });
      build.onResolve({ filter: /^\./ }, (args) => {
        const resolved = resolveLocalModule(path.resolve(args.resolveDir, args.path));
        const mock = mockMap.get(resolved);
        if (mock) return { path: mock.id, namespace: "zuka-mock" };
        return { path: resolved };
      });
      build.onResolve({ filter: /^\// }, (args) => {
        if (args.path.endsWith("?original")) {
          return { path: args.path.replace(/\?original$/, "") };
        }
        return { path: resolveLocalModule(args.path) };
      });
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.namespace === "zuka-original") {
          return { path: args.path };
        }
        const mock = mockMap.get(args.path);
        if (mock) return { path: mock.id, namespace: "zuka-mock" };
        return undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "zuka-mock" }, (args) => {
        const mock = mockMap.get(args.path);
        if (!mock) throw new Error(`Unknown mock module ${args.path}`);
        const extraExports = mock.id.endsWith(path.join("src", "hooks", "usePpqInference.ts"))
          ? `export const DEFAULT_INFERENCE_MODEL = "claude-sonnet-4.5";
export function getInferenceText(res) {
  return res?.choices?.[0]?.message?.content ?? "";
}`
          : mock.id.endsWith(path.join("src", "lib", "wallet", "lightningAddress.ts"))
            ? `export const SPARK_LN_DOMAIN = "breez.tips";
export class LightningUsernameTakenError extends Error {
  constructor(username) {
    super("Username " + username + " is taken - pick another.");
    this.name = "LightningUsernameTakenError";
    this.username = username;
  }
}
export function slugifyForUsername(input) {
  return String(input).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}
export function isValidLightningUsername(value) {
  return /^[a-z0-9][a-z0-9-]{0,29}$/.test(String(value));
}`
          : "";
        const exports = Array.from(mock.exportNames)
          .map(
            (name) => `export function ${name}(...args) {
  const value = getMockedExport(${JSON.stringify(mock.id)}, ${JSON.stringify(name)});
  if (typeof value !== "function") return value;
  if (new.target) return Reflect.construct(value, args);
  return value(...args);
}`,
          )
          .join("\n");
        return {
          loader: "js",
          contents: `const actual = {};
import { getMockedExport } from ${JSON.stringify(repoPath("test", "node", "mockRegistry.ts"))};
${extraExports}
${exports}
`,
        };
      });
      build.onLoad({ filter: /.*/ }, async (args) => {
        if (args.path !== entry) return undefined;
        const source = await readFile(args.path, "utf8");
        const contents = rewriteMockSpecifiers(source, args.path, mockMap);
        return {
          loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
          contents,
        };
      });
    },
  };
}

function runNodeTest(files, setupFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        setupFile,
        "--test",
        "--test-concurrency=1",
        "--test-timeout=10000",
        "--test-force-exit",
        ...files,
      ],
      {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "test" },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node --test exited with ${code}`));
    });
  });
}

const roots = mode === "integration" ? integrationRoots : unitRoots;
const files =
  selectedFiles.length > 0
    ? selectedFiles
    : (await Promise.all(roots.map(listFiles))).flat();

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const setupFile = path.join(outDir, "setup.mjs");
await esbuild.build({
  entryPoints: [repoPath("test", "node", "setup.ts")],
  outfile: setupFile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  jsx: "automatic",
  define: await esbuildDefines({ mode: "development" }),
  logLevel: "silent",
});

const builtFiles = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  const mockMap = findModuleMocks(source, file);
  const rel = path.relative(REPO_ROOT, file).replace(/[\\/]/g, "__");
  const outfile = path.join(outDir, `${rel}.mjs`);
  await esbuild.build({
    entryPoints: [file],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    packages: "external",
    jsx: "automatic",
    define: await esbuildDefines({ mode: "development" }),
    banner: {
      js: 'import { createRequire as __zukaCreateRequire } from "node:module"; const require = __zukaCreateRequire(import.meta.url);',
    },
    plugins: [testPlugin({ entry: file, mockMap })],
    logLevel: "silent",
  });
  builtFiles.push(outfile);
}

await writeFile(path.join(outDir, "files.json"), JSON.stringify(builtFiles, null, 2));
await runNodeTest(builtFiles, setupFile);
