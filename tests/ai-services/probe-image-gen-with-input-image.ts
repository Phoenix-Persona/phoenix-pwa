/**
 * Probe ppq.ai image-generation models for image-to-image support.
 *
 * The Dashboard's preview-image step (`useGenerateVideoPipeline.ts`)
 * defaults to `gpt-image-1` and passes the persona's avatar as
 * `image_url`. ppq.ai's `gpt-image-1` route returns 502
 * "No providers available for this model" — same provider_error shape
 * as Veo's broken i2v route. This probe finds an image model that
 * actually accepts `image_url` and produces a result.
 *
 * What it does:
 *   1. GET /v1/models?type=image — print the catalog.
 *   2. Cascade through a curated preference list (each entry crossed
 *      against the live catalog), submitting a tiny i2i generation
 *      with the same hard-coded DO Spaces seed image used elsewhere.
 *   3. Stop at the first model that returns a successful response.
 *      Print the model id + result URL + cost.
 *
 * Each successful gen costs ~$0.05-0.20. Cascade-through-failures
 * can cost ~$1-2 worst case.
 *
 * Run:
 *   npx tsx tests/ai-services/probe-image-gen-with-input-image.ts
 *
 * Flags:
 *   --model <id>          Test exactly ONE model (skips the cascade).
 *                         Use this when you already know which id you
 *                         want to verify.
 *   --image-url <url>     Conditioning image. Defaults to the same
 *                         DO Spaces portrait the video probes use.
 *   --prompt <text>       Override the prompt.
 *   --size <ratio>        Default "9:16".
 *   --models <csv>        Comma-separated model id list to override
 *                         the curated cascade order (use --model for
 *                         a single id).
 *   --list-only           Print the catalog and exit (no generations).
 */

import "../_shared/loadEnv";

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateImage,
  listModels,
} from "../../src/lib/ppq/client";
import type { PpqError } from "../../src/lib/ppq/types";

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

const DEFAULT_IMAGE_URL =
  "https://cascdr-chads-stay-winning.nyc3.cdn.digitaloceanspaces.com/last-frame.png";

const DEFAULT_PROMPT =
  "A photorealistic 9:16 portrait of the person in the input image, " +
  "standing atop a hill with their back to a large african city " +
  "to the left. Medium close-up, eye-level camera. Cinematic, shallow " +
  "depth of field. Keep the same face, hair, and skin tone as the input.";

