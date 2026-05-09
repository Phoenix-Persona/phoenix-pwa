# ppq.ai integration smoke tests

Manual end-to-end checks that the Phoenix ppq.ai primitives work against
the real `https://api.ppq.ai` service.

## Two scripts

| Script | Purpose |
| --- | --- |
| [`test-all-ppq-services-e2e.ts`](./test-all-ppq-services-e2e.ts) | Walks every endpoint top to bottom (account → balance → Lightning topup → inference → image → video). Use this on a fresh machine. |
| [`test-veo-last-frame-conditioning.ts`](./test-veo-last-frame-conditioning.ts) | Continuity proof: generates two Veo 3.1 Fast clips that share a verbatim "locked-down world" prompt block; clip 2 is image-to-video conditioned on the LAST FRAME of clip 1. Visually inspect the seam to confirm hair / lighting / posture / wardrobe hold across the join. Requires `ffmpeg` on `$PATH`. |

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
npx tsx tests/ai-services/test-all-ppq-services-e2e.ts
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--reset` | Delete the persisted account and create a fresh one |
| `--base=<url>` | Override the API base (also `PPQ_API_BASE` env) |
| `--skip-balance` | Don't fail on a balance check error |

## Persisted credentials

The api_key + credit_id are written to `tests/ai-services/.account.json`
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
npx tsx tests/ai-services/test-veo-last-frame-conditioning.ts
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
`tests/ai-services/.veo-last-frame/` so you can iterate on clip 2
without paying for clip 1 twice. `--reset` wipes it.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--reset` | Wipe the cache dir before starting |
| `--skip-clip1` | Use a previously generated clip 1 (must be cached) |
| `--skip-clip2` | Stop after extracting + uploading the last frame |
| `--text-model <id>` | Clip 1 model (default `veo3.1-fast`) |
| `--i2v-model <id>` | Clip 2 model (default `veo3.1-fast-i2v`) |
| `--aspect <ratio>` | `9:16` (default), `16:9`, or `1:1` |
| `--duration <secs>` | Per-clip duration (default 8) |
| `--quality <p>` | `720p` (default) or `1080p` |
| `--manual-upload` | Skip 0x0.st upload; paste your own URL |
| `--upload-host <url>` | Override the upload host |
| `--ffmpeg <path>` | Override the ffmpeg binary path |
