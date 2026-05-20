# ppq.ai integration smoke tests

Manual end-to-end checks that the Zuka ppq.ai primitives work against
the real `https://api.ppq.ai` service.

## Proven video model: `seedance-2-fast`

After empirical testing across Veo, Kling, and Seedance, **`seedance-2-fast`
is the only path on ppq.ai that delivers all three of:**

1. **Image-to-video conditioning** — `image_url` actually routes (Veo's
   doesn't; returns 502 "No providers available for this model").
2. **Native lip-synced audio** — character speaks aloud with synced lips
   (Kling, Runway, Luma, Pika are all silent).
3. **Character + setting continuity** across the seam from a conditioning
   frame.

This is the default in `src/hooks/usePpqVideo.ts` and `BEST_SINGLETON_PREFERENCE`
inside `test-veo-last-frame-conditioning.ts`. Promote to `seedance-2`
(non-fast) only for hero / final renders. The minimum-reproducible test
that established this is [`probe-seedance-i2v-with-speech.ts`](./probe-seedance-i2v-with-speech.ts).

Veo 3 / Veo 3 Fast i2v is filed as a bug with ppq.ai — see the bug
report we drafted; until it ships, Seedance is the only viable model
for talking-head multi-clip continuity.

## Five scripts

| Script | Purpose |
| --- | --- |
| [`test-all-ppq-services-e2e.ts`](./test-all-ppq-services-e2e.ts) | Walks every endpoint top to bottom (account → balance → Lightning topup → inference → image → video). Use this on a fresh machine. |
| [`top-up-ppq-with-lightning.ts`](./top-up-ppq-with-lightning.ts) | Single-purpose: creates a ppq.ai Lightning invoice for the USD amount you specify, prints the BOLT11, and polls until it settles. Pay from ANY wallet (Spark, Phoenix, Wallet of Satoshi, Alby). No Spark dependency, no inference, no other side effects. |
| [`probe-seedance-i2v-with-speech.ts`](./probe-seedance-i2v-with-speech.ts) | **The proven path.** Single-leg probe: submits one i2v job to `seedance-2-fast` with a hard-coded CDN image and a "say hello world" prompt. Open the result and check that you get character continuity AND lip-synced audio. This is the test that validated Seedance as the answer to the multi-clip-continuity-with-audio problem. |
| [`probe-veo-i2v-with-public-cdn.ts`](./probe-veo-i2v-with-public-cdn.ts) | Diagnostic probe used to confirm Veo 3 / Veo 3 Fast on ppq.ai genuinely doesn't accept `image_url` (it's not a hosting issue). Has a `--no-image` flag to confirm text-to-video still works on the same model. Useful for future regression checks if ppq.ai's Veo route ships. |
| [`test-veo-last-frame-conditioning.ts`](./test-veo-last-frame-conditioning.ts) | Continuity proof: generates two video clips on a singleton model that share a verbatim "locked-down world" prompt block; clip 2 is image-to-video conditioned on the LAST FRAME of clip 1. Defaults to `seedance-2-fast`. No caching — every run is a fresh end-to-end pipeline. Pre-flight balance check tells you exactly how much to top up if you're short. Requires `ffmpeg` on `$PATH`. |

## Walking every endpoint

1. **Account** — creates a fresh account if one isn't persisted, otherwise
   reuses the cached `credit_id` + `api_key`.
2. **Balance** — calls `/credits/balance`.
3. **Lightning topup** — creates a BOLT11 invoice, prints it, and polls
   `/topup/status/:id` until it settles or expires. Pay it with any
   Lightning wallet (Phoenix wallet, Wallet of Satoshi, Alby, etc.).
4. **Inference** — round-trips `chat/completions` with a "say hello world"
   prompt against `claude-sonnet-4.5` (override via `PPQ_INFERENCE_MODEL`).
5. **Image generation** — picks the first model from
   `GET /v1/models?type=image` (override via `PPQ_IMAGE_MODEL`) and
   generates a 1:1 image.
6. **Video generation** — submits an 8-second 720p job against `veo3-fast`
   (override via `PPQ_VIDEO_MODEL`) and polls until it completes (max 6 min).

Each step is gated on `(y/n)` so you can skip anything you don't want to
spend on this run.

## Run it

```bash
npx tsx test/manual/ai-services/test-all-ppq-services-e2e.ts
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--reset` | Delete the persisted account and create a fresh one |
| `--base=<url>` | Override the API base (also `PPQ_API_BASE` env) |
| `--skip-balance` | Don't fail on a balance check error |

## Persisted credentials

The api_key + credit_id are written to `test/manual/ai-services/.account.json`
with mode `0600`. **That file is gitignored.** If you reuse the same
account file across runs, your topups and balance carry over.

## Cost ballpark

- Inference (a one-line completion): well under $0.01.
- Image (one image, 1024x1024): ~$0.03–$0.10 depending on model.
- Video (Veo 3, 8s, 720p): ~$0.50–$3.

The script prints estimated cost before video generation and final cost
after image/video so you can audit spend.

## Last-frame conditioning continuity test

```bash
npx tsx test/manual/ai-services/test-veo-last-frame-conditioning.ts
```

Tests whether Veo 3.1 Fast preserves continuity across two clips when:

1. Both prompts share a **verbatim** "world block" — character + setting
   + wardrobe + lighting + camera language. The only thing that varies
   between the two prompts is what the subject says and her emotional
   register.
2. Clip 2 is **image-to-video conditioned on the last frame of clip 1**
   (the script extracts that frame via `ffmpeg`, uploads it to
   `0x0.st`, and passes the URL as `image_url` to the i2v generation).

The included world block puts a Rwandan journalist in a softly lit home
office; clip 1 is her introducing herself, clip 2 is her transitioning
to a serious topic (government corruption). Visually inspect the seam
between clips: hair, lighting, posture, wardrobe should be identical.
If the world drifts, more details need to migrate into the world block.

State (clip MP4s, extracted frame, uploaded URL, job ids) caches under
`test/manual/ai-services/.veo-last-frame/` so you can iterate on clip 2
without paying for clip 1 twice. `--reset` wipes it.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--reset` | Wipe the cache dir before starting |
| `--skip-clip1` | Use a previously generated clip 1 (must be cached) |
| `--skip-clip2` | Stop after extracting + uploading the last frame |
| `--list-models` | Print every video model ppq.ai advertises and exit (no clips submitted) |
| `--model <id>` | Singleton model used for **both** clips. Default: auto-resolve from `/v1/models?type=video` (preference: `seedance-2-fast` → `seedance-2` → `kling-3.0` → `kling-2.1-master` → `kling-2.1-pro` → `runway-gen4` → `luma-dream-machine` → `hailuo-02-pro`). `seedance-2-fast` is the only entry that delivers BOTH continuity AND lip-synced audio. Mixing families is the #1 cause of broken continuity. **Don't point this at `veo3-fast`** — ppq.ai's Veo route doesn't accept `image_url` (returns 502). |
| `--aspect <ratio>` | `9:16` (default), `16:9`, or `1:1` |
| `--duration <secs>` | Per-clip duration (default 8) |
| `--quality <p>` | `720p` (default) or `1080p` |
| `--manual-upload` | Skip the public-host upload entirely; paste a URL you host yourself |
| `--upload-host <url>` | Pin uploads to a single host (basic POST, file field `file`). Default: walk a fallback chain of public no-auth hosts (catbox.moe → uguu.se → 0x0.st). |
| `--ffmpeg <path>` | Override the ffmpeg binary path |