const flags = {
  imageUrl: flagValue("image-url") ?? DEFAULT_IMAGE_URL,
  prompt: flagValue("prompt") ?? DEFAULT_PROMPT,
  size: flagValue("size") ?? "9:16",
  model: flagValue("model"),
  models: flagValue("models"),
  listOnly: argv.includes("--list-only"),
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PPQ_ACCOUNT_PATH = path.join(SCRIPT_DIR, ".account.json");

/* ---------- ppq account ---------- */

interface PpqAccountFile {
  credit_id: string;
  api_key: string;
}

async function loadPpqAccount(): Promise<PpqAccountFile> {
  // Env wins (free-credits path).
  const envKey = process.env.VITE_PPQ_API_KEY ?? process.env.PPQ_API_KEY;
  if (envKey && envKey.length > 0) {
    return { api_key: envKey, credit_id: process.env.PPQ_CREDIT_ID ?? "" };
  }
  try {
    const raw = await fs.readFile(PPQ_ACCOUNT_PATH, "utf8");
    const parsed = JSON.parse(raw) as PpqAccountFile;
    if (parsed?.api_key && parsed?.credit_id) return parsed;
  } catch {
    /* fall through */
  }
  throw new Error(
    "No ppq.ai credentials found. Set VITE_PPQ_API_KEY in .env or " +
      "run tests/ai-services/test-all-ppq-services-e2e.ts once.",
  );
}

/* ---------- curated cascade ---------- */

/**
 * Image models on ppq.ai most likely to accept `image_url` for
 * image-conditioned generation. Ordered by predicted likelihood +
 * historical support for img2img / edit-style inputs:
 *
 *   1. nano-banana — Google Gemini 2.5 Flash Image, explicit
 *      image-edit / composition model. Strongest candidate.
 *   2. flux-kontext-* — Black Forest Labs' Kontext family is
 *      designed for in-context editing.
 *   3. flux-pro / flux-schnell / flux-dev — base FLUX, some configs
 *      accept image input via SDK; ppq.ai may proxy that.
 *   4. seedream-* — ByteDance Seedream image siblings to Seedance.
 *   5. imagen-3 / imagen-4 — Google Imagen, may accept reference.
 *   6. ideogram-* / recraft-* — both have edit modes upstream.
 *   7. gpt-image-1 — listed last because the user already saw it
 *      502 with image_url, but kept for confirmation.
 */
const CURATED_PREFERENCE = [
  "nano-banana",
  "gemini-2.5-flash-image",
  "flux-kontext-pro",
  "flux-kontext-max",
  "flux-1.1-pro",
  "flux-pro",
  "flux-dev",
  "flux-schnell",
  "seedream-3",
  "seedream-2",
  "imagen-4",
  "imagen-3",
  "ideogram-v3",
  "ideogram-v2",
  "recraft-v3",
  "gpt-image-1",
];

function buildCascade(catalog: string[], userOverride?: string): string[] {
  // --model wins over everything: try exactly that id, no cascade.
  if (flags.model) {
    return [flags.model];
  }
  if (userOverride) {
    return userOverride
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // 1. Exact-match curated entries that exist in the catalog.
  const exact = CURATED_PREFERENCE.filter((id) => catalog.includes(id));
  // 2. Fuzzy fallback: anything in the catalog whose id suggests
  //    image-edit / kontext / nano-banana / gemini-image support.
  const fuzzy = catalog
    .filter((id) => !exact.includes(id))
    .filter((id) =>
      /(kontext|nano-banana|gemini.*image|edit|img2img|reference)/i.test(id),
    );
  return [...exact, ...fuzzy];
}

/* ---------- main ---------- */

interface AttemptResult {
  model: string;
  ok: boolean;
  url?: string;
  costUsd?: number;
  errorMessage?: string;
  errorStatus?: number;
}

async function tryModel(
  apiKey: string,
  model: string,
): Promise<AttemptResult> {
  try {
    const res = await generateImage(apiKey, {
      model,
      prompt: flags.prompt,
      image_url: flags.imageUrl,
      size: flags.size,
      n: 1,
      output_format: "png",
    });
    const url = res.data?.[0]?.url;
    if (!url) {
      return {
        model,
        ok: false,
        errorMessage: "Response had no data[0].url",
      };
    }
    return { model, ok: true, url, costUsd: res.cost };
  } catch (err) {
    const e = err as PpqError | Error;
    const ppqErr = e as PpqError;
    return {
      model,
      ok: false,
      errorMessage: e.message,
      errorStatus: typeof ppqErr.status === "number" ? ppqErr.status : undefined,
    };
  }
}

async function main(): Promise<void> {
  console.log("ppq.ai image-gen probe (image-to-image support)");
  console.log("");
  console.log(`  conditioning image: ${flags.imageUrl}`);
  console.log(`  size:               ${flags.size}`);
  console.log(`  prompt:`);
  for (const line of flags.prompt.split("\n")) {
    console.log(`    | ${line}`);
  }
  console.log("");

  const ppq = await loadPpqAccount();

  // 1. List the catalog.
  const models = await listModels("image");
  const ids = models.map((m) => m.id).sort();
  console.log(`  ${ids.length} image models advertised:`);
  for (const id of ids) console.log(`    - ${id}`);

  if (flags.listOnly) {
    console.log("\n--list-only specified, exiting.");
    return;
  }

  // 2. Build the cascade.
  const cascade = buildCascade(ids, flags.models);
  if (cascade.length === 0) {
    throw new Error(
      "No models to try. Either ppq.ai's image catalog has nothing " +
        "matching our preference list, or --models was empty. Use " +
        "--list-only to inspect, then pass --models <id> explicitly.",
    );
  }
  console.log(
    `\n  cascade order (${cascade.length}): ${cascade.join(" → ")}`,
  );

  // 3. Try each in order.
  const failures: AttemptResult[] = [];
  for (let i = 0; i < cascade.length; i++) {
    const model = cascade[i];
    process.stdout.write(`\n  ──── attempt ${i + 1}/${cascade.length}: ${model} ────\n`);
    const result = await tryModel(ppq.api_key, model);
    if (result.ok) {
      console.log(`  ✓ ${model} accepted image_url + produced output`);
      console.log(`  ✓ url:   ${result.url}`);
      if (result.costUsd !== undefined) {
        console.log(`  ✓ cost:  $${result.costUsd.toFixed(4)}`);
      }
      console.log("");
      console.log(
        "Open the URL — does the face look like the input's? If yes,",
      );
      console.log(
        `you've got the image-edit primitive. Wire \`${model}\` into`,
      );
      console.log(
        "src/hooks/useGenerateVideoPipeline.ts (search for `gpt-image-1`).",
      );
      if (failures.length > 0) {
        console.log(
          `\n  (skipped: ${failures.map((f) => f.model).join(", ")})`,
        );
      }
      return;
    }

    const status = result.errorStatus ? ` [${result.errorStatus}]` : "";
    const trimmed = (result.errorMessage ?? "").slice(0, 220);
    console.warn(`  ✗ ${model}${status}: ${trimmed}`);
    failures.push(result);
  }

  console.error("\nAll candidates failed. Summary:");
  for (const f of failures) {
    const status = f.errorStatus ? `[${f.errorStatus}] ` : "";
    console.error(`  - ${f.model}: ${status}${f.errorMessage}`);
  }
  console.error(
    "\nNo image model on ppq.ai currently accepts image_url for our " +
      "request shape. Options:\n" +
      "  • Drop image-conditioning from the preview step (text-only,\n" +
      "    accept some character drift in the seed frame).\n" +
      "  • Skip the gpt-image-1 preview entirely and use the persona's\n" +
      "    avatar directly as the chain's seed grounding URL.\n" +
      "  • File a ppq.ai bug for image-edit support, mirroring the\n" +
      "    Veo i2v bug report.",
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("\n[FATAL]", err instanceof Error ? err.message : err);
  if (err && typeof err === "object" && "status" in err) {
    console.error("status:", (err as { status: unknown }).status);
  }
  if (err && typeof err === "object" && "body" in err) {
    console.error(
      "body:",
      JSON.stringify((err as { body: unknown }).body, null, 2),
    );
  }
  process.exitCode = 1;
});
