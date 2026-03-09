# CLAUDE.md — AI Assistant Context for openclaw-supermemory

This file provides context for AI coding assistants working on this codebase.

## Project Overview

This is a **plugin for OpenClaw** (an AI coding agent) that provides long-term
memory powered by [Supermemory](https://supermemory.ai) cloud. It uses a
hooks-based architecture to automatically inject memories before AI responses
and extract new memories after AI responses.

## Tech Stack

- **Runtime:** Bun (also compatible with Node.js 20+)
- **Language:** TypeScript (ES2022 target, ESM modules)
- **Linter/Formatter:** Biome 2.3.8
- **Schema Library:** @sinclair/typebox
- **API Client:** supermemory SDK v4.0.0
- **CI:** GitHub Actions (type check + Biome CI)

## Project Structure

```
index.ts          Entry point — plugin registration
config.ts         Configuration parsing with env var resolution
client.ts         SupermemoryClient wrapping the SDK
memory.ts         Memory categories, entity context, doc ID generation
logger.ts         Logging abstraction with debug mode
hooks/recall.ts   Pre-request hook — injects memories into system prompt
hooks/capture.ts  Post-request hook — extracts memories from conversation
tools/*.ts        4 AI tools (search, store, forget, profile)
commands/slash.ts  Slash commands (/remember, /recall)
commands/cli.ts   CLI commands (setup, status, search, profile, wipe)
lib/validate.js   Compiled validation utilities (API key, content, tags)
```

## Key Architecture Decisions

1. **Hooks over Tools for default behavior.** Memory injection (recall) and
   extraction (capture) happen automatically via event hooks, not through
   tool calls. Tools exist for explicit user requests only.

2. **Fail silently.** All hooks catch errors and log them. Memory failures
   must never break the AI conversation.

3. **Graceful degradation.** Without an API key, the plugin registers stub
   commands that show helpful error messages instead of crashing.

4. **Token budget awareness.** Context injection is formatted efficiently.
   Full profile is injected only every N turns (configurable), while search
   results are injected every turn.

5. **Deduplication.** The recall hook deduplicates across static facts,
   dynamic facts, and search results before injection.

6. **Context stripping.** The capture hook strips previously injected
   `<supermemory-context>` blocks to prevent recursive memory storage.

## Code Conventions

- **Indent:** Tabs
- **Quotes:** Double
- **Semicolons:** As needed (Biome decides)
- **Unused params:** Prefix with `_` (e.g., `_toolCallId`, `_cfg`)
- **Error handling:** try/catch with `log.error()` in hooks and commands
- **Imports:** Biome auto-sorts; use `import type` for type-only imports

## Commands

```bash
bun install              # Install dependencies
bun run check-types      # TypeScript type checking (tsc --noEmit)
bun run lint             # Biome CI (format + lint check)
bun run lint:fix         # Biome auto-fix
bun run build:lib        # Rebuild lib/validate.js from TypeScript source
```

## Important Files for Common Changes

- **New AI tool:** Create `tools/newtool.ts`, register in `index.ts`
- **New config option:** Update type in `config.ts`, add to `parseConfig()`,
  add to `openclaw.plugin.json` (both `uiHints` and `configSchema`)
- **New CLI command:** Add to `commands/cli.ts` inside `registerCli`
- **New slash command:** Add to `commands/slash.ts` inside `registerCommands`
- **Change memory extraction rules:** Edit `DEFAULT_ENTITY_CONTEXT` in `memory.ts`
- **Change context format:** Edit `formatContext()` in `hooks/recall.ts`

## Peer Dependency

OpenClaw SDK (`openclaw/plugin-sdk`) is a peer dependency — not installed
locally. Type declarations are in `types/openclaw.d.ts`.

## Do NOT

- Add test files (no test framework configured yet)
- Modify `lib/validate.js` directly (it's compiled from TypeScript)
- Commit `node_modules/`
- Hardcode API keys or secrets
- Add `console.log` — use `log.debug()`, `log.info()`, etc. from `logger.ts`
