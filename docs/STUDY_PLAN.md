# Zero-to-Hero Study Plan: Mastering AI Memory Systems

> **Using the openclaw-supermemory codebase as your learning vehicle.**
>
> This plan takes you from absolute beginner to someone who can confidently
> extend, debug, and build AI memory systems. There are no time constraints.
> Each module has theory and hands-on implementation exercises tied to the
> actual codebase.

---

## How to Use This Plan

```
Each module follows this structure:

+------------------+     +-------------------+     +------------------+
|  THEORY          | --> |  CODE READING     | --> |  EXERCISES       |
|  (concepts)      |     |  (this codebase)  |     |  (build it)      |
+------------------+     +-------------------+     +------------------+

- Read the theory section first
- Then open the referenced files and read the actual code
- Then do the exercises to solidify understanding
- Don't skip exercises — they build on each other
```

### Prerequisites Check

Before starting, make sure you can answer YES to all of these:
- [ ] I have Git installed and can clone a repository
- [ ] I have a text editor (VS Code recommended)
- [ ] I'm comfortable reading code (any language — C, Java, Python, etc.)
- [ ] I understand basic programming concepts (variables, functions, loops, if/else)

If you can't check all boxes, start with a basic programming tutorial first.

---

## Module 0: Setup Your Lab (30 minutes)

### Goal
Get the project running on your machine so you have a working lab.

### Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd openclaw-supermemory

# 2. Install Bun (if not installed)
# Visit https://bun.sh and follow install instructions

# 3. Install dependencies
bun install

# 4. Verify everything works
bun run check-types
bun run lint
```

### Exercise 0.1
Open every `.ts` file in the project. Don't read them in detail yet — just
get a sense of how many files there are and how big they are. Write down:
1. How many `.ts` files are there? (Answer: 12)
2. Which is the largest file? (Hint: look at `commands/cli.ts`)
3. Which is the smallest file? (Hint: look at `logger.ts`)

---

## Module 1: Understanding TypeScript (2-4 hours)

### Theory: Types as Contracts

In C, you have `int`, `char`, `float`. In TypeScript, you have the same idea
but much more expressive:

```typescript
// Simple types (like C primitives)
let count: number = 5
let name: string = "Alice"
let active: boolean = true

// Object types (like C structs)
type Person = {
    name: string
    age: number
    email?: string     // the ? means optional (can be undefined)
}

// Union types (no C equivalent — this is powerful)
type CaptureMode = "everything" | "all"  // ONLY these two values allowed

// Array types (like arrays but typed)
let names: string[] = ["Alice", "Bob"]

// Generic types (like C++ templates)
type Record<K, V> = { [key: K]: V }
// Record<string, number> = a dictionary mapping strings to numbers
```

### Code Reading: `config.ts` lines 4-24

Open `config.ts` and study the `SupermemoryConfig` type:

```typescript
export type SupermemoryConfig = {
    apiKey: string | undefined     // string OR undefined (might not exist)
    containerTag: string
    autoRecall: boolean
    autoCapture: boolean
    maxRecallResults: number
    profileFrequency: number
    captureMode: CaptureMode       // "everything" | "all" (union type)
    entityContext: string
    debug: boolean
    enableCustomContainerTags: boolean
    customContainers: CustomContainer[]   // array of objects
    customContainerInstructions: string
}
```

### Code Reading: `client.ts` lines 10-29

Study the type definitions for API return values:

```typescript
export type SearchResult = {
    id: string
    content: string
    memory?: string           // ? means this might not exist
    similarity?: number
    metadata?: Record<string, unknown>  // unknown = "I don't know the type"
}
```

### Exercise 1.1
Create a new file `practice/types.ts` (you can delete it after). Define types for:
1. A `Book` with title, author, pages, and optional isbn
2. A `Library` with name and an array of `Book`
3. A function type that takes a `Book` and returns `string`

### Exercise 1.2
In `config.ts`, find all the places where `as` is used for type casting:
```typescript
cfg.autoRecall as boolean
```
Why is casting needed here? (Answer: because `cfg` is typed as
`Record<string, unknown>` — TypeScript doesn't know what type each value is.)

---

## Module 2: Understanding async/await (1-2 hours)

### Theory: Asynchronous Programming

When you make an API call over the internet, the response doesn't come back
instantly. In C, you'd use threads or callbacks. In TypeScript, you use
`async/await`:

```
Synchronous (C-style):          Asynchronous (TypeScript):
==================              ========================

