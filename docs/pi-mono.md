# pi-mono

Earendil's open-source AI agent toolkit. Phoenix uses three of its packages
to run the character-creator wizard and the post-styling flow.

> Phoenix usage: PROJECT.md §6 (agent harness, tool set).
> Repo: `github.com/earendil-works/pi-mono` (the PROJECT.md §13 glossary
> entry says `/pi` — the actual repo is `/pi-mono`).

## Packages

| Package                          | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `@earendil-works/pi-ai`          | Unified multi-provider LLM API (OpenAI, Anthropic, …)     |
| `@earendil-works/pi-agent-core`  | Agent runtime: tool calling + state management            |
| `@earendil-works/pi-web-ui`      | React components for AI chat surfaces                     |
| `@earendil-works/pi-coding-agent`| CLI coding agent — not used by Phoenix                    |
| `@earendil-works/pi-tui`         | Terminal UI library — not used by Phoenix                 |

None of these are in `package.json` yet — they need to be added when the
character-creator and styling flows are built.

## How Phoenix uses each

### `pi-ai`
The LLM client for every text request. Configured to point at PPQ:

- `baseURL`: `https://api.ppq.ai`
- `apiKey`: `ppq_<token>` from the user's PPQ account
- Model is selected per-task from the persona's `model_prefs` (PROJECT.md
  §5.2, §6)

Wraps OpenAI / Anthropic / Google providers behind one interface. Because
PPQ is OpenAI-compatible, we use it through the OpenAI provider with a
custom base URL.

### `pi-agent-core`
Runs the multi-turn wizard interview loop and any other tool-calling flow.
The wizard's tool set (PROJECT.md §6):

- `propose_name(name, rationale)`
- `propose_bio(bio)`
- `propose_system_prompt(prompt)`
- `generate_profile_image(prompt)`
- `generate_voice_sample(text, voice_id)`
- `finalize_persona()`

The user can interrupt at any tool call, edit the proposal, and continue.

### `pi-web-ui`
React components for the wizard chat surface. The conversation UI, message
list, and input box are drop-in.

## API details — verify before coding

The published websites (pi.dev, the repo README) point at deeper docs that
are not directly fetchable. **Before integrating, read the package READMEs
inside the monorepo** at `github.com/earendil-works/pi-mono/tree/main/packages`
to confirm:

- Exact install commands (npm vs jsr)
- The `pi-ai` constructor signature for `baseURL` / `apiKey` override
- The `pi-agent-core` tool-definition shape
- Which `pi-web-ui` components are exported and their props

## Source

- `github.com/earendil-works/pi-mono`
- `pi.dev/docs/latest`
- PROJECT.md §6 (agent harness), §11 (file plan: `src/lib/agent.ts`,
  `src/components/CharacterCreator.tsx`)
