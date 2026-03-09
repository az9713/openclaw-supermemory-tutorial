# OpenClaw Supermemory — Developer Guide

> **Audience:** Developers with C/C++/Java backgrounds who are new to TypeScript,
> Node.js, and web/plugin development. This guide assumes zero prior knowledge of
> the JavaScript ecosystem.

---

## Table of Contents

1. [Prerequisites — What You Need Installed](#1-prerequisites)
2. [Understanding the JavaScript/TypeScript Ecosystem](#2-understanding-the-ecosystem)
3. [Setting Up Your Development Environment](#3-setting-up-your-development-environment)
4. [Project Structure Walkthrough](#4-project-structure-walkthrough)
5. [How to Build the Project](#5-how-to-build-the-project)
6. [How to Run Type Checking](#6-how-to-run-type-checking)
7. [How to Run the Linter and Formatter](#7-how-to-run-the-linter-and-formatter)
8. [How to Add a New Feature](#8-how-to-add-a-new-feature)
9. [How to Add a New AI Tool](#9-how-to-add-a-new-ai-tool)
10. [How to Add a New Hook](#10-how-to-add-a-new-hook)
11. [How to Add a New CLI Command](#11-how-to-add-a-new-cli-command)
12. [How to Add a New Slash Command](#12-how-to-add-a-new-slash-command)
13. [How to Modify the Configuration](#13-how-to-modify-the-configuration)
14. [How to Debug](#14-how-to-debug)
15. [How to Run the CI Pipeline Locally](#15-how-to-run-the-ci-pipeline-locally)
16. [Code Conventions and Style](#16-code-conventions-and-style)
17. [Common Patterns in This Codebase](#17-common-patterns-in-this-codebase)
18. [Troubleshooting](#18-troubleshooting)
19. [Glossary of Terms](#19-glossary-of-terms)

---

## 1. Prerequisites

### Software to Install

| Tool | What It Is | How to Install | Verify |
|------|-----------|----------------|--------|
| **Git** | Version control | https://git-scm.com | `git --version` |
| **Bun** | JS runtime + package manager | https://bun.sh | `bun --version` |
| **Node.js 20+** | JS runtime (for compatibility) | https://nodejs.org | `node --version` |
| **VS Code** | Code editor (recommended) | https://code.visualstudio.com | Open it |

### Bun — Why Not npm/Node?

This project uses **Bun** instead of Node.js + npm. Think of Bun as a faster,
all-in-one replacement:

```
Traditional JS Stack:           This Project:
  Node.js  (runtime)              Bun (runtime)
  + npm    (package manager)      Bun (package manager too)
  + npx    (script runner)        Bun (script runner too)
  = 3 tools                       = 1 tool
```

### Accounts You Need

| Account | Why | Where |
|---------|-----|-------|
| **Supermemory** | API key for testing | https://app.supermemory.ai |
| **GitHub** | To clone and contribute | https://github.com |

---

## 2. Understanding the Ecosystem

### JavaScript vs TypeScript

```
JavaScript (.js):
  let x = 5          // x could be anything later
  x = "hello"        // no error — JS doesn't care

TypeScript (.ts):
  let x: number = 5  // x MUST be a number
  x = "hello"        // ERROR at compile time

TypeScript = JavaScript + Type Safety
```

TypeScript files (`.ts`) are NOT run directly. They are either:
- **Type-checked** by `tsc` (the TypeScript compiler) — catches errors
- **Run directly** by Bun (Bun understands TypeScript natively)

### ES Modules (import/export)

```typescript
// In C/C++:    #include "myfile.h"
// In Java:     import com.mypackage.MyClass;
// In this project:
import { SupermemoryClient } from "./client.ts"
import type { SupermemoryConfig } from "./config.ts"
```

The `type` keyword in `import type` means "I only need this for type checking,
not at runtime." It gets stripped away when the code runs.

### package.json — The Project Manifest

Think of `package.json` like a `pom.xml` (Java Maven) or `CMakeLists.txt` (C++):

```json
{
    "name": "@supermemory/openclaw-supermemory",  // like groupId:artifactId
    "version": "2.0.2",                           // semantic version
    "dependencies": {                              // runtime dependencies
        "supermemory": "^4.0.0",                   // ^4.0.0 means >=4.0.0 <5.0.0
        "@sinclair/typebox": "0.34.47"             // exact version
    },
    "peerDependencies": {                          // the host must provide these
        "openclaw": ">=2026.1.29"
    },
    "scripts": {                                   // like Makefile targets
        "check-types": "tsc --noEmit",
        "lint": "bunx @biomejs/biome ci .",
        "lint:fix": "bunx @biomejs/biome check --write ."
    }
}
```

### node_modules — The Dependency Directory

When you run `bun install`, all dependencies are downloaded into `node_modules/`.
This is like the `lib/` or `.m2/` directory in Java, or `vcpkg_installed/` in C++.

**Never commit `node_modules/` to git.** It's listed in `.gitignore`.

---

## 3. Setting Up Your Development Environment

### Step-by-Step Setup

```bash
# Step 1: Clone the repository
git clone https://github.com/supermemory/openclaw-supermemory.git
cd openclaw-supermemory

# Step 2: Install dependencies
bun install
# This reads package.json, downloads all dependencies into node_modules/,
# and creates/updates bun.lock (the lockfile).

# Step 3: Verify TypeScript compiles without errors
bun run check-types
# Expected output: (no output means success)

# Step 4: Verify linting passes
bun run lint
# Expected output: "Checked X files in Y ms. No errors found."

# Step 5: Set up your API key for testing
export SUPERMEMORY_OPENCLAW_API_KEY="sm_your_api_key_here"
# On Windows (PowerShell): $env:SUPERMEMORY_OPENCLAW_API_KEY = "sm_..."
# On Windows (Git Bash):   export SUPERMEMORY_OPENCLAW_API_KEY="sm_..."
```

### VS Code Extensions (Recommended)

Install these for the best development experience:

1. **Biome** — formatting and linting integration
2. **TypeScript** — built into VS Code, but ensure it's enabled
3. **Error Lens** — shows errors inline in the editor

### VS Code Settings (Optional)

Create `.vscode/settings.json`:

```json
{
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "biomejs.biome",
    "editor.tabSize": 4,
    "typescript.tsdk": "node_modules/typescript/lib"
}
```

---

## 4. Project Structure Walkthrough

```
openclaw-supermemory/
|
|-- index.ts              ENTRY POINT
|                         OpenClaw loads this file to start the plugin.
|                         It calls register(api) which wires everything.
|
|-- config.ts             CONFIGURATION
|                         Parses user config from openclaw.json.
|                         Resolves environment variables.
|                         Applies defaults for missing values.
|
|-- client.ts             API CLIENT
|                         Wraps the Supermemory SDK.
|                         Every API call goes through here.
|
|-- memory.ts             MEMORY MODEL
|                         Defines categories, entity context rules,
|                         and document ID generation.
|
|-- logger.ts             LOGGING
|                         Wraps OpenClaw's logger with prefixing
|                         and debug mode control.
|
|-- hooks/
|   |-- recall.ts         PRE-HOOK (before AI responds)
|   |                     Fetches profile + memories from cloud.
|   |                     Formats and injects into system prompt.
|   |
|   |-- capture.ts        POST-HOOK (after AI responds)
|                         Extracts the conversation turn.
|                         Sends to cloud for memory extraction.
|
|-- tools/
|   |-- search.ts         AI TOOL: search memories
|   |-- store.ts          AI TOOL: save a memory
|   |-- forget.ts         AI TOOL: delete a memory
|   |-- profile.ts        AI TOOL: view user profile
|
|-- commands/
|   |-- slash.ts          SLASH COMMANDS: /remember, /recall
|   |-- cli.ts            CLI COMMANDS: setup, status, search, etc.
|
|-- lib/
|   |-- validate.js       COMPILED VALIDATION LIBRARY
|   |-- validate.d.ts     TYPE DECLARATIONS for validate.js
|
|-- types/
|   |-- openclaw.d.ts     TYPE DECLARATIONS for OpenClaw SDK
|
|-- openclaw.plugin.json  PLUGIN MANIFEST
|                         Tells OpenClaw: plugin ID, config schema,
|                         UI hints for settings.
|
|-- package.json          NPM PACKAGE MANIFEST
|-- tsconfig.json         TypeScript compiler settings
|-- biome.json            Linter + formatter settings
|-- bun.lock              Dependency lockfile (auto-generated)
```

### How Files Relate to Each Other

```
                    index.ts
                   /  |  |  \
                  /   |  |   \
                 v    v  v    v
          config.ts  hooks/*  tools/*  commands/*
             |        |   |    |         |
             v        v   v    v         v
          memory.ts      client.ts
                            |
                            v
                     lib/validate.js
                            |
                            v
                     supermemory (SDK)
```

**Rule:** Files only import from files at the SAME level or BELOW them in
this diagram. Never upward. This prevents circular dependencies.

---

## 5. How to Build the Project

### There Is No Build Step for the Plugin

Unlike C/C++ or Java, this TypeScript project doesn't need compilation for
development. Bun runs `.ts` files directly. OpenClaw also runs `.ts` files
directly via its plugin loader.

### The Only Build: `lib/validate.js`

The validation library is the one exception. It's written in TypeScript but
shipped as a compiled `.js` file (for performance and to avoid exposing the
HMAC secret in readable source):

```bash
# Rebuild validate.js from validate.ts (if you modify validation logic)
bun run build:lib

# What this does (from package.json):
# esbuild lib/validate.ts --bundle --minify --format=esm \
#   --platform=node --target=es2022 \
#   --external:node:crypto --outfile=lib/validate.js
```

**When to rebuild:** Only if you modify `lib/validate.ts` (the source file).
The compiled `lib/validate.js` is committed to git.

---

## 6. How to Run Type Checking

```bash
bun run check-types
```

This runs `tsc --noEmit`, which means:
- **tsc** = TypeScript Compiler
- **--noEmit** = Check types but don't output JavaScript files

```
What it checks:
  - Are all types correct?
  - Are all function signatures matching?
  - Are there missing imports?
  - Are there unused variables?

What it does NOT do:
  - It does NOT produce .js files
  - It does NOT run the code
```

### Common Type Errors and How to Fix Them

```
Error: Property 'foo' does not exist on type 'X'
Fix:   Add 'foo' to the type definition, or cast: (obj as any).foo

Error: Argument of type 'string' is not assignable to parameter of type 'number'
Fix:   Convert the value: parseInt(myString, 10)

Error: Cannot find module './newfile.ts'
Fix:   Make sure the file exists and the path is correct
```

---

## 7. How to Run the Linter and Formatter

### Check for Issues (Read-Only)

```bash
bun run lint
```

### Auto-Fix Issues

```bash
bun run lint:fix
```

### What Biome Checks

From `biome.json`:

| Rule | What It Does |
|------|-------------|
| `noUnusedVariables` | Warns on variables that are declared but never read |
| `noUnusedImports` | Warns on imports that are never used |
| `noNonNullAssertion` | Warns on `x!` (asserting something isn't null) |
| `noParameterAssign` | Errors on reassigning function parameters |
| `useSelfClosingElements` | Enforces `<br />` instead of `<br></br>` |
| `organizeImports` | Auto-sorts imports alphabetically |

### Formatting Rules

- **Indentation:** Tabs (not spaces)
- **Quotes:** Double quotes (`"hello"`, not `'hello'`)
- **Semicolons:** As needed (Biome decides based on context)

---

## 8. How to Add a New Feature

### General Workflow

```
1. Understand where the feature fits
   |
   v
2. Create or modify the appropriate file
   |
   v
3. Wire it up in index.ts (if it's a new component)
   |
   v
4. Run type checking: bun run check-types
   |
   v
5. Run linter: bun run lint:fix
   |
   v
6. Test manually with OpenClaw (if possible)
   |
   v
7. Commit your changes
```

### Decision Tree: Where Does My Feature Go?

```
Is it about how memories are stored/retrieved?
  YES --> client.ts (add a new method)

Is it about what the AI automatically does?
  YES --> Is it BEFORE the AI responds?
            YES --> hooks/recall.ts
            NO  --> hooks/capture.ts

Is it a new ability the AI can choose to use?
  YES --> Create a new file in tools/

Is it a new user command?
  YES --> In conversations? --> commands/slash.ts
          In the terminal?  --> commands/cli.ts

Is it a new config option?
  YES --> config.ts (add to type + parseConfig)
          + openclaw.plugin.json (add to schema + uiHints)

Is it about memory categories or extraction rules?
  YES --> memory.ts
```

---

## 9. How to Add a New AI Tool

Let's say you want to add a `supermemory_stats` tool that shows memory statistics.

### Step 1: Create the Tool File

Create `tools/stats.ts`:

```typescript
import { Type } from "@sinclair/typebox"
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { SupermemoryClient } from "../client.ts"
import type { SupermemoryConfig } from "../config.ts"
import { log } from "../logger.ts"

export function registerStatsTool(
    api: OpenClawPluginApi,
    client: SupermemoryClient,
    _cfg: SupermemoryConfig,
): void {
    api.registerTool(
        {
            name: "supermemory_stats",
            label: "Memory Stats",
            description:
                "Show statistics about the user's stored memories.",
            parameters: Type.Object({
                containerTag: Type.Optional(
                    Type.String({
                        description: "Optional container to check stats for",
                    }),
                ),
            }),
            async execute(
                _toolCallId: string,
                params: { containerTag?: string },
            ) {
                log.debug(`stats tool: containerTag="${params.containerTag ?? "default"}"`)

                // Implement your logic here using client methods
                const profile = await client.getProfile(undefined, params.containerTag)

                const text = [
                    `Static facts: ${profile.static.length}`,
                    `Dynamic facts: ${profile.dynamic.length}`,
                ].join("\n")

                return {
                    content: [{ type: "text" as const, text }],
                }
            },
        },
        { name: "supermemory_stats" },
    )
}
```

### Step 2: Wire It Up in `index.ts`

```typescript
// Add this import at the top of index.ts
import { registerStatsTool } from "./tools/stats.ts"

// Add this line inside register(), after the other registerXxxTool calls
registerStatsTool(api, client, cfg)
```

### Step 3: Verify

```bash
bun run check-types   # should pass
bun run lint:fix       # fix any formatting issues
```

---

## 10. How to Add a New Hook

Hooks follow the **builder pattern** — a function that returns a function.

### The Pattern

```typescript
// hooks/myhook.ts

import type { SupermemoryClient } from "../client.ts"
import type { SupermemoryConfig } from "../config.ts"
import { log } from "../logger.ts"

export function buildMyHookHandler(
    client: SupermemoryClient,
    cfg: SupermemoryConfig,
) {
    // This outer function runs ONCE during plugin registration.
    // Use it to set up any state you need.

    return async (
        event: Record<string, unknown>,
        ctx: Record<string, unknown>,
    ) => {
        // This inner function runs EVERY TIME the event fires.
        // 'event' contains data about the current turn.
        // 'ctx' contains metadata like sessionKey, messageProvider.

        log.debug("my hook fired")

        try {
            // Your logic here...
            // Return { prependContext: "..." } for before_agent_start
            // Return nothing for agent_end
        } catch (err) {
            log.error("my hook failed", err)
            return  // fail silently
        }
    }
}
```

### Wire It Up in `index.ts`

```typescript
import { buildMyHookHandler } from "./hooks/myhook.ts"

// Inside register():
api.on("before_agent_start", buildMyHookHandler(client, cfg))
// or
api.on("agent_end", buildMyHookHandler(client, cfg))
```

### Available Events

| Event | When | What You Can Do |
|-------|------|----------------|
| `before_agent_start` | Before LLM inference | Return `{ prependContext: string }` to inject context |
| `agent_end` | After LLM response | Extract information, update state, make API calls |

---

## 11. How to Add a New CLI Command

CLI commands are for the terminal: `openclaw supermemory <your-command>`.

### Where to Add It

In `commands/cli.ts`, inside the `registerCli` function, add to the existing
`supermemory` command group:

```typescript
// Inside registerCli, find the cmd variable and add:
cmd
    .command("mycommand")
    .description("Description of what it does")
    .argument("<required_arg>", "Description")
    .option("--flag <value>", "Optional flag", "default")
    .action(async (requiredArg: string, opts: { flag: string }) => {
        // Your logic here
        console.log(`Running with: ${requiredArg}, flag=${opts.flag}`)
    })
```

Usage: `openclaw supermemory mycommand "some value" --flag custom`

---

## 12. How to Add a New Slash Command

Slash commands are for inside OpenClaw conversations: `/mycommand args`.

### Where to Add It

In `commands/slash.ts`, inside the `registerCommands` function:

```typescript
api.registerCommand({
    name: "mycommand",
    description: "What this command does",
    acceptsArgs: true,        // can the user pass arguments?
    requireAuth: true,        // require API key to be configured?
    handler: async (ctx: { args?: string }) => {
        const args = ctx.args?.trim()
        if (!args) {
            return { text: "Usage: /mycommand <argument>" }
        }

        try {
            // Your logic here
            return { text: `Result: ${args}` }
        } catch (err) {
            log.error("/mycommand failed", err)
            return { text: "Command failed. Check logs." }
        }
    },
})
```

---

## 13. How to Modify the Configuration

Adding a new config option requires changes in THREE places:

### Step 1: Update the Type (`config.ts`)

```typescript
// Add to SupermemoryConfig type (config.ts line 11-24)
export type SupermemoryConfig = {
    // ... existing fields ...
    myNewOption: boolean   // <-- add your field
}

// Add to ALLOWED_KEYS array (config.ts line 26-39)
const ALLOWED_KEYS = [
    // ... existing keys ...
    "myNewOption",          // <-- add the key
]

// Add to parseConfig return (config.ts line 110-136)
return {
    // ... existing fields ...
    myNewOption: (cfg.myNewOption as boolean) ?? false,  // <-- default value
}

// Add to schema (config.ts line 138-168)
properties: {
    // ... existing properties ...
    myNewOption: { type: "boolean" },
}
```

### Step 2: Update the Plugin Manifest (`openclaw.plugin.json`)

```json
{
    "uiHints": {
        "myNewOption": {
            "label": "My New Option",
            "help": "Description for users",
            "advanced": true
        }
    },
    "configSchema": {
        "properties": {
            "myNewOption": { "type": "boolean" }
        }
    }
}
```

### Step 3: Use It in Your Code

```typescript
// Anywhere you have access to cfg: SupermemoryConfig
if (cfg.myNewOption) {
    // do something
}
```

---

## 14. How to Debug

### Enable Debug Logging

Set `debug: true` in your config:

```json
{
    "plugins": {
        "entries": {
            "openclaw-supermemory": {
                "config": {
                    "debug": true
                }
            }
        }
    }
}
```

### What Debug Mode Shows

```
supermemory [debug] -> search.memories {"query":"Python","limit":5,"containerTag":"openclaw_DESKTOP"}
supermemory [debug] <- search.memories {"count":3}
supermemory [debug] -> profile {"containerTag":"openclaw_DESKTOP","query":"..."}
supermemory [debug] <- profile {"staticCount":5,"dynamicCount":2,"searchCount":3}
supermemory [debug] injecting context (1847 chars, turn 1)
supermemory [debug] capturing 2 texts (523 chars) -> session_abc123
```

### Debugging a Specific Component

```
Component          Debug Strategy
=========          ==============
Recall hook        Set debug=true, look for "recalling for turn N"
Capture hook       Set debug=true, look for "agent_end fired"
Tools              Set debug=true, look for "search tool:" etc.
Config             Add console.log in parseConfig(), check output
API calls          Set debug=true, look for -> and <- prefixed lines
```

---

## 15. How to Run the CI Pipeline Locally

The CI pipeline (`.github/workflows/ci.yml`) runs two checks:

```bash
# Run both checks locally (same as CI):
bun run check-types && bun run lint
```

### What CI Does

```
Step 1: Checkout code          (git clone)
Step 2: Setup Bun 1.2.17       (install Bun)
Step 3: Install dependencies    (bun install --frozen-lockfile)
Step 4: Setup Biome 2.3.8      (install linter)
Step 5: TypeScript type check   (bun run check-types)
Step 6: Biome CI                (biome ci .)
```

### `--frozen-lockfile` Explained

This flag tells Bun: "Do NOT update `bun.lock`. If `package.json` asks for
something that's not in `bun.lock`, fail." This ensures CI uses the exact
same versions as development.

---

## 16. Code Conventions and Style

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case or camelCase | `recall.ts`, `client.ts` |
| Functions | camelCase | `buildRecallHandler`, `parseConfig` |
| Types/Interfaces | PascalCase | `SupermemoryConfig`, `SearchResult` |
| Constants | UPPER_SNAKE_CASE | `MAX_ENTITY_CONTEXT_LENGTH`, `MEMORY_CATEGORIES` |
| Private class members | No prefix | `this.client` (not `this._client`) |
| Unused parameters | Prefix with `_` | `_toolCallId`, `_cfg` |

### Import Order

Biome auto-sorts imports. The convention is:

```typescript
// 1. Node.js built-ins
import * as fs from "node:fs"
import * as os from "node:os"

// 2. External packages
import Supermemory from "supermemory"
import { Type } from "@sinclair/typebox"

// 3. OpenClaw SDK
import type { OpenClawPluginApi } from "openclaw/plugin-sdk"

// 4. Internal modules (relative imports)
import { SupermemoryClient } from "../client.ts"
import { log } from "../logger.ts"
```

### Error Handling Convention

```typescript
// In hooks: fail silently
try {
    await riskyOperation()
} catch (err) {
    log.error("what failed", err)
    return  // don't crash
}

// In commands: return user-friendly message
try {
    await riskyOperation()
} catch (err) {
    log.error("/command failed", err)
    return { text: "Something went wrong. Check logs." }
}

// In constructors: throw (prevent invalid state)
const check = validateApiKeyFormat(apiKey)
if (!check.valid) {
    throw new Error(`invalid API key: ${check.reason}`)
}
```

---

## 17. Common Patterns in This Codebase

### Pattern 1: The Builder Pattern (Closures)

Used in hooks to capture `client` and `cfg` in a closure:

```typescript
// buildRecallHandler returns a function that "remembers" client and cfg
export function buildRecallHandler(client, cfg) {
    // client and cfg are "captured" here
    return async (event, ctx) => {
        // This function can use client and cfg even though
        // they weren't passed as parameters
        await client.getProfile(event.prompt)
    }
}
```

**C++ equivalent:** This is like a lambda with captures:
```cpp
auto handler = [&client, &cfg](auto event) {
    client.getProfile(event.prompt);
};
```

### Pattern 2: The Adapter Pattern

`SupermemoryClient` wraps the raw SDK:

```
Raw SDK:  client.search.memories({ q: query, containerTag: tag, limit: 5 })
Adapter:  client.search(query, 5, tag)
```

This isolates the rest of the codebase from SDK changes.

### Pattern 3: Graceful Degradation

When the API key isn't set, the plugin doesn't crash — it registers stubs:

```typescript
if (!cfg.apiKey) {
    registerStubCommands(api)  // /remember and /recall show helpful error
    return                      // don't register hooks or tools
}
```

### Pattern 4: Defensive Type Narrowing

TypeScript doesn't know the shape of `event` from OpenClaw, so the code
checks types manually:

```typescript
const content = msgObj.content

if (typeof content === "string") {
    parts.push(content)                    // it's a plain string
} else if (Array.isArray(content)) {
    for (const block of content) {
        if (b.type === "text" && typeof b.text === "string") {
            parts.push(b.text)             // it's a structured block
        }
    }
}
```

### Pattern 5: Deduplication Before Injection

The recall hook deduplicates memories across three sources to avoid
repeating the same fact:

```typescript
function deduplicateMemories(static, dynamic, search) {
    const seen = new Set<string>()
    // static first (highest priority)
    const uniqueStatic = static.filter(m => {
        if (seen.has(m)) return false
        seen.add(m)
        return true
    })
    // then dynamic, then search — each skipping already-seen items
}
```

---

## 18. Troubleshooting

### "Module not found" Errors

```
Error: Cannot find module './client.ts'
```

**Fix:** Make sure you're in the project root and have run `bun install`.

### TypeScript Errors About OpenClaw Types

```
Error: Cannot find module 'openclaw/plugin-sdk'
```

**This is expected.** The OpenClaw SDK is a **peer dependency** — it's provided
by the host (OpenClaw) at runtime, not during development. The
`types/openclaw.d.ts` file provides just enough type information for
development. Type checking will pass because of this file.

### "API key is empty" at Runtime

```
supermemory: not configured - run 'openclaw supermemory setup'
```

**Fix:** Set the environment variable or add the key to your config:

```bash
export SUPERMEMORY_OPENCLAW_API_KEY="sm_your_key_here"
```

### Biome Formatting Differences

If your editor formats differently from Biome:

```bash
bun run lint:fix   # let Biome reformat everything
```

### bun.lock Conflicts

If `bun.lock` has merge conflicts after pulling:

```bash
rm bun.lock
bun install
# This regenerates the lockfile
```

---

## 19. Glossary of Terms

| Term | Definition |
|------|-----------|
| **API Key** | A secret string that authenticates you with an external service |
| **Async/Await** | Syntax for writing asynchronous code that looks synchronous |
| **Biome** | A fast linter and formatter for JavaScript/TypeScript |
| **Bun** | A fast JavaScript runtime and package manager |
| **Bundler** | A tool that combines many source files into one output file |
| **CI (Continuous Integration)** | Automated checks that run on every code push |
| **Closure** | A function that captures variables from its surrounding scope |
| **Container Tag** | A namespace/label that groups related memories together |
| **Entity Context** | Instructions that tell the cloud how to extract memories |
| **ESM (ES Modules)** | The standard JavaScript module system using import/export |
| **Hook** | A function that runs automatically when a specific event occurs |
| **JSON Schema** | A standard for describing the shape of JSON data |
| **Lockfile** | A file that pins exact versions of all dependencies |
| **LLM** | Large Language Model — the AI that generates responses |
| **Peer Dependency** | A dependency that must be provided by the host application |
| **Plugin** | A module that extends the functionality of a host application |
| **RAG** | Retrieval-Augmented Generation — fetching context before AI responds |
| **SDK** | Software Development Kit — a library for interacting with a service |
| **Semantic Search** | Finding results by meaning, not just exact keywords |
| **System Prompt** | Hidden instructions given to the AI at the start of a conversation |
| **Tool (AI)** | A function the AI can choose to call during inference |
| **TypeBox** | A library for building JSON schemas with TypeScript types |
| **Vector Database** | A database optimized for similarity search on embeddings |