result = httpGet(url)           result = await httpGet(url)
// blocks the thread            // suspends this function
// until response arrives       // other code can run
// nothing else can run         // resumes when response arrives
process(result)                 process(result)
```

Key rules:
1. `await` can only be used inside an `async` function
2. `async` functions always return a `Promise<T>`
3. If you forget `await`, you get a `Promise` object instead of the value

### Code Reading: `client.ts` lines 55-86

```typescript
async addMemory(                              // async = this function is asynchronous
    content: string,
    metadata?: Record<string, string | number | boolean>,
    customId?: string,
    containerTag?: string,
    entityContext?: string,
): Promise<{ id: string }> {                  // returns a Promise that resolves to {id}
    const cleaned = sanitizeContent(content)
    const result = await this.client.add({    // await = wait for the API response
        content: cleaned,
        containerTag: tag,
    })
    return { id: result.id }                  // the resolved value
}
```

### Code Reading: `hooks/capture.ts` lines 106-116

```typescript
try {
    await client.addMemory(        // await the API call
        content,
        { source: "openclaw", timestamp: new Date().toISOString() },
        customId,
        undefined,
        cfg.entityContext,
    )
} catch (err) {                    // if the API call fails
    log.error("capture failed", err)
}
```

### Exercise 2.1
Find every `async` function in the codebase. Count them. For each one,
identify what asynchronous operation it's awaiting (API call, file read, etc.).

### Exercise 2.2
In `client.ts`, what would happen if you removed `await` from line 76?
```typescript
// Before:
const result = await this.client.add({...})
// After (broken):
const result = this.client.add({...})
```
(Answer: `result` would be a `Promise` object, not the actual result.
`result.id` would be `undefined`.)

---

## Module 3: The Plugin Architecture Pattern (2-3 hours)

### Theory: What Is a Plugin?

A plugin is code that extends a host application without modifying the host.
The host provides an API, and the plugin uses that API to add features.

```
HOST APPLICATION (OpenClaw)
+--------------------------------------------------+
|                                                  |
|  Provides an API object with methods:            |
|    api.registerTool(...)                         |
|    api.registerCommand(...)                      |
|    api.registerCli(...)                          |
|    api.on(event, handler)                        |
|    api.registerService(...)                      |
|    api.pluginConfig  (user's config)             |
|    api.logger        (logging functions)         |
|                                                  |
|  Calls plugin.register(api) at startup           |
|                                                  |
+--------------------------------------------------+
          |
          | api object passed to register()
          v
PLUGIN (this repo)
+--------------------------------------------------+
|                                                  |
|  export default {                                |
|    id: "openclaw-supermemory",                   |
|    register(api) {                               |
|      // Use api to add features                  |
|    }                                             |
|  }                                               |
|                                                  |
+--------------------------------------------------+
```

### Code Reading: `index.ts` (entire file)

Read the whole file carefully. Notice:
1. It exports a default object (the plugin definition)
2. The `register` function receives `api` from OpenClaw
3. Everything is wired up through `api` methods
4. If no API key exists, it gracefully degrades

### Code Reading: `types/openclaw.d.ts`

This file declares the shape of the `api` object. Since OpenClaw doesn't
ship TypeScript types, this plugin creates its own type declarations:

```typescript
declare module "openclaw/plugin-sdk" {
    export interface OpenClawPluginApi {
        pluginConfig: unknown
        logger: { info, warn, error, debug }
        registerTool(tool, options): void
        registerCommand(command): void
        registerCli(handler, options?): void
        registerService(service): void
        on(event, handler): void
    }
}
```

### Exercise 3.1
Draw (on paper) the sequence of function calls that happen when `register(api)`
is called. Start from line 21 of `index.ts` and trace every function call.

### Exercise 3.2
What happens if you move `registerSearchTool(api, client, cfg)` to BEFORE
`const client = new SupermemoryClient(...)` ? (Answer: Runtime error —
`client` doesn't exist yet.)

### Exercise 3.3
Remove the `if (!cfg.apiKey)` check mentally. What would happen if someone
installs the plugin without an API key? (Answer: `new SupermemoryClient()`
would throw because `validateApiKeyFormat()` fails on an empty key.)

---

## Module 4: The Event System — Hooks (3-4 hours)

### Theory: Event-Driven Programming

Instead of calling functions directly, you register handlers that run when
events fire. This is called the **Observer Pattern**.

```
Traditional:                    Event-Driven:
============                    ==============

main() {                        // Register what to do when events fire
  fetchMemory()                 api.on("before_agent_start", fetchMemory)
  runAI()                       api.on("agent_end", storeMemory)
  storeMemory()
}                               // The host fires events at the right time
                                // You don't control WHEN — only WHAT
```

### Theory: Closures (Functions Inside Functions)

A closure is a function that "captures" variables from its enclosing scope:

```typescript
function makeCounter() {
    let count = 0                   // this variable is "captured"
    return () => {
        count++                     // the inner function can access count
        return count
    }
}

const counter = makeCounter()
counter()  // 1
counter()  // 2  (count persists between calls!)
```

In C++ terms, this is like a lambda with captures:
```cpp
auto makeCounter() {
    int count = 0;
    return [count]() mutable { return ++count; };
}
```

### Code Reading: `hooks/recall.ts` lines 165-217

This is the most important function in the entire codebase. Study it carefully:

```typescript
export function buildRecallHandler(client, cfg) {
    // Outer function: runs ONCE during registration
    // 'client' and 'cfg' are captured by the closure

    return async (event, ctx) => {
        // Inner function: runs on EVERY "before_agent_start" event
        // It can use 'client' and 'cfg' from the outer scope

        const prompt = event.prompt as string | undefined
        if (!prompt || prompt.length < 5) return   // skip tiny messages

        // ... fetch profile, format context, return prependContext
    }
}
```

### Code Reading: `hooks/capture.ts` lines 24-118

The capture hook follows the same pattern but runs after the AI responds.
Key things to notice:
1. It skips system events (exec-event, cron-event, heartbeat)
2. It only captures the LAST turn (not the entire history)
3. It strips out previously injected memory context (prevents recursion!)

### Exercise 4.1
In `hooks/recall.ts`, trace what happens when:
- Turn 1 fires (first user message)
- Turn 25 fires (regular message)
- Turn 50 fires (profile refresh turn)

Write down exactly which API calls are made and what gets injected.

### Exercise 4.2
In `hooks/capture.ts`, what does this regex do?

```typescript
.replace(/<supermemory-context>[\s\S]*?<\/supermemory-context>\s*/g, "")
```

(Answer: It removes everything between `<supermemory-context>` tags.
`[\s\S]*?` matches any character including newlines, non-greedy.
This prevents previously injected memories from being re-stored.)

### Exercise 4.3
Why does the capture hook use `getLastTurn(messages)` instead of sending
all messages? (Answer: The full history could be thousands of tokens.
Only the last exchange contains new information to extract.)

---

## Module 5: AI Tools — Extending the LLM (2-3 hours)

### Theory: Tool Use in LLMs

Modern LLMs can "call functions" during inference. You give the LLM a list
of tools with descriptions, and it decides when to use them.

```
Without tools:
  User: "What's the weather?"
  AI: "I don't have access to weather data."

With tools:
  User: "What's the weather?"
  AI: [calls get_weather(location="user's city")]
  AI: "It's 72°F and sunny in Seattle!"
```

### Theory: JSON Schema for Parameters

Tools need a schema so the LLM knows what parameters to pass:

```typescript
// TypeBox builds JSON Schema from TypeScript
Type.Object({
    query: Type.String({ description: "Search query" }),
    limit: Type.Optional(Type.Number({ description: "Max results" })),
})

// Produces this JSON Schema:
{
    "type": "object",
    "properties": {
        "query": { "type": "string", "description": "Search query" },
        "limit": { "type": "number", "description": "Max results" }
    },
    "required": ["query"]
}
```

### Code Reading: `tools/search.ts` (entire file)

Read the entire file. Notice:
1. `registerSearchTool` takes `api`, `client`, `cfg` — dependency injection
2. `api.registerTool()` tells OpenClaw about this tool
3. `parameters` uses TypeBox to define the input schema
4. `execute()` is the function that runs when the AI calls the tool
5. The return value uses a specific format: `{ content: [...], details: {...} }`

### Code Reading: `tools/forget.ts` (entire file)

Notice the branching logic:
- If `memoryId` is provided → delete directly by ID
- If `query` is provided → search first, then delete the top result
- If neither → return an error message

### Exercise 5.1
Compare all four tool files (`search.ts`, `store.ts`, `forget.ts`, `profile.ts`).
What pattern do they all share? List the common elements.

### Exercise 5.2
Write a new tool `supermemory_count` that returns the count of memories
matching a query. Use `tools/search.ts` as a template. (Don't worry about
wiring it up — just write the file.)

---

## Module 6: The API Client Pattern (2-3 hours)

### Theory: The Adapter Pattern

An adapter wraps a complex interface with a simpler one:

```
Complex SDK interface:
  client.search.memories({ q: query, containerTag: tag, limit: 5 })

Simple adapter interface:
  client.search(query, 5, tag)
```

Benefits:
- If the SDK changes, only the adapter changes
- Tests can mock the simple interface
- The rest of the code is cleaner

### Code Reading: `client.ts` (entire file)

Study the `SupermemoryClient` class:
1. Constructor validates inputs before creating the SDK client
2. Every method sanitizes/validates before calling the SDK
3. Every method logs debug info before and after the SDK call
4. Return types are our own types, not the SDK's types

### Code Reading: `lib/validate.js` (study the `.d.ts` file)

The actual validation logic is in compiled JS. Read `lib/validate.d.ts` to
understand what functions are available:
- `validateApiKeyFormat(key)` — checks `sm_` prefix, length, whitespace
- `validateContainerTag(tag)` — checks chars, length, start/end
- `sanitizeContent(content)` — strips control chars, truncates
- `sanitizeMetadata(meta)` — limits keys/values/count
- `getRequestIntegrity(apiKey, tag)` — HMAC-based integrity headers

### Exercise 6.1
In `client.ts`, the `wipeAllMemories` method (lines 185-228) paginates
through all documents. Draw a diagram of what happens when there are 250
memories to delete. How many API calls does it make?

(Answer: 3 calls to list (pages 1, 2, 3) + 3 calls to deleteBulk
(batches of 100, 100, 50) = 6 total API calls)

### Exercise 6.2
Why does `forgetByQuery` only delete the FIRST result and not all results?
(Answer: If the user says "forget about Python", you don't want to delete
EVERY memory that mentions Python — just the most relevant one. This is
a safety measure.)

---

## Module 7: Configuration and Validation (1-2 hours)

### Theory: Defense in Depth

Never trust user input. Even config files can have mistakes. This codebase
validates at multiple levels:

```
Level 1: Config file          assertAllowedKeys() rejects unknown keys
Level 2: Individual values    resolveEnvVars(), sanitizeTag()
Level 3: Client construction  validateApiKeyFormat(), validateContainerTag()
Level 4: Every API call       sanitizeContent(), clampEntityContext()
```

### Code Reading: `config.ts` lines 73-136 (`parseConfig`)

This function is a masterclass in defensive programming:
- Unknown keys → throw error
- Missing apiKey → gracefully set to undefined
- Env var not found → silently set apiKey to undefined (catch block)
- Bad containerTag → sanitize it (don't reject it)
- Missing any optional field → use the default

### Exercise 7.1
Trace what happens when a user provides this config:

```json
{
    "apiKey": "${MISSING_ENV_VAR}",
    "containerTag": "my container!!",
    "maxRecallResults": 25,
    "unknownKey": true
}
```

What errors/warnings occur? What's the final config? (Answer: `assertAllowedKeys`
throws because of `unknownKey`. The user would need to fix that first.)

### Exercise 7.2
Remove `unknownKey` from the previous exercise. Now what happens?
(Answer: apiKey → undefined because MISSING_ENV_VAR doesn't exist.
containerTag → "my_container__" after sanitizeTag. maxRecallResults → 25
which is above the schema max of 20 but parseConfig doesn't validate ranges —
the JSON schema in openclaw.plugin.json would catch this earlier.)

---

## Module 8: The Command System (1-2 hours)

### Theory: Two Types of User Commands

```
SLASH COMMANDS (/remember, /recall)
  - Used inside OpenClaw conversations
  - Registered with api.registerCommand()
  - Receive ctx.args (the text after the command)
  - Return { text: "response" }

CLI COMMANDS (openclaw supermemory ...)
  - Used in the terminal
  - Registered with api.registerCli()
  - Use Commander.js-style .command() and .action()
  - Use console.log for output and readline for input
```

### Code Reading: `commands/slash.ts` lines 33-108

Notice the dual pattern:
- `registerStubCommands` — registered when there's no API key
- `registerCommands` — registered when everything is configured

Both register `/remember` and `/recall`, but the stubs just return error messages.

### Code Reading: `commands/cli.ts` lines 10-78

The `setup` command reads user input interactively:

```typescript
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})
const apiKey = await new Promise<string>((resolve) => {
    rl.question("Enter your Supermemory API key: ", resolve)
})
rl.close()
```

This is equivalent to `scanf` in C or `Scanner.nextLine()` in Java.

### Exercise 8.1
Read the `setup-advanced` command (cli.ts lines 82-334). How many
configuration options does it ask about? List them all.

### Exercise 8.2
Notice that `setup` writes to `~/.openclaw/openclaw.json`. What happens
if the file already exists with other settings? (Answer: It reads the
existing file, merges the new settings into it, and writes it back.
Other settings are preserved.)

---

## Module 9: Memory Format and Context Injection (2-3 hours)

### Theory: Token Budgets

LLMs have a limited "context window" (e.g., 128K tokens). Everything that goes
in — system prompt, user message, memories, tools — competes for space.

```
Total Context Window: ~128,000 tokens
  - System prompt:      ~2,000 tokens
  - Memory context:     ~2,000 tokens  (this plugin)
  - User conversation:  ~100,000 tokens
  - Tool definitions:   ~1,000 tokens
  - Overhead:           ~23,000 tokens
