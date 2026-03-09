# OpenClaw Supermemory Plugin — Tutorial Edition

> **This is a clone of the original [openclaw-supermemory](https://github.com/supermemoryai/openclaw-supermemory) repository, enhanced with extensive documentation for learners.** The original plugin code is unchanged — all additions are documentation files (`docs/`, `CLAUDE.md`, and this README).

> **Inspired by:** ["OpenClaw's Memory Sucks and the fix is simple — Dhravya Shah, Supermemory"](https://www.youtube.com/watch?v=Io0mAsHkiRY&t=14s) on the Latent Space Podcast. The video explains why hooks-based memory architectures outperform tools-based approaches, and this repo is the implementation discussed in that conversation.

---

<img width="2048" height="512" alt="Untitled_Artwork 3" src="https://github.com/user-attachments/assets/e68fe07d-bc1f-49a1-a40c-3560f1a079b2" />

Long-term memory for OpenClaw. Automatically remembers conversations, recalls relevant context, and builds a persistent user profile — all powered by [Supermemory](https://supermemory.ai) cloud. No local infrastructure required.

> **Requires [Supermemory Pro or above](https://app.supermemory.ai/?view=integrations)** - Unlock the state of the art memory for your OpenClaw bot.

## How It Works

```
  You type a message
       |
       v
  +----------------------------+
  | BEFORE the AI responds:    |
  | Auto-Recall fetches your   |
  | profile + relevant memories|
  | and injects them as context|
  +----------------------------+
       |
       v
  AI responds (with full context about you)
       |
       v
  +----------------------------+
  | AFTER the AI responds:     |
  | Auto-Capture sends the     |
  | conversation to the cloud  |
  | for fact extraction         |
  +----------------------------+
```

The plugin uses **hooks** (automatic background processes) rather than relying on the AI to decide to search memory. This means context is always available — no tool calls required.

## Quick Start

### 1. Install

```bash
openclaw plugins install @supermemory/openclaw-supermemory
```

### 2. Configure

```bash
openclaw supermemory setup
```

Enter your API key from [app.supermemory.ai](https://app.supermemory.ai/?view=integrations).

### 3. Restart

```bash
openclaw gateway --force
```

### 4. Verify

```bash
openclaw supermemory status
```

That's it. The plugin now works automatically in every conversation.

### Advanced Setup

```bash
openclaw supermemory setup-advanced
```

Configure all options interactively: container tag, auto-recall, auto-capture, capture mode, profile frequency, entity context, custom container tags, and more.

## Architecture

```
+------------------------------------------------------------------+
|                       OpenClaw Agent                              |
|                                                                   |
|  +-------------------+                   +-----------------+      |
|  |  before_agent_start|  ---hooks--->    | agent_end       |      |
|  +--------+----------+                   +-------+---------+      |
|           |                                      |                |
|  +--------v----------+                   +-------v---------+      |
|  |   Recall Hook      |                  |  Capture Hook   |      |
|  |   (hooks/recall.ts)|                  | (hooks/capture.ts)     |
|  +--------+-----------+                  +-------+---------+      |
|           |                                      |                |
|  +--------v------------------------------------------v---------+  |
|  |              SupermemoryClient (client.ts)                  |  |
|  +---------------------------+-------------------------------+    |
|                              |                                    |
+------------------------------|------------------------------------+
                               | HTTPS
                               v
                    +---------------------+
                    |  Supermemory Cloud   |
                    |  Vector DB + Graph   |
                    |  Profile Builder     |
                    +---------------------+
```

### What Gets Remembered

The cloud extracts lasting personal facts — preferences, decisions, tools, projects, locations. It ignores one-time requests, temporary tasks, and the AI's own actions.

### The User Profile

Over time, the cloud builds a profile with two parts:
- **Persistent facts** — rarely change (e.g., "Works at Acme Corp", "Prefers TypeScript")
- **Recent context** — changes frequently (e.g., "Working on a React dashboard")

## Features

### Slash Commands

| Command | Description |
|---------|-------------|
| `/remember <text>` | Manually save something to memory |
| `/recall <query>` | Search memories with similarity scores |

### AI Tools

The AI uses these tools autonomously when needed:

| Tool | Description |
|------|-------------|
| `supermemory_store` | Save information to memory |
| `supermemory_search` | Search memories by query |
| `supermemory_forget` | Delete a memory by query or ID |
| `supermemory_profile` | View user profile (persistent facts + recent context) |

With custom container tags enabled, all tools support a `containerTag` parameter for routing to specific containers.

### CLI Commands

```bash
openclaw supermemory setup              # Configure API key
openclaw supermemory setup-advanced     # Configure all options
openclaw supermemory status             # View current configuration
openclaw supermemory search <query>     # Search memories
openclaw supermemory profile            # View user profile
openclaw supermemory wipe               # Delete all memories (requires confirmation)
```

## Configuration

Set API key via environment variable:

```bash
export SUPERMEMORY_OPENCLAW_API_KEY="sm_..."
```

Or configure in `~/.openclaw/openclaw.json`:

### Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `apiKey` | `string` | — | Supermemory API key |
| `containerTag` | `string` | `openclaw_{hostname}` | Root memory namespace |
| `autoRecall` | `boolean` | `true` | Inject relevant memories before every AI turn |
| `autoCapture` | `boolean` | `true` | Store conversations after every turn |
| `maxRecallResults` | `number` | `10` | Max memories injected per turn (1-20) |
| `profileFrequency` | `number` | `50` | Inject full profile every N turns (1-500) |
| `captureMode` | `string` | `"all"` | `"all"` filters noise, `"everything"` captures all |
| `entityContext` | `string` | (smart default) | Custom rules for memory extraction (max 1500 chars) |
| `debug` | `boolean` | `false` | Verbose debug logs |
| `enableCustomContainerTags` | `boolean` | `false` | Enable custom container routing |
| `customContainers` | `array` | `[]` | Custom containers with `tag` and `description` |
| `customContainerInstructions` | `string` | `""` | Instructions for AI on container routing |

### Full Example

```json
{
  "plugins": {
    "entries": {
      "openclaw-supermemory": {
        "enabled": true,
        "config": {
          "apiKey": "${SUPERMEMORY_OPENCLAW_API_KEY}",
          "containerTag": "my_memory",
          "autoRecall": true,
          "autoCapture": true,
          "maxRecallResults": 10,
          "profileFrequency": 50,
          "captureMode": "all",
          "debug": false,
          "enableCustomContainerTags": true,
          "customContainers": [
            { "tag": "work", "description": "Work-related memories" },
            { "tag": "personal", "description": "Personal notes" }
          ],
          "customContainerInstructions": "Store work tasks in 'work', personal stuff in 'personal'"
        }
      }
    }
  }
}
```

## Project Structure

```
index.ts              Plugin entry point — registration and wiring
config.ts             Configuration parsing, env var resolution, defaults
client.ts             SupermemoryClient wrapping the Supermemory SDK
memory.ts             Memory categories, entity context, doc ID generation
logger.ts             Logging abstraction with debug mode

hooks/
  recall.ts           Pre-request hook — fetches and injects memories
  capture.ts          Post-request hook — extracts and stores memories

tools/
  search.ts           AI tool: semantic memory search
  store.ts            AI tool: save a memory with category detection
  forget.ts           AI tool: delete by ID or search-then-delete
  profile.ts          AI tool: view user profile

commands/
  slash.ts            Slash commands (/remember, /recall) + stubs
  cli.ts              CLI commands (setup, status, search, profile, wipe)

lib/
  validate.js         Compiled validation (API key, content, tags, integrity)
  validate.d.ts       TypeScript declarations for validate.js
```

## Development

### Prerequisites

- [Bun](https://bun.sh) 1.2+
- Supermemory API key from [app.supermemory.ai](https://app.supermemory.ai)

### Setup

```bash
bun install
```

### Commands

```bash
bun run check-types    # TypeScript type checking
bun run lint           # Biome format + lint check
bun run lint:fix       # Auto-fix formatting and lint issues
bun run build:lib      # Rebuild lib/validate.js (only if modifying validation)
```

### CI

The CI pipeline (`.github/workflows/ci.yml`) runs on every PR:
1. TypeScript type checking (`bun run check-types`)
2. Biome CI — format and lint (`biome ci .`)

## Documentation

| Document | Audience | Content |
|----------|----------|---------|
| [Architecture](docs/ARCHITECTURE.md) | Developers | Full system design with ASCII diagrams, data flows, component details |
| [Hooks Deep Dive](docs/HOOKS_DEEP_DIVE.md) | Developers | How pre-hook recall and post-hook capture work end-to-end |
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Developers | Step-by-step setup, how to add features, code conventions |
| [User Guide](docs/USER_GUIDE.md) | End users | Installation, configuration, 10 educational use cases, FAQ |
| [Study Plan](docs/STUDY_PLAN.md) | Learners | Zero-to-hero learning path using this codebase |
| [CLAUDE.md](CLAUDE.md) | AI assistants | Project context for AI coding tools |

## License

MIT
