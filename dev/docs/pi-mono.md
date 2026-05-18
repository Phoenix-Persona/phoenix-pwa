# pi-mono

Earendil's open-source AI agent toolkit. This is a reference note for future
agent-driven persona creation work. The current Zuka runtime does **not**
depend on `pi-ai`, `pi-agent-core`, or `pi-web-ui`; verify `package.json`
before treating this as implementation guidance.

> Repo: `github.com/earendil-works/pi` (formerly `pi-mono`; both URLs redirect
> to the same place). Packages use the `@earendil-works/` scope.

## Packages

| Package | Purpose |
| --- | --- |
| `@earendil-works/pi-ai` | Unified multi-provider LLM API. |
| `@earendil-works/pi-agent-core` | Stateful agent loop, tool execution, and event streaming. |
| `@earendil-works/pi-web-ui` | Mini-lit chat UI web components. |

Install only when implementing the deferred agent-driven wizard:

```sh
npm install @earendil-works/pi-ai @earendil-works/pi-agent-core @earendil-works/pi-web-ui
```

## Potential Zuka Use

The likely future shape is:

- `pi-agent-core` drives a persona interview.
- A small React UI renders agent events rather than adopting the heavier
  `pi-web-ui` panel wholesale.
- Tools propose persona name, bio, system prompt, profile image prompt, and
  finalization.
- PPQ remains the inference backend through its OpenAI-compatible API.

Current release flows use direct PPQ clients instead:

- `src/hooks/usePpqInference.ts`
- `src/hooks/usePpqImage.ts`
- `src/hooks/useGenerateVideoPipeline.ts`
- `src/lib/ppq/client.ts`

## Source

- `github.com/earendil-works/pi`
- Per-package READMEs under `/packages/{ai,agent,web-ui}/README.md`
- `docs/PRODUCT.md` and `docs/SCOPE.md` for current vs. deferred scope