```

The plugin must be VERY efficient with its token budget.

### Code Reading: `hooks/recall.ts` lines 66-115 (`formatContext`)

Study how the context is structured:

```xml
<supermemory-context>
[intro paragraph — tells AI how to use memories]

## User Profile (Persistent)
- fact 1
- fact 2

## Recent Context
- context 1
- context 2

## Relevant Memories (with relevance %)
- [2d ago] memory text [92%]

[disclaimer — tells AI not to bring up memories unprompted]
</supermemory-context>
```

Key design decisions:
1. XML tags allow the capture hook to strip this out later
2. Markdown headers help the LLM distinguish sections
3. Relative timestamps ("2d ago") save tokens vs full dates
4. Similarity percentages help the LLM prioritize

### Code Reading: `hooks/recall.ts` lines 5-27 (`formatRelativeTime`)

Notice how timestamps are converted:
- < 30 minutes → "just now"
- < 60 minutes → "15mins ago"
- < 24 hours → "3 hrs ago"
- < 7 days → "2d ago"
- Same year → "15 Mar"
- Different year → "15 Mar, 2025"

### Exercise 9.1
Calculate the approximate token count for a context injection with:
- 5 static facts (avg 10 words each)
- 3 dynamic facts (avg 8 words each)
- 10 search results (avg 15 words each)

(Rough estimate: 1 token ≈ 0.75 words. So (50+24+150)/0.75 + overhead ≈ 400 tokens.
With the intro/disclaimer text ≈ 600 tokens. Well within the ~2000 token budget.)

### Exercise 9.2
In `deduplicateMemories` (recall.ts lines 29-64), why is the dedup order
static → dynamic → search? (Answer: Priority. If a fact appears in both
static profile and search results, we want to keep the static version
because it's more authoritative. The search result is a duplicate.)

---

## Module 10: Security and Validation (1-2 hours)

### Theory: Input Validation at System Boundaries

```
TRUSTED (inside the application):
  - config.ts after parsing
  - client.ts after validation
  - hooks after sanitization

