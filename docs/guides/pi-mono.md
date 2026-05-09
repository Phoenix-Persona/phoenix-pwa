# pi-mono

Earendil's open-source AI agent toolkit. Phoenix uses three of its packages
to run the character-creator wizard and the post-styling flow.

> Repo: `github.com/earendil-works/pi` (formerly `pi-mono`; both URLs
> redirect to the same place). The packages keep the `@earendil-works/`
> scope. Source: PROJECT.md §6 (agent harness), §11 (file plan).

## Packages

| Package                          | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `@earendil-works/pi-ai`          | Unified multi-provider LLM API                            |
| `@earendil-works/pi-agent-core`  | Stateful agent: tool execution + event streaming          |
| `@earendil-works/pi-web-ui`      | React-ish chat UI components (mini-lit web components)    |
| `@earendil-works/pi-coding-agent`| CLI coding agent — not used by Phoenix                    |
| `@earendil-works/pi-tui`         | Terminal UI library — not used by Phoenix                 |

None are in `package.json` yet. Install with:

```sh
npm install @earendil-works/pi-ai @earendil-works/pi-agent-core @earendil-works/pi-web-ui
```

## `pi-ai` — LLM client

OpenAI-compatible providers and many natively-typed providers. **For
Phoenix, point it at PPQ via the OpenAI-compatible surface.**

### Two API styles

```typescript
import { Type, getModel, stream, complete, type Context, type Tool } from '@earendil-works/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');

const context: Context = {
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello.' }],
  tools: [],
};

// Non-streaming
const response = await complete(model, context);

// Streaming
const s = stream(model, context);
for await (const event of s) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
}
const finalMessage = await s.result();
```

### Pointing at PPQ

PPQ is OpenAI-compatible (see `docs/guides/ppq.md`). Use the OpenAI provider with
a custom base URL — the README's "Custom Models" / "OpenAI Compatibility
Settings" section is authoritative; verify the exact override key
(`baseURL`) before coding.

```typescript
const model = getModel('openai', 'claude-sonnet-4.5'); // model name as exposed by PPQ
// Pass baseURL: 'https://api.ppq.ai' and apiKey: 'ppq_<token>' through
// the per-call options or via custom-model registration.
```

### Defining tools (TypeBox)

```typescript
import { Type, type Tool } from '@earendil-works/pi-ai';

const proposeName: Tool = {
  name: 'propose_name',
  description: 'Suggest a name for the persona',
  parameters: Type.Object({
    name: Type.String(),
    rationale: Type.String(),
  }),
};
```

The wizard's full tool set is in PROJECT.md §6.

### Image generation

Image generation has a separate API surface (`getImageModel`,
`generateImages`). Don't use `stream()`/`complete()` for it. PPQ exposes
`gpt-image-1` for the profile + post images (PROJECT.md §6).

## `pi-agent-core` — agent runtime

Built on `pi-ai`. Manages the agent loop, tool execution, and event
streaming. Phoenix's character-creator runs on this.

```typescript
import { Agent } from '@earendil-works/pi-agent-core';
import { getModel } from '@earendil-works/pi-ai';

const agent = new Agent({
  initialState: {
    systemPrompt: 'You are the Phoenix character-creator agent.',
    model: getModel('anthropic', 'claude-sonnet-4.5-20250929'),
    thinkingLevel: 'off',
    messages: [],
    tools: [proposeName, /* ... */],
  },
});

agent.subscribe((event) => {
  if (event.type === 'message_update' &&
      event.assistantMessageEvent.type === 'text_delta') {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt('Start the persona interview.');
```

### Key event types

| Event                  | When                                   |
| ---------------------- | -------------------------------------- |
| `agent_start`          | Run begins                             |
| `turn_start` / `turn_end` | One LLM call + its tool batch       |
| `message_start` / `message_update` / `message_end` | Per message |
| `tool_execution_start` / `tool_execution_update` / `tool_execution_end` | Per tool call |
| `agent_end`            | Run fully settles (awaited subscribers count) |

### Steering and follow-up

`agent.steer(msg)` interrupts mid-tool-batch (after current turn).
`agent.followUp(msg)` queues a message after the agent would otherwise stop.
Phoenix uses these to let users edit a wizard proposal before continuing.

### Defining tools

`AgentTool` extends pi-ai `Tool` with an `execute` function:

```typescript
import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';

const generateProfileImage: AgentTool = {
  name: 'generate_profile_image',
  label: 'Generate profile image', // shown in UI
  description: 'Render the persona\'s canonical profile image',
  parameters: Type.Object({ prompt: Type.String() }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const url = await generateImageViaPPQ(params.prompt, signal);
    return { content: [{ type: 'text', text: url }], details: { url } };
  },
};
```

Throw inside `execute` to report a tool error; don't return error text as
content.

### Low-level loop

For non-`Agent`-class flows (e.g. server-side streaming), `agentLoop` and
`agentLoopContinue` are exported.

## `pi-web-ui` — chat UI

**Not React** — it's mini-lit web components, distributable as custom
elements. Tailwind v4. Compatible with React via standard custom-element
interop, but it does not ship React components directly.

Phoenix has two integration choices:

1. **`ChatPanel` + `AgentInterface` web components** — drop-in chat surface
   (used as-is). Includes the mini-lit chat panel, attachments, artifact
   panel, model selector, IndexedDB-backed sessions. Heavy.
2. **Roll our own** UI in React, using `pi-agent-core` events directly.
   Lighter, fits the rest of the Phoenix stack better. **Probably what
   we want for V1.**

```typescript
// Option 1 — use the ChatPanel web component
import {
  ChatPanel,
  AppStorage,
  IndexedDBStorageBackend,
  SettingsStore,
  ProviderKeysStore,
  SessionsStore,
  setAppStorage,
  defaultConvertToLlm,
  ApiKeyPromptDialog,
} from '@earendil-works/pi-web-ui';
import '@earendil-works/pi-web-ui/app.css';
// ... wire up storage, agent, then:
const chatPanel = new ChatPanel();
await chatPanel.setAgent(agent, {
  onApiKeyRequired: (provider) => ApiKeyPromptDialog.prompt(provider),
});
document.body.appendChild(chatPanel);
```

The PROJECT.md §11 plan calls out `src/components/CharacterCreator.tsx` as
new — most likely option 2 (custom React UI on top of `pi-agent-core`),
not the heavy web-component panel. Confirm the choice with Jim.

## How Phoenix uses each (PROJECT.md §6)

| Phoenix flow                  | Package                          |
| ----------------------------- | -------------------------------- |
| Wizard interview loop         | `pi-agent-core` `Agent`          |
| Persona text styling          | `pi-ai` `complete()` / `stream()`|
| Profile + post image gen      | `pi-ai` `generateImages()` (PPQ)  |
| Wizard chat surface           | TBD — likely a thin React shell over `pi-agent-core` events, not `pi-web-ui` (see above) |

## Source

- `github.com/earendil-works/pi` — monorepo
- Per-package READMEs at `/packages/{ai,agent,web-ui}/README.md` —
  authoritative API reference, deeper than this doc
- pi.dev — site
- PROJECT.md §6 (AI capabilities), §11 (file plan)
