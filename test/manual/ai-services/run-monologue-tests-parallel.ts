/**
 * Parallel runner for the two monologue test scripts:
 *
 *   1. test/manual/ai-services/test-i2v-chain-rwandan-english-paced.ts
 *   2. test/manual/ai-services/test-i2v-clip-rwandan-kinyarwanda.ts
 *
 * Spawns both as child processes with `--yes` (so neither one prompts
 * for confirmation), tees their stdout/stderr to per-script log files
 * AND to this process's stdout with `[english]` / `[kinyarwanda]`
 * prefixes, and waits for both to finish.
 *
 * Why parallel: each child waits ~1-3 minutes per Seedance clip; the
 * two tests share no state, so running them serially wastes wall-time.
 * The English chain submits 4 clips (~6-10 min total), the Kinyarwanda
 * test submits 1 clip (~1-3 min). Running in parallel cuts the total
 * wall-time roughly in half.
 *
 * Both children write logs to .monologue-runs/<timestamp>/ so you can
 * tail them separately or audit after the fact.
 *
 * Run:
 *   npx tsx test/manual/ai-services/run-monologue-tests-parallel.ts
 *   npx tsx test/manual/ai-services/run-monologue-tests-parallel.ts --only english
 *   npx tsx test/manual/ai-services/run-monologue-tests-parallel.ts --only kinyarwanda
 *
 * Flags:
 *   --only <name>     Run just one of: "english" | "kinyarwanda".
 *   --log-dir <path>  Override log directory (default
 *                     test/manual/ai-services/.monologue-runs/<timestamp>).
 */

import "../_shared/loadEnv";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ---------- arg parsing ---------- */

const argv = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

const flags = {
  only: flagValue("only"),
  logDir: flagValue("log-dir"),
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ---------- jobs ---------- */

interface Job {
  name: string;
  script: string;
  prefix: string;
  prefixColor: string;
}

const RESET = "\x1b[0m";

const ALL_JOBS: Job[] = [
  {
    name: "english",
    script: path.join(SCRIPT_DIR, "test-i2v-chain-rwandan-english-paced.ts"),
    prefix: "[english]    ",
    prefixColor: "\x1b[36m", // cyan
  },
  {
    name: "kinyarwanda",
    script: path.join(SCRIPT_DIR, "test-i2v-clip-rwandan-kinyarwanda.ts"),
    prefix: "[kinyarwanda]",
    prefixColor: "\x1b[35m", // magenta
  },
];

/* ---------- runner ---------- */

interface JobResult {
  name: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  logPath: string;
  scriptPath: string;
}

async function runJob(job: Job, logDir: string): Promise<JobResult> {
  const logPath = path.join(logDir, `${job.name}.log`);
  const logStream = createWriteStream(logPath, { flags: "w" });
  const start = Date.now();

  return new Promise<JobResult>((resolve) => {
    const child = spawn("npx", ["tsx", job.script, "--yes"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const writePrefixed = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      logStream.write(text);
      // Prefix each line for the merged terminal view.
      for (const line of text.split("\n")) {
        if (line === "") continue;
        process.stdout.write(
          `${job.prefixColor}${job.prefix}${RESET} ${line}\n`,
        );
      }
    };

    child.stdout.on("data", writePrefixed);
    child.stderr.on("data", writePrefixed);
    child.on("error", (err) => {
      writePrefixed(`[runner] spawn error: ${err.message}\n`);
    });
    child.on("close", (code, signal) => {
      logStream.end();
      resolve({
        name: job.name,
        exitCode: code,
        signal,
        durationMs: Date.now() - start,
        logPath,
        scriptPath: job.script,
      });
    });
  });
}

function fmtDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}m${secs}s`;
}

async function main(): Promise<void> {
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const logDir =
    flags.logDir ?? path.join(SCRIPT_DIR, ".monologue-runs", ts);
  await fs.mkdir(logDir, { recursive: true });

  const jobs = flags.only
    ? ALL_JOBS.filter((j) => j.name === flags.only)
    : ALL_JOBS;

  if (jobs.length === 0) {
    throw new Error(
      `--only ${flags.only}: no matching job. Valid: ${ALL_JOBS.map((j) => j.name).join(", ")}`,
    );
  }

  console.log("Zuka monologue tests — parallel runner");
  console.log(`  jobs:    ${jobs.map((j) => j.name).join(", ")}`);
  console.log(`  log dir: ${logDir}`);
  console.log(
    `  Both children run with --yes (no interactive prompts). ` +
      `Each balance check still applies inside the child.`,
  );
  console.log("");

  const results = await Promise.all(jobs.map((j) => runJob(j, logDir)));

  console.log("\n────── parallel runner — summary ──────");
  let anyFailed = false;
  for (const r of results) {
    const status =
      r.exitCode === 0
        ? "\x1b[32m✓ ok\x1b[0m"
        : `\x1b[31m✗ exit ${r.exitCode ?? "?"}${r.signal ? ` (signal ${r.signal})` : ""}\x1b[0m`;
    if (r.exitCode !== 0) anyFailed = true;
    console.log(
      `  ${r.name.padEnd(13)} ${status}   ${fmtDuration(r.durationMs)}   log: ${r.logPath}`,
    );
  }

  if (anyFailed) {
    console.log(
      `\nAt least one job failed. Tail the log files above for the full trace.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`\nBoth jobs completed.`);
  }
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