UNTRUSTED (system boundaries):
  - User config file           → validate in parseConfig()
  - User slash command input   → validate in handler
  - API responses              → type-narrow in client
  - Environment variables      → validate in resolveEnvVars()
```

### Code Reading: `lib/validate.js`

Even though it's minified, you can understand the functions through the
type declarations in `lib/validate.d.ts`:

1. **API key validation:** Must start with `sm_`, min 20 chars, no whitespace
2. **Container tag validation:** Alphanumeric + `_` + `-`, max 100 chars
3. **Content sanitization:** Strips control characters, BOM, truncates to 100KB
4. **Metadata sanitization:** Max 50 keys, key max 128 chars, value max 1024
5. **Request integrity:** HMAC-SHA256 signatures for tamper detection

### Exercise 10.1
Why does `sanitizeContent` strip control characters like `\x00-\x08`?
(Answer: Control characters can cause issues in databases, JSON parsing,
and display. They serve no purpose in memory content. Stripping them
prevents potential injection attacks and data corruption.)

### Exercise 10.2
The `getRequestIntegrity` function uses a hardcoded HMAC secret. What is
the security implication? (Answer: Since the secret is in the client-side
code, it's not truly secret. It provides integrity checking — detecting
accidental corruption — not authentication. Authentication is handled by
the API key in the Authorization header.)

---

## Module 11: Putting It All Together (3-4 hours)

### The Grand Exercise

You now understand every piece. Time to trace a COMPLETE interaction.

### Exercise 11.1: Full Trace

Trace everything that happens when a user sends this message in OpenClaw
with the Supermemory plugin active:

```
"I just switched from npm to pnpm for all my projects."
```

Write down:

1. What event fires? (`before_agent_start`)
2. What does the recall hook do? (calls getProfile with the prompt)
3. What API call is made? (POST to /profile with query = "I just switched...")
4. What comes back? (static facts, dynamic facts, matching memories)
5. What gets injected? (formatted context in `<supermemory-context>` tags)
6. How does the LLM use this? (sees the memory context in system prompt)
7. What event fires after? (`agent_end`)
8. What does the capture hook do? (extracts the last turn)
9. What gets stripped? (any previous `<supermemory-context>` blocks)
10. What gets sent to the cloud? (the formatted user+assistant turn)
11. What does the cloud extract? (fact: "Switched from npm to pnpm")
12. What happens to the profile? (updated: "Uses pnpm for all projects")

### Exercise 11.2: Build a Minimal Version

Using everything you've learned, build a MINIMAL version of this plugin
from scratch. It should:

1. Register one hook (`before_agent_start`) that logs "recall hook fired"
2. Register one hook (`agent_end`) that logs "capture hook fired"
3. Register one tool (`memory_search`) that returns "Not implemented yet"

This exercise proves you understand the plugin architecture, event system,
and tool registration.

### Exercise 11.3: Design a New Feature

Design (on paper, no code needed) a feature that adds "memory summarization":
- Every 100 turns, the plugin sends ALL memories to the cloud and asks for
  a condensed summary
- The summary replaces the individual memories
- This prevents memory bloat over time

Draw the data flow diagram, identify which files need changes, and describe
the new API calls needed.

---

## Module 12: Advanced Topics (Ongoing)

### Topic A: Vector Databases and Embeddings

The Supermemory cloud uses vector databases internally. Learn:
- What is a vector embedding?
- How does semantic similarity search work?
- What is cosine similarity?

Resources: Search for "vector database explained" or "embeddings for beginners"

### Topic B: Knowledge Graphs

The cloud also maintains a knowledge graph. Learn:
- What is a knowledge graph?
- What are triplets (subject-predicate-object)?
- Why does Supermemory use a custom graph instead of standard triplets?
  (Answer: as discussed in the podcast — standard triplet traversal is
  too slow for real-time queries)

### Topic C: LLM Tool Use Internals

How does the LLM actually "decide" to call a tool?
- Function calling / tool use in Claude and GPT
- The schema → prompt conversion
- How the LLM generates structured JSON for tool parameters

### Topic D: Plugin Security

- Never hardcode secrets in source code
- Environment variable injection patterns
- Content sanitization to prevent injection attacks
- Rate limiting and cost management

---

## Progress Tracker

Copy this checklist and check off items as you complete them:

```
[ ] Module 0:  Setup Your Lab
[ ] Module 1:  Understanding TypeScript
    [ ] Exercise 1.1: Define types
    [ ] Exercise 1.2: Find type casts
