# OpenClaw Supermemory — Architecture Documentation

> **Audience:** Developers new to full-stack/web development who want to understand
> every layer of this system. No prior knowledge of TypeScript, plugin architectures,
> or AI memory systems is assumed.

---

## Table of Contents

1. [What This Application Is](#1-what-this-application-is)
2. [The Problem It Solves](#2-the-problem-it-solves)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Component Map](#4-component-map)
5. [File-by-File Breakdown](#5-file-by-file-breakdown)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [The Hook System — Deep Dive](#7-the-hook-system--deep-dive)
8. [The Tool System — Deep Dive](#8-the-tool-system--deep-dive)
9. [The Client Layer — Deep Dive](#9-the-client-layer--deep-dive)
10. [Configuration System](#10-configuration-system)
11. [Validation & Security Layer](#11-validation--security-layer)
12. [CLI & Slash Commands](#12-cli--slash-commands)
13. [Memory Model](#13-memory-model)
14. [Container & Namespace System](#14-container--namespace-system)
15. [Error Handling Strategy](#15-error-handling-strategy)
16. [Tech Stack Glossary](#16-tech-stack-glossary)

---

## 1. What This Application Is

OpenClaw Supermemory is a **plugin** for OpenClaw (an AI coding assistant, similar to
Claude Code or Cursor). It gives the AI **long-term memory** — the ability to remember
facts about you across conversations and recall them when relevant.

Think of it like this:

```
Without this plugin:          With this plugin:
+------------------+          +------------------+
|   You talk to    |          |   You talk to    |
|   the AI agent   |          |   the AI agent   |
|                  |          |                  |
|   It forgets     |          |   It remembers   |
|   everything     |          |   your prefs,    |
|   after each     |          |   your projects, |
|   session        |          |   your decisions |
+------------------+          +------------------+
```

**It is NOT a standalone application.** It is a plugin that hooks into OpenClaw's
event lifecycle and extends it with memory capabilities.

---

## 2. The Problem It Solves

### The "Goldfish Problem"

AI agents today have **no persistent memory**. Every conversation starts from scratch.
You tell the AI "I prefer tabs over spaces" in session 1, and in session 2 it has no
idea. This is frustrating and wastes time.

### Why Existing Solutions Fail

Most AI tools try to solve this with **"Tools-based memory"** — they save `.md` files
to disk and give the AI a "search memory" tool. This has three fatal flaws:

```
Flaw 1: The AI must CHOOSE to search       Flaw 2: Static files can't update
+----------------------------------+        +----------------------------------+
| User: "What monitor should I     |        | File says: "User lives in NYC"   |
|        buy?"                     |        | User moved to SF 3 months ago    |
|                                  |        | File STILL says NYC              |
| AI thinks: "This is a shopping   |        | No mechanism to overwrite stale  |
|  question, not a memory question"|        | information                      |
| AI: gives generic answer         |        +----------------------------------+
| (never searches memory)          |
+----------------------------------+        Flaw 3: No forgetfulness
                                            +----------------------------------+
                                            | Memory accumulates forever       |
                                            | Context window fills up          |
                                            | AI gets confused by old noise    |
                                            +----------------------------------+
```

### How Supermemory Solves It

Instead of relying on the AI to search, Supermemory uses **hooks** — automatic
background processes that inject memory BEFORE the AI thinks, and extract new
memories AFTER the AI responds.

```
  HOOKS-BASED (Supermemory)              TOOLS-BASED (Traditional)
  ========================               =========================

  User sends message                     User sends message
       |                                      |
       v                                      v
  [PRE-HOOK: auto-inject                 AI receives message
   relevant memories into                     |
   system prompt]                             v
       |                                 AI DECIDES whether to
       v                                 call search tool
  AI receives message                    (often doesn't!)
  + memory context                            |
       |                                      v
       v                                 AI responds (maybe
  AI responds with                       without any memory)
  full context                                |
       |                                      v
       v                                 Nothing happens
  [POST-HOOK: extract                    (memory not updated)
   and store new facts
   in background]
```

---

## 3. High-Level Architecture

```
+============================================================================+
|                        OpenClaw (AI Coding Agent)                           |
|                                                                            |
|  +------------------+    +-------------------+    +---------------------+  |
|  |  User Interface  |--->|   Agent Engine     |--->|  Response Output    |  |
|  |  (CLI / Editor)  |    |  (LLM Inference)   |    |  (Terminal/Editor)  |  |
|  +------------------+    +-------------------+    +---------------------+  |
|          |                    ^         |                                   |
|          |                    |         |                                   |
|  ========|====================|=========|=== Plugin Boundary ===========   |
|          |                    |         |                                   |
|          v                    |         v                                   |
|  +------------------------------------------------------------+           |
|  |           openclaw-supermemory Plugin (this repo)           |           |
|  |                                                             |           |
|  |  +-------------+  +-------------+  +--------------------+  |           |
|  |  | Pre-Request  |  | Post-Request|  |    AI Tools        |  |           |
|  |  | Hook         |  | Hook        |  | (search, store,    |  |           |
|  |  | (recall.ts)  |  | (capture.ts)|  |  forget, profile)  |  |           |
|  |  +------+------+  +------+------+  +---------+----------+  |           |
|  |         |                |                    |             |           |
|  |         +--------+-------+--------------------+             |           |
|  |                  |                                          |           |
|  |                  v                                          |           |
|  |         +------------------+                                |           |
|  |         | SupermemoryClient|                                |           |
|  |         | (client.ts)      |                                |           |
|  |         +--------+---------+                                |           |
|  |                  |                                          |           |
|  +------------------|------------------------------------------+           |
|                     |                                                      |
+======================|=====================================================+
                       |  HTTPS API calls
                       v
            +---------------------+
            |  Supermemory Cloud   |
            |  (External Service)  |
            |                     |
            |  - Vector DB        |
            |  - Knowledge Graph  |
            |  - Profile Builder  |
            |  - Extraction AI    |
            +---------------------+
```

### What Lives Where

| Layer | Location | Responsibility |
|-------|----------|----------------|
| OpenClaw Agent | External (not this repo) | The AI coding assistant itself |
| This Plugin | `index.ts` + all subdirs | Hooks, tools, client, config |
| Supermemory Cloud | External API | Storage, search, extraction, profiles |

---

## 4. Component Map

```
openclaw-supermemory/
|
|-- index.ts                 <-- ENTRY POINT: Plugin registration
|-- config.ts                <-- Configuration parsing & defaults
|-- client.ts                <-- API client wrapping Supermemory SDK
|-- memory.ts                <-- Memory model (categories, entity context)
|-- logger.ts                <-- Logging abstraction
|
|-- hooks/
|   |-- recall.ts            <-- PRE-HOOK: injects memories before AI turn
|   |-- capture.ts           <-- POST-HOOK: extracts memories after AI turn
|
|-- tools/
|   |-- search.ts            <-- AI tool: semantic memory search
|   |-- store.ts             <-- AI tool: manually save a memory
|   |-- forget.ts            <-- AI tool: delete a memory
|   |-- profile.ts           <-- AI tool: view user profile
|
|-- commands/
|   |-- slash.ts             <-- Slash commands: /remember, /recall
|   |-- cli.ts               <-- CLI commands: setup, status, search, etc.
|
|-- lib/
|   |-- validate.js          <-- Compiled validation & security utilities
|   |-- validate.d.ts        <-- TypeScript type declarations for validate.js
|
|-- types/
|   |-- openclaw.d.ts        <-- Type declarations for OpenClaw SDK
|
|-- openclaw.plugin.json     <-- Plugin manifest (ID, config schema, UI hints)
|-- package.json             <-- NPM package definition & dependencies
|-- tsconfig.json            <-- TypeScript compiler configuration
|-- biome.json               <-- Linter & formatter configuration
```

### Dependency Graph (Internal)

```
                         index.ts
                        /   |   \    \
                       /    |    \    \
                      v     v     v    v
               config.ts  hooks/  tools/  commands/
                  |       /    \    |  |      |
                  v      v      v  v  v      v
               memory.ts        client.ts
                  |                 |
                  v                 v
               (pure logic)    lib/validate.js
                                   |
                                   v
                              supermemory SDK
                              (npm package)
```

**Key insight:** Arrows point downward = "depends on". Nothing below depends on
anything above. This is clean **layered architecture**.

---

## 5. File-by-File Breakdown

### 5.1 `index.ts` — The Entry Point

**What it does:** This is the ONE file OpenClaw loads. It defines the plugin's
identity and wires everything together.

**Key code:**

```typescript
// index.ts lines 14-74
export default {
    id: "openclaw-supermemory",
    name: "Supermemory",
    kind: "memory" as const,       // <-- tells OpenClaw this is a memory plugin
    configSchema: supermemoryConfigSchema,

    register(api: OpenClawPluginApi) {
        const cfg = parseConfig(api.pluginConfig)   // parse user config
        initLogger(api.logger, cfg.debug)            // set up logging

        if (!cfg.apiKey) {          // no API key = register stubs and bail
            registerStubCommands(api)
            return
        }

        const client = new SupermemoryClient(cfg.apiKey, cfg.containerTag)

        // Register the 4 AI tools
        registerSearchTool(api, client, cfg)
        registerStoreTool(api, client, cfg, getSessionKey)
        registerForgetTool(api, client, cfg)
        registerProfileTool(api, client, cfg)

        // Register the 2 hooks (THE MAGIC)
        if (cfg.autoRecall)  api.on("before_agent_start", recallHandler)
        if (cfg.autoCapture) api.on("agent_end", captureHandler)

        // Register CLI and slash commands
        registerCommands(api, client, cfg, getSessionKey)
        registerCli(api, client, cfg)
    },
}
```

**How it works as a flow:**

```
OpenClaw starts
     |
     v
Loads plugin manifest (openclaw.plugin.json)
     |
     v
Calls register(api) on the default export of index.ts
     |
     +---> parseConfig() from config.ts
     +---> initLogger() from logger.ts
     +---> new SupermemoryClient() from client.ts
     +---> registerSearchTool() from tools/search.ts
     +---> registerStoreTool() from tools/store.ts
     +---> registerForgetTool() from tools/forget.ts
     +---> registerProfileTool() from tools/profile.ts
     +---> api.on("before_agent_start", ...) from hooks/recall.ts
     +---> api.on("agent_end", ...) from hooks/capture.ts
     +---> registerCommands() from commands/slash.ts
     +---> registerCli() from commands/cli.ts
     |
     v
Plugin is now active. Hooks fire automatically.
```

### 5.2 `config.ts` — Configuration System

**What it does:** Reads the user's config from `~/.openclaw/openclaw.json`, applies
defaults, resolves environment variables, and validates everything.

**Key pattern — Environment Variable Resolution:**

```typescript
// config.ts lines 52-59
function resolveEnvVars(value: string): string {
    return value.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
        const envValue = process.env[envVar]
        if (!envValue) {
            throw new Error(`Environment variable ${envVar} is not set`)
        }
        return envValue
    })
}
```

This allows users to write `"apiKey": "${SUPERMEMORY_OPENCLAW_API_KEY}"` in their
config file, and the actual value comes from the OS environment. This is a security
pattern — you never hardcode API keys.

**Default resolution chain:**

```
User provides apiKey in config?
     |
     +-- YES --> resolveEnvVars(apiKey)
     |
     +-- NO  --> Check process.env.SUPERMEMORY_OPENCLAW_API_KEY
                      |
                      +-- Found --> use it
                      +-- Not found --> apiKey = undefined (plugin disabled)
```

### 5.3 `client.ts` — The API Client

**What it does:** Wraps the `supermemory` npm SDK into a clean interface with
logging, validation, and error handling.

**Key methods and their API mappings:**

```
SupermemoryClient Method      Supermemory SDK Call           Purpose
========================      =======================       ===================
addMemory(content, ...)   --> client.add({...})          --> Store a memory
search(query, limit)      --> client.search.memories()   --> Find memories
getProfile(query)         --> client.profile({...})      --> Get user profile
deleteMemory(id)          --> client.memories.forget()   --> Delete one memory
forgetByQuery(query)      --> search + deleteMemory      --> Find-then-delete
wipeAllMemories()         --> documents.list + deleteBulk --> Delete everything
```

**The "forgetByQuery" pattern** is notable (client.ts lines 167-183):

```
User says: "forget that I like Python"
     |
     v
Search for "like Python" --> returns top 5 results
     |
     v
Take the #1 result (closest match)
     |
     v
Delete it by ID
     |
     v
Return: 'Forgot: "User prefers Python for scripting"'
```

### 5.4 `memory.ts` — Memory Model

**What it does:** Defines how memories are categorized, how extraction is guided,
and how session-based document IDs are built.

**Memory categories** (memory.ts lines 1-7):

```
preference  -- "I like dark mode", "I prefer tabs"
fact        -- "I work at Acme Corp", "My dog's name is Rex"
decision    -- "I'll use PostgreSQL for this project"
entity      -- Phone numbers, emails, named things
other       -- Anything that doesn't fit above
```

**Category detection** uses simple regex (memory.ts lines 10-17):

```typescript
if (/prefer|like|love|hate|want/i.test(lower)) return "preference"
if (/decided|will use|going with/i.test(lower))  return "decision"
if (/\+\d{10,}|@[\w.-]+\.\w+|is called/i.test(lower)) return "entity"
if (/is|are|has|have/i.test(lower))               return "fact"
return "other"
```

**The DEFAULT_ENTITY_CONTEXT** (memory.ts lines 21-33) is crucial — it tells the
Supermemory cloud HOW to extract memories:

```
REMEMBER: lasting personal facts — dietary restrictions, preferences,
          personal details, workplace, location, tools, ongoing projects

DO NOT REMEMBER: temporary intents, one-time tasks, assistant actions,
                 implementation details, in-progress task status
```

This is what prevents the memory system from filling up with noise.

### 5.5 `logger.ts` — Logging

**What it does:** Creates a logging abstraction that prefixes all messages with
`supermemory:` and only shows debug output when `cfg.debug = true`.

```
cfg.debug = false:    Only info/warn/error messages appear
cfg.debug = true:     Full request/response logging of every API call

Example debug output:
  supermemory [debug] -> search.memories {"query":"Python","limit":5}
  supermemory [debug] <- search.memories {"count":3}
```

---

## 6. Data Flow Diagrams

### 6.1 Complete Request Lifecycle

This is what happens for EVERY user message when both auto-recall and auto-capture
are enabled:

```
 User types a message
       |
       v
 +------------------+
 | OpenClaw receives |
 | the message       |
 +--------+---------+
          |
          | fires "before_agent_start" event
          v
 +------------------------------------------+
 |        RECALL HOOK (hooks/recall.ts)      |
 |                                           |
 |  1. Extract user's prompt text            |
 |  2. Call client.getProfile(prompt)        |
 |     (sends prompt to Supermemory cloud)   |
 |  3. Receive back:                         |
 |     - static facts (persistent profile)   |
 |     - dynamic facts (recent context)      |
 |     - search results (similar memories)   |
 |  4. Deduplicate all three lists           |
 |  5. Format into <supermemory-context>     |
 |     block (~2000 tokens max)              |
 |  6. Return { prependContext: block }      |
 +--------------------+---------------------+
                      |
                      v
 +------------------------------------------+
 | OpenClaw PREPENDS the context to the      |
 | system prompt, then sends to the LLM      |
 +--------------------+---------------------+
                      |
                      v
 +------------------------------------------+
 | LLM generates response WITH full context  |
 | (it "knows" about the user now)           |
 +--------------------+---------------------+
                      |
                      | fires "agent_end" event
                      v
 +------------------------------------------+
 |       CAPTURE HOOK (hooks/capture.ts)     |
 |                                           |
 |  1. Extract last user+assistant turn      |
 |  2. Strip out injected <supermemory-      |
 |     context> blocks (avoid re-storing)    |
 |  3. Filter short/empty messages           |
 |  4. Format as [role: user]...[user:end]   |
 |  5. Send to client.addMemory() with       |
 |     entityContext extraction rules         |
 |  6. Supermemory cloud extracts facts      |
 |     and updates knowledge graph           |
 +------------------------------------------+
                      |
                      v
 User sees the AI response.
 Memory is silently updated in the background.
```

### 6.2 Recall Hook — Internal Detail

```
buildRecallHandler(client, cfg) returns a closure
       |
       v
closure(event, ctx) is called on "before_agent_start"
       |
       +-- event.prompt  = the user's current message text
       +-- event.messages = full conversation history array
       +-- ctx.sessionKey = unique session identifier
       |
       v
  countUserTurns(messages) --> turn number
       |
       v
  includeProfile? = (turn <= 1) OR (turn % profileFrequency == 0)
       |                                                      |
       | YES (turn 1, or every 50th turn)                     | NO
       v                                                      v
  client.getProfile(prompt)                    client.getProfile(prompt)
  returns { static, dynamic, searchResults }   returns { searchResults only }
       |                                                      |
       +----------------------+-------------------------------+
                              |
                              v
                    deduplicateMemories()
                              |
                              v
                    formatContext() --> string or null
                              |
                    +---------+---------+
                    |                   |
                    v                   v
             has content?          null (no memories)
                    |                   |
                    v                   v
          return {                return (nothing)
            prependContext:        (OpenClaw proceeds
            finalContext           without memory)
          }
```

### 6.3 Capture Hook — Internal Detail

```
buildCaptureHandler(client, cfg, getSessionKey) returns a closure
       |
       v
closure(event, ctx) is called on "agent_end"
       |
       v
  Is provider in SKIPPED_PROVIDERS?  ----YES----> return (skip)
  ["exec-event", "cron-event",                    (don't capture
   "heartbeat"]                                    system events)
       |
       NO
       v
  event.success? && event.messages.length > 0?
       |                         |
       NO --> return (skip)      YES
                                 |
                                 v
                        getLastTurn(messages)
                        (find last user msg index,
                         slice from there to end)
                                 |
                                 v
                        For each message in lastTurn:
                          extract text content
                          format as [role: user]...[user:end]
                                 |
                                 v
                        captureMode == "all"?
                           |           |
                          YES          NO ("everything")
                           |           |
                           v           v
                     Strip out      Keep all texts
                     <supermemory-  as-is
                     context> blocks,
                     filter < 10 chars
                                 |
                                 v
                        client.addMemory(
                          content,
                          { source: "openclaw", timestamp: ... },
                          customId,       // session-based doc ID
                          undefined,      // default container
                          cfg.entityContext // extraction rules
                        )
```

### 6.4 Profile Injection Timing

```
Turn 1:    [FULL PROFILE + SEARCH]  <-- First interaction, inject everything
Turn 2:    [SEARCH ONLY]
Turn 3:    [SEARCH ONLY]
...
Turn 49:   [SEARCH ONLY]
Turn 50:   [FULL PROFILE + SEARCH]  <-- Refresh the full profile
Turn 51:   [SEARCH ONLY]
...
Turn 100:  [FULL PROFILE + SEARCH]  <-- Refresh again
```

This saves tokens. The full profile (static + dynamic facts) can be 500+ tokens.
Search results change every turn based on the user's current message, so they're
always included.

### 6.5 Network Communication

```
+-------------------+          HTTPS          +---------------------+
|  This Plugin      |  =====================> |  Supermemory Cloud  |
|  (runs locally)   |                         |  (api.supermemory   |
|                   |  <===================== |   .ai)              |
+-------------------+                         +---------------------+

Outbound calls (this plugin --> cloud):
  POST /add          --> addMemory()     --> store new content
  POST /search       --> search()        --> semantic similarity search
  POST /profile      --> getProfile()    --> get user profile + search
  DELETE /memories    --> deleteMemory()  --> remove a specific memory
  GET /documents/list --> wipeAll..()     --> list all docs (for wipe)
  DELETE /documents   --> wipeAll..()     --> bulk delete

All calls include:
  - API key in Authorization header (via supermemory SDK)
  - containerTag to namespace memories
  - Content goes through sanitizeContent() before sending
```

---

## 7. The Hook System — Deep Dive

### What Are Hooks?

In plugin architectures, **hooks** are functions that execute automatically when
specific events occur. You don't call them — the host application (OpenClaw) calls
them for you.

```
Traditional function call:          Hook-based execution:
========================           ========================

You decide when to call:           The system calls you:

  myFunction()                     api.on("event_name", myFunction)
  // runs NOW                      // runs WHEN the event fires
```

### OpenClaw's Two Events

| Event | When It Fires | What `event` Contains |
|-------|---------------|----------------------|
| `before_agent_start` | Before the LLM processes a message | `prompt`, `messages` array |
| `agent_end` | After the LLM finishes responding | `success`, `messages` array |

### Why Hooks > Tools for Memory

```
+------------------------------------------------------+
|  HOOK fires automatically on EVERY turn              |
|  The AI has NO CHOICE — memory is always available   |
|  Cost: ~1 API call per turn (very cheap)             |
+------------------------------------------------------+

vs.

+------------------------------------------------------+
|  TOOL requires the AI to DECIDE to use it            |
|  If the AI doesn't think "I should search memory"    |
|  then memory is never consulted                      |
|  This fails ~40% of the time in practice             |
+------------------------------------------------------+
```

The plugin registers BOTH hooks AND tools. Hooks handle the common case
automatically. Tools are there for explicit user requests like "search my
memories for X" or "forget that I said Y".

---

## 8. The Tool System — Deep Dive

### What Are Tools?

Tools are functions that the AI can call during a conversation. The AI sees a
description of each tool and decides when to use it.

### The Four Tools

```
+-------------------+    +-------------------+    +-------------------+
| supermemory_store |    | supermemory_search|    | supermemory_forget|
|                   |    |                   |    |                   |
| Input:            |    | Input:            |    | Input:            |
|  - text (required)|    |  - query (required)|   |  - query (opt)    |
|  - category (opt) |    |  - limit (opt)    |    |  - memoryId (opt) |
|  - containerTag   |    |  - containerTag   |    |  - containerTag   |
|    (opt)          |    |    (opt)          |    |    (opt)          |
|                   |    |                   |    |                   |
| Output:           |    | Output:           |    | Output:           |
|  "Stored: <prev>" |    |  List of memories |    |  "Memory          |
|                   |    |  with scores      |    |   forgotten."     |
+-------------------+    +-------------------+    +-------------------+

+--------------------+
| supermemory_profile|
|                    |
| Input:             |
|  - query (opt)     |
|  - containerTag    |
|    (opt)           |
|                    |
| Output:            |
|  Static facts +    |
|  Dynamic context   |
+--------------------+
```

### Tool Registration Pattern

Every tool follows the same pattern (example from tools/search.ts):

```typescript
api.registerTool(
    {
        name: "supermemory_search",          // unique identifier
        label: "Memory Search",              // human-readable name
        description: "Search through...",    // AI reads this to decide usage
        parameters: Type.Object({            // JSON Schema for inputs
            query: Type.String({...}),
            limit: Type.Optional(Type.Number({...})),
        }),
        async execute(toolCallId, params) {  // the actual logic
            const results = await client.search(params.query, params.limit)
            return { content: [...], details: {...} }
        },
    },
    { name: "supermemory_search" },          // registration options
)
```

### Tool vs Hook Decision Matrix

```
Scenario                              Who Handles It
========                              ==============
User sends any message             -> Recall Hook (auto)
AI responds to any message         -> Capture Hook (auto)
User says "remember X"             -> /remember command OR store tool
User says "search my memories"     -> search tool
User says "forget that I said X"   -> forget tool
User says "what do you know about  -> profile tool
  me?"
```

---

## 9. The Client Layer — Deep Dive

### Class Design

```
SupermemoryClient
|
|-- constructor(apiKey, containerTag)
|     Validates API key format
|     Validates container tag
|     Creates Supermemory SDK instance
|
|-- addMemory(content, metadata, customId, containerTag, entityContext)
|     Sanitizes content
|     Clamps entity context to 1500 chars
|     Calls SDK .add()
|
|-- search(query, limit, containerTag)
|     Calls SDK .search.memories()
|     Maps results to SearchResult[]
|
|-- getProfile(query, containerTag)
|     Calls SDK .profile()
|     Returns { static[], dynamic[], searchResults[] }
|
|-- deleteMemory(id, containerTag)
|     Calls SDK .memories.forget()
|
|-- forgetByQuery(query, containerTag)
|     Calls search() first
|     Then deleteMemory() on top result
|
|-- wipeAllMemories()
|     Paginates through all documents
|     Deletes in batches of 100
```

### The SDK Wrapper Pattern

The `SupermemoryClient` class wraps the raw `supermemory` npm SDK. This is a
common software design pattern called the **Adapter Pattern**:

```
Raw SDK (complex, changes between versions):
  client.search.memories({ q: ..., containerTag: ..., limit: ... })

Our wrapper (simple, stable interface):
  client.search(query, limit, containerTag)
```

Benefits:
- If the SDK API changes, only `client.ts` needs updating
- All validation happens in one place
- All logging happens in one place
- The rest of the codebase uses a clean interface

---

## 10. Configuration System

### Configuration Sources (Priority Order)

```
1. Config file:   ~/.openclaw/openclaw.json
                  (plugins.entries.openclaw-supermemory.config)
                       |
                       v
2. Environment:   SUPERMEMORY_OPENCLAW_API_KEY
                       |
                       v
3. Defaults:      Hardcoded in parseConfig() (config.ts lines 110-136)
```

### All Configuration Options

```
+-------------------------------+----------+-----------------------+
| Option                        | Type     | Default               |
+-------------------------------+----------+-----------------------+
| apiKey                        | string   | (none, required)      |
| containerTag                  | string   | openclaw_{hostname}   |
| autoRecall                    | boolean  | true                  |
| autoCapture                   | boolean  | true                  |
| maxRecallResults              | number   | 10                    |
| profileFrequency              | number   | 50                    |
| captureMode                   | string   | "all"                 |
| entityContext                  | string   | DEFAULT_ENTITY_CONTEXT|
| debug                         | boolean  | false                 |
| enableCustomContainerTags     | boolean  | false                 |
| customContainers              | array    | []                    |
| customContainerInstructions   | string   | ""                    |
+-------------------------------+----------+-----------------------+
```

### Config Validation Flow

```
raw config object from OpenClaw
       |
       v
assertAllowedKeys() --> reject unknown keys
       |
       v
resolveEnvVars() on apiKey --> replace ${VAR} with env values
       |
       v
sanitizeTag() on containerTag --> replace non-alphanumeric with _
       |
       v
Parse customContainers array --> validate each has tag + description
       |
       v
Apply defaults for all missing values
       |
       v
Return typed SupermemoryConfig object
```

---

## 11. Validation & Security Layer

### `lib/validate.js` — Compiled Security Utilities

This file is **pre-compiled** (built from TypeScript via esbuild) and minified.
It provides:

```
Function                    Purpose
==========================  =============================================
validateApiKeyFormat(key)   Checks key starts with "sm_", min 20 chars,
                            no whitespace
validateContainerTag(tag)   Checks tag is alphanumeric + underscore/hyphen,
                            max 100 chars
sanitizeContent(content)    Strips control characters, BOM markers,
                            truncates to 100KB
validateContentLength()     Checks min/max content length
sanitizeMetadata(meta)      Limits to 50 keys, key max 128 chars,
                            value max 1024 chars
getRequestIntegrity()       Generates HMAC-SHA256 integrity headers
```

### Content Sanitization Pipeline

```
Raw user content
       |
       v
Remove control characters [\x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F]
       |
       v
Remove BOM marker [\uFEFF]
       |
       v
Remove special Unicode [\uFFF0-\uFFFF]
       |
       v
Truncate to 100,000 characters
       |
       v
Clean content ready for API
```

### Request Integrity

```
getRequestIntegrity(apiKey, containerTag):

  contentHash = SHA256(containerTag)
  combined    = SHA256(apiKey) + ":" + SHA256(containerTag) + ":" + version
  signature   = HMAC-SHA256(combined, secret)

  Returns headers:
    X-Content-Hash: <contentHash>
    X-Request-Integrity: v1.<signature>
```

---

## 12. CLI & Slash Commands

### Two User Interfaces

```
+---------------------------------+     +----------------------------------+
| SLASH COMMANDS                  |     | CLI COMMANDS                     |
| (inside OpenClaw conversations) |     | (from your terminal)             |
+---------------------------------+     +----------------------------------+
|                                 |     |                                  |
| /remember <text>                |     | openclaw supermemory setup       |
|   Save text to memory           |     |   Configure API key              |
|                                 |     |                                  |
| /recall <query>                 |     | openclaw supermemory setup-adv   |
|   Search memories               |     |   Configure all options          |
|                                 |     |                                  |
|                                 |     | openclaw supermemory status      |
|                                 |     |   View current config            |
|                                 |     |                                  |
|                                 |     | openclaw supermemory search <q>  |
|                                 |     |   Search memories from terminal  |
|                                 |     |                                  |
|                                 |     | openclaw supermemory profile     |
|                                 |     |   View user profile              |
|                                 |     |                                  |
|                                 |     | openclaw supermemory wipe        |
|                                 |     |   Delete ALL memories            |
+---------------------------------+     +----------------------------------+
```

### Stub Commands Pattern

When the API key isn't configured, the plugin registers **stub commands** that
return a helpful error message instead of crashing:

```typescript
// commands/slash.ts lines 7-31
export function registerStubCommands(api) {
    api.registerCommand({
        name: "remember",
        handler: async () => ({
            text: "Supermemory not configured. Run 'openclaw supermemory setup' first."
        }),
    })
}
```

This is a **graceful degradation** pattern — the plugin is always safe to install
even without configuration.

---

## 13. Memory Model

### How Memories Are Structured

```
+--------------------------------------------------+
|  A single "Memory" in Supermemory Cloud           |
+--------------------------------------------------+
|  id:            "abc123"                          |
|  content:       "User prefers dark mode in all    |
|                  editors"                         |
|  memory:        (extracted/summarized version)    |
|  similarity:    0.87 (when returned from search)  |
|  metadata:      { source: "openclaw",             |
|                   timestamp: "2026-03-09T..." }   |
|  containerTag:  "openclaw_DESKTOP_ABC"            |
|  updatedAt:     "2026-03-09T14:22:00Z"            |
+--------------------------------------------------+
```

### Profile Structure

The Supermemory cloud builds and maintains a **User Profile** from all stored
memories. It has three parts:

```
ProfileResult
|
|-- static: string[]
|     Persistent facts that rarely change.
|     Example: ["Works at Acme Corp", "Prefers TypeScript",
|               "Uses VS Code", "Located in San Francisco"]
|
|-- dynamic: string[]
|     Recent context that changes frequently.
|     Example: ["Working on a React dashboard",
|               "Debugging a WebSocket issue"]
|
|-- searchResults: ProfileSearchResult[]
|     Semantically similar memories to the current query.
|     Each has: memory, updatedAt, similarity score
```

### Injected Context Format

When the recall hook injects memories, it formats them like this
(recall.ts lines 66-115):

```xml
<supermemory-context>
The following is background context about the user from long-term
memory. Use this context silently to inform your understanding —
only reference it when the user's message is directly related to
something in these memories.

## User Profile (Persistent)
- Works at Acme Corp
- Prefers TypeScript over JavaScript
- Uses VS Code with Vim keybindings

## Recent Context
- Working on a React dashboard for Q1 metrics
- Debugging a WebSocket reconnection issue

## Relevant Memories (with relevance %)
- [2d ago] Decided to use PostgreSQL for the new project [92%]
- [5d ago] Prefers dark mode in all editors [78%]
- [12 Mar] Uses pnpm instead of npm [71%]

Do not proactively bring up memories. Only use them when the
conversation naturally calls for it.
</supermemory-context>
```

---

## 14. Container & Namespace System

### What Are Containers?

Containers are **namespaces** that isolate groups of memories. Think of them like
folders:

```
Default setup (no custom containers):

openclaw_DESKTOP_ABC/          <-- one container for everything
|-- memory_1: "User likes Python"
|-- memory_2: "User works at Acme"
|-- memory_3: "User prefers dark mode"


With custom containers enabled:

openclaw_DESKTOP_ABC/          <-- root container (default)
|-- memory_1: "User works at Acme"

work/                          <-- custom container
|-- memory_2: "Sprint deadline is Friday"
|-- memory_3: "PR #42 needs review"

personal/                      <-- custom container
|-- memory_4: "Dentist appointment March 15"
```

### Container Tag Generation

```
Default:  sanitizeTag("openclaw_" + os.hostname())

os.hostname() = "My-Desktop.local"
                    |
                    v
"openclaw_My-Desktop.local"
                    |
sanitizeTag():      v
  replace non-alphanumeric with _  --> "openclaw_My_Desktop_local"
  collapse multiple _ to one       --> "openclaw_My_Desktop_local"
  strip leading/trailing _         --> "openclaw_My_Desktop_local"
```

### Custom Container Routing

When `enableCustomContainerTags` is true, the recall hook injects container
metadata into the context so the AI knows which containers exist and can route
memories accordingly:

```xml
<supermemory-containers>
Root container: `openclaw_DESKTOP_ABC`

Custom memory containers:
- `work`: Work-related memories
- `personal`: Personal notes

Current channel: cli

Store work tasks in 'work', personal stuff in 'personal'

Use containerTag parameter to store in a specific container,
otherwise stores to root.
</supermemory-containers>
```

---

## 15. Error Handling Strategy

The plugin uses a **fail-silently** strategy. Memory failures should NEVER break
the AI conversation.

```
Hook execution:

try {
    const profile = await client.getProfile(prompt)
    // ... format and return context
} catch (err) {
    log.error("recall failed", err)     // log the error
    return                               // return nothing (no crash)
}
```

This pattern appears in:
- `hooks/recall.ts` line 212: recall errors are logged, hook returns nothing
- `hooks/capture.ts` line 114: capture errors are logged, no retry
- `commands/slash.ts` line 65: command errors return user-friendly message
- `config.ts` line 89: API key resolution errors set apiKey to undefined

### Error Escalation

```
Severity     Action                  Example
========     ======                  =======
Low          Log debug + continue    No memories found for query
Medium       Log warn + continue     Container tag has special chars
High         Log error + skip turn   API call failed (network error)
Critical     Throw in constructor    Invalid API key format (bad config)
```

---

## 16. Tech Stack Glossary

For developers coming from C/C++/Java, here's what everything means:

| Technology | What It Is | C/C++/Java Equivalent |
|------------|-----------|----------------------|
| **TypeScript** | JavaScript with static types | Like Java's type system on top of JavaScript |
| **Bun** | JavaScript runtime + package manager | Like JVM + Maven combined, but for JS |
| **npm / pnpm** | Package managers | Like Maven/Gradle for Java, or vcpkg for C++ |
| **ESM (ES Modules)** | Module system using `import`/`export` | Like `#include` in C++ or `import` in Java |
| **Biome** | Linter + formatter | Like clang-format + clang-tidy combined |
| **esbuild** | Ultra-fast JS bundler/compiler | Like a linker that bundles all files into one |
| **@sinclair/typebox** | Runtime JSON schema builder | Like Protocol Buffers or JSON Schema in Java |
| **supermemory SDK** | NPM package for Supermemory API | Like an HTTP client library (OkHttp, libcurl) |
| **async/await** | Asynchronous programming | Like `CompletableFuture` in Java or `std::future` in C++ |
| **Closure** | Function that "captures" variables from its scope | Like a lambda with captures in C++ or Java |

### Key TypeScript Concepts Used

```typescript
// 1. Type aliases (like typedef in C)
type CaptureMode = "everything" | "all"

// 2. Interfaces (like abstract classes with no implementation)
interface OpenClawPluginApi { ... }

// 3. Optional parameters (like default arguments in C++)
async search(query: string, limit = 5, containerTag?: string)

// 4. Generics (like templates in C++ or generics in Java)
Record<string, unknown>  // a map/dictionary from string to anything

// 5. Arrow functions (like lambdas)
const add = (a: number, b: number) => a + b

// 6. Destructuring (no C/C++ equivalent)
const { static: staticFacts, dynamic, searchResults } = profile

// 7. Template literals (like printf but inline)
`supermemory: ${msg}`  // equivalent to printf("supermemory: %s", msg)
```

---

## Appendix: Complete System Interaction Map

```
+===========================================================================+
|                                                                           |
|  USER                                                                     |
|  |                                                                        |
|  | types message                                                          |
|  v                                                                        |
|  OPENCLAW ENGINE                                                          |
|  |                                                                        |
|  | fires "before_agent_start"                                             |
|  |                                                                        |
|  +---> RECALL HOOK -----> SupermemoryClient.getProfile()                  |
|  |         |                       |                                      |
|  |         |               Supermemory Cloud                              |
|  |         |               (vector search +                               |
|  |         |                profile lookup)                               |
|  |         |                       |                                      |
|  |         |<------- { static, dynamic, searchResults } ------+           |
|  |         |                                                              |
|  |         +--> formatContext() --> deduplicateMemories()                  |
|  |         |                                                              |
|  |         +--> return { prependContext: "<supermemory-context>..." }      |
|  |                                                                        |
|  | context prepended to system prompt                                     |
|  |                                                                        |
|  +---> LLM INFERENCE (with memory context)                                |
|  |                                                                        |
|  |     LLM may also call TOOLS during inference:                          |
|  |     +---> supermemory_search ---> client.search()                      |
|  |     +---> supermemory_store  ---> client.addMemory()                   |
|  |     +---> supermemory_forget ---> client.forgetByQuery()               |
|  |     +---> supermemory_profile --> client.getProfile()                   |
|  |                                                                        |
|  | LLM response complete                                                  |
|  |                                                                        |
|  | fires "agent_end"                                                      |
|  |                                                                        |
|  +---> CAPTURE HOOK -----> getLastTurn() --> strip context blocks          |
|  |         |                                                              |
|  |         +--> client.addMemory(content, metadata, ...)                  |
|  |                       |                                                |
|  |               Supermemory Cloud                                        |
|  |               (extract facts,                                          |
|  |                update graph,                                           |
|  |                build profile)                                          |
|  |                                                                        |
|  v                                                                        |
|  RESPONSE displayed to user                                               |
|                                                                           |
+===========================================================================+
```
