# ppq.ai integration smoke test

Manual end-to-end check that the Phoenix ppq.ai primitives work against the
real `https://api.ppq.ai` service. Walks every service goal one at a time:

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
6. **Video generation** — finds the first `veo3*` model from
   `GET /v1/models?type=video` (override via `PPQ_VIDEO_MODEL`), submits an
   8-second 720p job, and polls until it completes (max 6 min).

Each step is gated on `(y/n)` so you can skip anything you don't want to
spend on this run.

## Run it

```bash
npx tsx tests/ai-services/run.ts
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