[ ] Module 2:  Understanding async/await
    [ ] Exercise 2.1: Find all async functions
    [ ] Exercise 2.2: Remove await thought experiment
[ ] Module 3:  The Plugin Architecture
    [ ] Exercise 3.1: Trace register() calls
    [ ] Exercise 3.2: Reorder thought experiment
    [ ] Exercise 3.3: Remove guard thought experiment
[ ] Module 4:  The Event System — Hooks
    [ ] Exercise 4.1: Trace turn numbers
    [ ] Exercise 4.2: Explain the regex
    [ ] Exercise 4.3: Explain getLastTurn
[ ] Module 5:  AI Tools
    [ ] Exercise 5.1: Compare four tools
    [ ] Exercise 5.2: Write a new tool
[ ] Module 6:  The API Client
    [ ] Exercise 6.1: Trace pagination
    [ ] Exercise 6.2: Explain single-delete
[ ] Module 7:  Configuration and Validation
    [ ] Exercise 7.1: Trace bad config
    [ ] Exercise 7.2: Trace partially bad config
[ ] Module 8:  The Command System
    [ ] Exercise 8.1: Count advanced options
    [ ] Exercise 8.2: Explain config merging
[ ] Module 9:  Memory Format and Context
    [ ] Exercise 9.1: Estimate token count
    [ ] Exercise 9.2: Explain dedup order
[ ] Module 10: Security and Validation
    [ ] Exercise 10.1: Explain sanitization
    [ ] Exercise 10.2: Evaluate HMAC security
[ ] Module 11: Putting It All Together
    [ ] Exercise 11.1: Full trace
    [ ] Exercise 11.2: Build minimal version
    [ ] Exercise 11.3: Design new feature
[ ] Module 12: Advanced Topics (ongoing)
```

---

## Congratulations

If you've completed Modules 0-11, you now understand:

- TypeScript and async programming
- Plugin architectures and event-driven design
- How AI memory systems work (hooks vs tools)
- How to read, modify, and extend this codebase
- Input validation and security patterns
- Configuration systems with environment variable resolution
- CLI and interactive command design

**You are ready to build your own AI memory systems.**
