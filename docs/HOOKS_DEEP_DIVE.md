# Deep Dive: How the Pre-Hook and Post-Hook Actually Work

> This document answers: How are relevant memories discovered? How is injection
> accomplished? How are new facts discovered? How are they stored "in the
> background"? What IS the background?

---

## Table of Contents

1. [The Two Hooks at a Glance](#1-the-two-hooks-at-a-glance)
2. [What "Hooks" Mean in This System](#2-what-hooks-mean-in-this-system)
3. [How Hooks Are Registered — The Wiring](#3-how-hooks-are-registered--the-wiring)
4. [PRE-HOOK: The Recall System](#4-pre-hook-the-recall-system)
   - 4.1 [What Triggers It](#41-what-triggers-it)
   - 4.2 [How Relevant Memories Are Discovered](#42-how-relevant-memories-are-discovered)
   - 4.3 [What Comes Back from the Cloud](#43-what-comes-back-from-the-cloud)
   - 4.4 [Deduplication — Preventing Repeats](#44-deduplication--preventing-repeats)
   - 4.5 [Formatting the Context Block](#45-formatting-the-context-block)
   - 4.6 [How Injection Is Accomplished](#46-how-injection-is-accomplished)
   - 4.7 [Profile Frequency — The Token Budget Trick](#47-profile-frequency--the-token-budget-trick)
   - 4.8 [Container Metadata Injection](#48-container-metadata-injection)
5. [POST-HOOK: The Capture System](#5-post-hook-the-capture-system)
   - 5.1 [What Triggers It](#51-what-triggers-it)
   - 5.2 [What "In the Background" Means](#52-what-in-the-background-means)
   - 5.3 [Extracting the Last Turn](#53-extracting-the-last-turn)
   - 5.4 [Message Content Parsing](#54-message-content-parsing)
   - 5.5 [The Context Stripping Problem](#55-the-context-stripping-problem)
   - 5.6 [How New Facts Are Discovered](#56-how-new-facts-are-discovered)
   - 5.7 [How Facts Are Stored](#57-how-facts-are-stored)
   - 5.8 [The Session Document Pattern](#58-the-session-document-pattern)
6. [The Full Cycle — Both Hooks Working Together](#6-the-full-cycle--both-hooks-working-together)
7. [Edge Cases and Guard Rails](#7-edge-cases-and-guard-rails)
8. [What the Cloud Does (The Other Half)](#8-what-the-cloud-does-the-other-half)

---

## 1. The Two Hooks at a Glance

```
USER MESSAGE
     |
     |  OpenClaw fires "before_agent_start"
     |
     v
+============================+
|  PRE-HOOK (recall.ts)      |  <--- "How are memories discovered and injected?"
|                            |
|  1. Take user's prompt     |
|  2. Send it to cloud as    |
|     a search query          |
|  3. Cloud returns profile  |
|     + matching memories    |
|  4. Format into XML block  |
|  5. Return to OpenClaw as  |
|     { prependContext: ... } |
+============================+
     |
     v
  OpenClaw prepends context to system prompt
  LLM generates response WITH memory context
     |
     |  OpenClaw fires "agent_end"
     |
     v
+============================+
|  POST-HOOK (capture.ts)    |  <--- "How are facts discovered and stored?"
|                            |
|  1. Extract last turn      |
|     (user msg + AI reply)  |
|  2. Strip injected context |
|  3. Format as role-tagged  |
|     text blocks            |
|  4. Send to cloud with     |
|     extraction instructions|
|  5. Cloud's AI extracts    |
|     facts asynchronously   |
+============================+
     |
     v
  User sees AI response (capture happens in parallel)
```

---

## 2. What "Hooks" Mean in This System

A hook is a **function that OpenClaw calls for you** at a specific point in
the request lifecycle. You don't call it — you register it, and the host
fires it.

Think of it like a callback in C:

```c
// C callback pattern:
void on_button_click(void (*callback)(Event*));

// This plugin's equivalent in TypeScript:
api.on("before_agent_start", myHandler)
```

OpenClaw has two hook points:

```
+------------------------------------------------------------------+
|                     OpenClaw Request Lifecycle                     |
|                                                                   |
|  User message arrives                                             |
|       |                                                           |
|       v                                                           |
|  +---------------------------+                                    |
|  | HOOK POINT 1:             |  <-- "before_agent_start"          |
|  | "before_agent_start"      |      Plugins can MODIFY the        |
|  |                           |      request before the LLM sees   |
|  | Receives:                 |      it. Return value is merged    |
|  |   event.prompt  (string)  |      into the request.             |
|  |   event.messages (array)  |                                    |
|  |   ctx.sessionKey (string) |                                    |
|  |   ctx.messageProvider     |                                    |
|  |                           |                                    |
|  | Can return:               |                                    |
|  |   { prependContext: str } |  <-- THIS is how injection works   |
|  |   (or nothing)            |                                    |
|  +---------------------------+                                    |
|       |                                                           |
|       v                                                           |
|  LLM inference (with any prepended context)                       |
|       |                                                           |
|       v                                                           |
|  +---------------------------+                                    |
|  | HOOK POINT 2:             |  <-- "agent_end"                   |
|  | "agent_end"               |      Plugins can REACT to the      |
|  |                           |      completed turn. Return value   |
|  | Receives:                 |      is ignored by OpenClaw.        |
|  |   event.success (boolean) |                                    |
|  |   event.messages (array)  |                                    |
|  |   ctx.messageProvider     |                                    |
|  |                           |                                    |
|  | Return value: ignored     |  <-- This is what "background"     |
|  +---------------------------+      means — fire and forget        |
|       |                                                           |
|       v                                                           |
|  Response displayed to user                                       |
+------------------------------------------------------------------+
```

---

## 3. How Hooks Are Registered — The Wiring

The wiring happens in `index.ts` lines 46-59. Let me trace it precisely:

```typescript
// index.ts lines 46-55
if (cfg.autoRecall) {
    const recallHandler = buildRecallHandler(client, cfg)    // [A]
    api.on(
        "before_agent_start",                                 // [B]
        (event, ctx) => {                                     // [C]
            if (ctx.sessionKey) sessionKey = ctx.sessionKey    // [D]
            return recallHandler(event, ctx)                   // [E]
        },
    )
}

// index.ts lines 57-59
if (cfg.autoCapture) {
    api.on("agent_end", buildCaptureHandler(client, cfg, getSessionKey))  // [F]
}
```

What each line does:

```
[A] buildRecallHandler(client, cfg)
    Creates a CLOSURE — a function that remembers 'client' and 'cfg'
    even after buildRecallHandler returns. The returned function is
    the actual handler that runs on every turn.

[B] "before_agent_start"
    The event name. OpenClaw fires this BEFORE sending anything to the LLM.

[C] (event, ctx) => { ... }
    A wrapper function that OpenClaw will call. It receives two objects:
      event = { prompt: "user's message", messages: [...conversation...] }
      ctx   = { sessionKey: "abc123", messageProvider: "cli" }

[D] if (ctx.sessionKey) sessionKey = ctx.sessionKey
    Captures the session key into a module-level variable. This is how
    the capture hook (which runs later) knows which session it's in.
    The session key is like a conversation ID.

[E] return recallHandler(event, ctx)
    Delegates to the actual recall logic. The return value
    { prependContext: "..." } goes back to OpenClaw.

[F] buildCaptureHandler(client, cfg, getSessionKey)
    Creates and registers the capture hook. getSessionKey is a function
    (not a value) — it reads the session key that was captured in [D].
```

### The Closure Pattern Visualized

```
buildRecallHandler(client, cfg) is called ONCE at startup
       |
       |  Returns a function (the handler)
       |
       v
handler = async (event, ctx) => {
    // 'client' and 'cfg' are CAPTURED from the outer scope
    // They persist in memory as long as the handler exists
    // Every time OpenClaw fires "before_agent_start",
    // this handler runs with access to the same client/cfg
    await client.getProfile(event.prompt)
    //    ^^^^^^ this 'client' was captured at registration time
}

Turn 1:  OpenClaw calls handler(event1, ctx1) --> uses captured client
Turn 2:  OpenClaw calls handler(event2, ctx2) --> uses SAME captured client
Turn 3:  OpenClaw calls handler(event3, ctx3) --> uses SAME captured client
```

### The Session Key Relay

The pre-hook and post-hook need to share a session key, but they're separate
functions. The solution is a shared mutable variable:

```
index.ts (module scope):
  let sessionKey: string | undefined           // shared variable
  const getSessionKey = () => sessionKey       // getter function

Pre-hook wrapper [D]:
  if (ctx.sessionKey) sessionKey = ctx.sessionKey   // WRITES to shared var

Post-hook (via getSessionKey):
  const sk = getSessionKey()                        // READS from shared var
  const customId = sk ? buildDocumentId(sk) : undefined

Timeline:
  before_agent_start fires --> pre-hook writes sessionKey = "abc123"
  agent_end fires          --> post-hook reads  sessionKey --> "abc123"
```

---

## 4. PRE-HOOK: The Recall System

### 4.1 What Triggers It

Every time a user sends a message, OpenClaw fires `"before_agent_start"` and
calls the recall handler. The handler receives:

```typescript
event = {
    prompt: "I need to make an HTTP request in my script",  // current message
    messages: [                                              // full history
        { role: "user", content: "..." },
        { role: "assistant", content: "..." },
        { role: "user", content: "I need to make an HTTP request..." },
    ]
}
ctx = {
    sessionKey: "sess_abc123",       // unique conversation ID
    messageProvider: "cli"           // where the message came from
}
```

### 4.2 How Relevant Memories Are Discovered

This is the core question. The answer involves three layers:

```
Layer 1: This Plugin (recall.ts line 184)
  |
  |  client.getProfile(prompt)
  |  Sends the user's CURRENT MESSAGE as a search query
  |
  v
Layer 2: SupermemoryClient (client.ts lines 119-147)
  |
  |  this.client.profile({
  |      containerTag: "openclaw_DESKTOP_ABC",
  |      q: "I need to make an HTTP request in my script"
  |  })
  |
  |  Calls the Supermemory SDK's .profile() method
  |  which makes an HTTPS POST to the Supermemory Cloud API
  |
  v
Layer 3: Supermemory Cloud (external service)
  |
  |  The cloud does THREE things simultaneously:
  |
  |  [a] PROFILE LOOKUP
  |      Retrieves the pre-built user profile for this containerTag.
  |      The profile has two parts:
  |        static:  ["Uses Python", "Prefers requests library", ...]
  |        dynamic: ["Working on a web scraper", ...]
  |      This profile was built over time from ALL previous captures.
  |
  |  [b] SEMANTIC VECTOR SEARCH
  |      Takes the query "I need to make an HTTP request in my script"
  |      Converts it into a vector embedding (a list of ~1536 numbers)
  |      Searches the vector database for memories with similar embeddings
  |      Returns the top N matches ranked by cosine similarity
  |
  |      Example: the query about "HTTP request" has high similarity to
  |      a stored memory "User prefers requests over httpx" because
  |      the embeddings of "HTTP request" and "requests library" are
  |      close in vector space.
  |
  |  [c] RESULT ASSEMBLY
  |      Combines profile + search results into one response
  |
  v
Response travels back through all three layers
```

### The Semantic Search Explained

This is how "relevant" memories are found WITHOUT keyword matching:

```
Traditional keyword search:
  Query: "HTTP request"
  Stored: "User prefers requests over httpx"
  Match?  YES — "request" appears in both (lucky coincidence)

  Query: "What monitor should I buy?"
  Stored: "User is a CEO who codes all day"
  Match?  NO — no words in common (FAILS)


Semantic vector search (what Supermemory uses):
  Query: "HTTP request"
  --> embedding: [0.12, -0.45, 0.78, 0.33, ...]  (1536 dimensions)

  Stored: "User prefers requests over httpx"
  --> embedding: [0.14, -0.41, 0.75, 0.30, ...]

  Cosine similarity: 0.94 (very high!) --> MATCH

  Query: "What monitor should I buy?"
  --> embedding: [0.55, 0.22, -0.11, 0.67, ...]

  Stored: "User is a CEO who codes all day"
  --> embedding: [0.48, 0.19, -0.08, 0.59, ...]

  Cosine similarity: 0.71 (moderate) --> MATCH (context is relevant!)
```

The vector embedding captures MEANING, not words. That's why the cloud can
find that a CEO who codes all day might want a coding monitor — even though
the user never mentioned monitors before.

### 4.3 What Comes Back from the Cloud

The `client.getProfile()` call (client.ts lines 119-147) returns a
`ProfileResult` with three arrays:

```typescript
// client.ts lines 25-29
export type ProfileResult = {
    static: string[]                    // persistent facts
    dynamic: string[]                   // recent context
    searchResults: ProfileSearchResult[] // query-matched memories
}

// client.ts lines 18-23
export type ProfileSearchResult = {
    memory?: string       // the extracted fact text
    updatedAt?: string    // ISO timestamp of last update
    similarity?: number   // 0.0 to 1.0 (cosine similarity)
}
```

Example concrete response:

```
profile.static = [
    "Works at Acme Corp",
    "Prefers Python for scripting",
    "Uses VS Code",
    "Prefers requests over httpx"
]

profile.dynamic = [
    "Building a web scraper with Beautiful Soup",
    "Deadline is March 31st"
]

profile.searchResults = [
    {
        memory: "Prefers requests over httpx for simple scripts",
        updatedAt: "2026-03-07T14:22:00Z",
        similarity: 0.94
    },
    {
        memory: "Working on a Python web scraper",
        updatedAt: "2026-03-08T09:15:00Z",
        similarity: 0.82
    },
    {
        memory: "Used urllib3 in a previous project but switched away",
        updatedAt: "2026-02-20T11:00:00Z",
        similarity: 0.71
    }
]
```

### 4.4 Deduplication — Preventing Repeats

Notice the problem: "Prefers requests over httpx" appears in BOTH the static
profile AND the search results. If we inject both, the LLM sees it twice.

The `deduplicateMemories` function (recall.ts lines 29-64) solves this:

```
Input:
  static:  ["Works at Acme", "Prefers requests over httpx"]
  dynamic: ["Building a web scraper"]
  search:  [{memory: "Prefers requests over httpx", sim: 0.94},
            {memory: "Working on a Python web scraper", sim: 0.82}]

Algorithm:
  seen = Set()

  Process STATIC first (highest priority):
    "Works at Acme"              -> not in seen -> KEEP, add to seen
    "Prefers requests over httpx" -> not in seen -> KEEP, add to seen

  Process DYNAMIC second:
    "Building a web scraper"     -> not in seen -> KEEP, add to seen

  Process SEARCH last (lowest priority):
    "Prefers requests over httpx" -> IN seen!   -> SKIP (duplicate!)
    "Working on a Python web scraper" -> not in seen -> KEEP

Output:
  static:  ["Works at Acme", "Prefers requests over httpx"]
  dynamic: ["Building a web scraper"]
  search:  [{memory: "Working on a Python web scraper", sim: 0.82}]
```

```
Priority order: STATIC > DYNAMIC > SEARCH

Why this order?
  Static facts are the most authoritative (profile-level truth).
  If a fact appears in search results AND the profile, we keep
  the profile version and drop the search result to save tokens.
```

### 4.5 Formatting the Context Block

The `formatContext` function (recall.ts lines 66-115) assembles the final
text block. Here is the exact output structure:

```
<supermemory-context>                              <-- XML open tag
The following is background context about the      <-- intro paragraph
user from long-term memory. Use this context         (tells AI how to
silently to inform your understanding — only          use these memories)
reference it when the user's message is directly
related to something in these memories.

## User Profile (Persistent)                       <-- section 1 (static)
- Works at Acme Corp                                  (only on profile
- Prefers requests over httpx                          turns — see 4.7)

## Recent Context                                  <-- section 2 (dynamic)
- Building a web scraper with Beautiful Soup          (only on profile
                                                       turns — see 4.7)

## Relevant Memories (with relevance %)            <-- section 3 (search)
- [2d ago]Working on a Python web scraper [82%]       (EVERY turn)
- [17d ago]Used urllib3 but switched away [71%]

Do not proactively bring up memories. Only use     <-- disclaimer
them when the conversation naturally calls for it.    (prevents AI from
</supermemory-context>                                 randomly citing
                                                       memories)
```

Each search result line is formatted as (recall.ts lines 96-103):

```
- [TIME_AGO]MEMORY_TEXT [SIMILARITY%]

Where:
  TIME_AGO = formatRelativeTime(updatedAt)
    < 30 min       -> "just now"
    < 60 min       -> "42mins ago"
    < 24 hours     -> "7 hrs ago"
    < 7 days       -> "2d ago"
    same year      -> "15 Mar"
    different year -> "15 Mar, 2025"

  SIMILARITY% = Math.round(similarity * 100)
    0.94 -> [94%]
    0.71 -> [71%]
```

### 4.6 How Injection Is Accomplished

This is the critical mechanism. The recall handler RETURNS an object to OpenClaw:

```typescript
// recall.ts line 211
return { prependContext: finalContext }
```

OpenClaw receives this return value and **prepends** the `finalContext` string
to the system prompt BEFORE sending it to the LLM.

```
What the LLM sees (conceptually):

+------------------------------------------------------------------+
| SYSTEM PROMPT                                                     |
|                                                                   |
| <supermemory-context>                                             |
| The following is background context about the user...             |
| ## User Profile (Persistent)                                      |
| - Works at Acme Corp                                              |
| - Prefers requests over httpx                                     |
| ## Relevant Memories (with relevance %)                           |
| - [2d ago]Working on a Python web scraper [82%]                   |
| Do not proactively bring up memories...                           |
| </supermemory-context>                                            |
|                                                                   |
| [OpenClaw's original system prompt continues here...]             |
| You are an AI coding assistant...                                 |
+------------------------------------------------------------------+
| USER MESSAGE                                                      |
| I need to make an HTTP request in my script                       |
+------------------------------------------------------------------+
```

The LLM now has BOTH the memory context AND the user's message. It can
generate a response that uses the memory context:

```
"Since you prefer using the `requests` library over httpx,
 here's how to make an HTTP request in your web scraper..."
```

The user never said "use requests" — the AI knew because the memory
was injected.

### The Injection Mechanism in Detail

```
recall handler                OpenClaw Engine              LLM
     |                              |                       |
     |  return {                    |                       |
     |    prependContext:           |                       |
     |    "<supermemory-context>   |                       |
     |     ..."                    |                       |
     |  }                          |                       |
     |----------------------------->                       |
     |                              |                       |
     |                     Takes the returned string        |
     |                     Prepends it to system prompt     |
     |                     system_prompt =                  |
     |                       prependContext + "\n" +        |
     |                       original_system_prompt         |
     |                              |                       |
     |                              |  POST /v1/messages    |
     |                              |  {                    |
     |                              |    system: [modified],|
     |                              |    messages: [...]    |
     |                              |  }                    |
     |                              |---------------------->|
     |                              |                       |
     |                              |  LLM generates with   |
     |                              |  full memory context  |
     |                              |<----------------------|
```

### 4.7 Profile Frequency — The Token Budget Trick

Not every turn includes the full profile. The logic (recall.ts line 178):

```typescript
const includeProfile = turn <= 1 || turn % cfg.profileFrequency === 0
```

Then (recall.ts lines 185-189):

```typescript
const memoryContext = formatContext(
    includeProfile ? profile.static : [],    // empty array = skip
    includeProfile ? profile.dynamic : [],   // empty array = skip
    profile.searchResults,                   // ALWAYS included
    cfg.maxRecallResults,
)
```

Visualized with `profileFrequency = 50`:

```
Turn  1: [STATIC + DYNAMIC + SEARCH]  Full profile (first turn)
Turn  2: [                   SEARCH]  Search only
Turn  3: [                   SEARCH]  Search only
...
Turn 49: [                   SEARCH]  Search only
Turn 50: [STATIC + DYNAMIC + SEARCH]  Full profile refresh
Turn 51: [                   SEARCH]  Search only
...
Turn 99: [                   SEARCH]  Search only
Turn 100:[STATIC + DYNAMIC + SEARCH]  Full profile refresh
```

Why? Token budget:

```
Full injection:     ~600-1500 tokens (profile + search)
Search-only:        ~200-600 tokens  (just search results)

Over 100 turns with profileFrequency=50:
  2 full turns * 1000 tokens = 2,000 tokens
  98 search turns * 400 tokens = 39,200 tokens
  Total: 41,200 tokens

Without frequency (every turn is full):
  100 turns * 1000 tokens = 100,000 tokens
  Total: 100,000 tokens

Savings: ~59% fewer tokens spent on memory
```

The search results change every turn (because the query changes with each
new user message), but the profile is relatively stable — it doesn't need
to be re-injected on every single turn.

### 4.8 Container Metadata Injection

When custom containers are enabled, a SECOND XML block is injected
(recall.ts lines 192-200):

```
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

This tells the LLM which containers exist so it can route memories when
using the store/search/forget tools.

---

## 5. POST-HOOK: The Capture System

### 5.1 What Triggers It

After the LLM finishes generating a response, OpenClaw fires `"agent_end"`.
The capture handler receives:

```typescript
event = {
    success: true,                           // did inference succeed?
    messages: [                              // FULL conversation including
        { role: "user", content: "..." },    // the response just generated
        { role: "assistant", content: "..." },
        { role: "user", content: "I need to make an HTTP request..." },
        { role: "assistant", content: "Since you prefer requests..." },
    ]
}
ctx = {
    messageProvider: "cli"                   // source of the message
}
```

### 5.2 What "In the Background" Means

This is a critical concept. There are TWO kinds of "background" at play:

```
BACKGROUND TYPE 1: The hook itself runs AFTER the response is displayed
==============================================================================

Timeline:

  t=0.0s  User sends message
  t=0.1s  Pre-hook fires, fetches memories (BLOCKS — user waits)
  t=0.2s  Memory context injected
  t=0.3s  LLM starts generating response
  t=2.5s  LLM finishes, response displayed to user
  t=2.5s  Post-hook fires                     <--- "in the background"
  t=2.6s  Post-hook sends content to cloud     |   The user ALREADY
  t=2.7s  Cloud acknowledges receipt           |   sees the response.
  t=2.7s  Post-hook completes                  |   They are NOT waiting.

The post-hook does NOT block the user. OpenClaw fires the "agent_end"
event and the user can already read the response and type their next
message. The hook runs concurrently.


BACKGROUND TYPE 2: The cloud extracts facts ASYNCHRONOUSLY
==============================================================================

Timeline (continues from above):

  t=2.6s  Cloud receives the raw conversation text
  t=2.6s  Cloud acknowledges "got it" (the API call returns here)
  t=2.6s  Plugin is DONE. It moves on.

  Meanwhile, on the cloud side:
  t=2.7s  Cloud queues the content for extraction
  t=3.0s  Cloud's extraction AI reads the conversation
  t=3.5s  Cloud's AI identifies: "User needs HTTP requests"
          But this is a one-time task — DEFAULT_ENTITY_CONTEXT
          says DO NOT REMEMBER temporary intents.
  t=3.6s  Cloud's AI identifies: no new lasting facts in this turn
  t=3.7s  Cloud finishes. No new memories stored this turn.

  OR, if the conversation contained a lasting fact:
  t=3.5s  Cloud's AI identifies: "User says they switched to Bun"
  t=3.6s  Cloud checks existing knowledge graph
  t=3.7s  Cloud updates profile: "Uses Bun" (replaces "Uses npm")
  t=4.0s  Cloud finishes. Profile updated.
```

The key insight: **the plugin's job ends when the cloud acknowledges receipt**.
All the intelligent extraction happens on the cloud side, asynchronously,
without the plugin waiting for it.

```
Plugin's responsibility:         Cloud's responsibility:
========================         =======================

Collect the conversation turn    Parse the conversation
Strip out injected context       Identify lasting facts
Format it properly               Check for contradictions
Send it to the cloud API         Update knowledge graph
Log success or failure           Rebuild user profile
                                 Index in vector DB
  (FAST: ~100ms)                   (SLOW: 1-5 seconds)
```

### 5.3 Extracting the Last Turn

The capture hook does NOT send the entire conversation history. It only sends
the LAST turn — the most recent user message and the AI's response to it.

The `getLastTurn` function (capture.ts lines 8-22):

```typescript
function getLastTurn(messages: unknown[]): unknown[] {
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
        if (msg.role === "user") {
            lastUserIdx = i
            break
        }
    }
    return lastUserIdx >= 0 ? messages.slice(lastUserIdx) : messages
}
```

Visualized:

```
Full message history:
  [0] { role: "user",      content: "Hello, I work at Acme" }
  [1] { role: "assistant", content: "Nice to meet you!" }
  [2] { role: "user",      content: "I prefer dark mode" }
  [3] { role: "assistant", content: "Noted! I'll keep that in mind." }
  [4] { role: "user",      content: "Make an HTTP request" }    <-- lastUserIdx = 4
  [5] { role: "assistant", content: "Since you prefer requests..." }

getLastTurn returns: messages.slice(4) = [
  [4] { role: "user",      content: "Make an HTTP request" }
  [5] { role: "assistant", content: "Since you prefer requests..." }
]
```

Why only the last turn?
1. Previous turns were already captured in previous hook invocations
2. Sending everything would waste cloud tokens and money
3. The cloud handles deduplication anyway, but less data = faster extraction

### 5.4 Message Content Parsing

LLM messages have two possible content formats. The hook handles both
(capture.ts lines 57-71):

```
Format A: Simple string
  { role: "user", content: "I need to make an HTTP request" }
  --> parts = ["I need to make an HTTP request"]

Format B: Array of content blocks (multimodal messages)
  { role: "assistant", content: [
      { type: "text", text: "Here's how to do it:" },
      { type: "tool_use", id: "...", name: "..." },
      { type: "text", text: "I've created the file." }
  ]}
  --> Only extract type="text" blocks
  --> parts = ["Here's how to do it:", "I've created the file."]
  --> Tool use blocks are ignored (not textual content)
```

After extracting text parts, they're wrapped in role tags (capture.ts line 74):

```
[role: user]
I need to make an HTTP request in my script
[user:end]

[role: assistant]
Since you prefer using the requests library over httpx,
here's how to make an HTTP request:
...
[assistant:end]
```

These role tags match the format described in `DEFAULT_ENTITY_CONTEXT`
(memory.ts line 21):

```
"User-assistant conversation. Format: [role: user]...[user:end]
 and [role: assistant]...[assistant:end]."
```

This tells the cloud's extraction AI how to parse the text and which
role said what — critical for avoiding false attributions like "the user
wrote a Python script" when actually the assistant did.

### 5.5 The Context Stripping Problem

Here's a subtle but important problem. On turn N, the pre-hook injected
memories into the system prompt. The LLM saw those memories. Now on the
same turn, the capture hook collects the messages — and the user's message
might CONTAIN the injected memory context (because OpenClaw may include it
in the message array).

If we sent this to the cloud, the cloud would re-extract the same facts
that were ALREADY in the profile, creating a feedback loop:

```
WITHOUT STRIPPING (broken):

Turn 1: User says "I like Python"
  --> Cloud extracts: "User likes Python"
  --> Profile updated

Turn 2: Pre-hook injects: "User likes Python"
  --> User says "Help me with JavaScript"
  --> Capture hook sends: "[context: User likes Python] Help me with JavaScript"
  --> Cloud sees "User likes Python" AGAIN
  --> Cloud re-processes it (wasted work, possible duplication)

Turn 3: Pre-hook injects: "User likes Python" (appears twice now?)
  --> ... the problem compounds
```

The fix (capture.ts lines 78-94):

```typescript
const captured =
    cfg.captureMode === "all"
        ? texts
                .map((t) =>
                    t
                        .replace(
                            /<supermemory-context>[\s\S]*?<\/supermemory-context>\s*/g,
                            "",
                        )
                        .replace(
                            /<supermemory-containers>[\s\S]*?<\/supermemory-containers>\s*/g,
                            "",
                        )
                        .trim(),
                )
                .filter((t) => t.length >= 10)
        : texts
```

```
The regex /<supermemory-context>[\s\S]*?<\/supermemory-context>\s*/g

Breakdown:
  <supermemory-context>    Match the opening tag literally
  [\s\S]*?                 Match ANY character (including newlines),
                           as FEW as possible (non-greedy)
  <\/supermemory-context>  Match the closing tag (\ escapes the /)
  \s*                      Eat any trailing whitespace
  /g                       Global — match ALL occurrences

This strips out the ENTIRE injected context block:

Before: "[role: user]\n<supermemory-context>...long block...</supermemory-context>\nHelp me with JavaScript\n[user:end]"

After:  "[role: user]\nHelp me with JavaScript\n[user:end]"
```

The `.filter((t) => t.length >= 10)` at the end removes any messages that
became effectively empty after stripping (e.g., if a user's only content
was the injected context).

### 5.6 How New Facts Are Discovered

The plugin itself does NOT extract facts. It sends the raw conversation text
to the cloud, along with **extraction instructions** — the `entityContext`.

```typescript
// capture.ts lines 107-113
await client.addMemory(
    content,                                    // the formatted turn text
    { source: "openclaw", timestamp: ... },     // metadata
    customId,                                   // session document ID
    undefined,                                  // default container
    cfg.entityContext,                           // EXTRACTION INSTRUCTIONS
)
```

The `entityContext` is the `DEFAULT_ENTITY_CONTEXT` from memory.ts (unless
the user overrides it). It's a PROMPT that tells the cloud's extraction AI
what to remember and what to ignore:

```
+----------------------------------------------------------------------+
|  DEFAULT_ENTITY_CONTEXT (sent with every capture)                    |
|                                                                      |
|  "User-assistant conversation. Format: [role: user]...[user:end]     |
|   and [role: assistant]...[assistant:end].                           |
|                                                                      |
|   Only extract things useful in FUTURE conversations.                |
|   Most messages are not worth remembering.                           |
|                                                                      |
|   REMEMBER: lasting personal facts — dietary restrictions,           |
|     preferences, personal details, workplace, location, tools,       |
|     ongoing projects, routines, explicit 'remember this' requests.   |
|                                                                      |
|   DO NOT REMEMBER: temporary intents, one-time tasks, assistant      |
|     actions (searching, writing files, generating code), assistant   |
|     suggestions, implementation details, in-progress task status.    |
|                                                                      |
|   RULES:                                                             |
|   - Assistant output is CONTEXT ONLY — never attribute assistant     |
|     actions to the user                                              |
|   - 'find X' or 'do Y' = one-time request, NOT a memory             |
|   - Only store preferences explicitly stated                         |
|   - When in doubt, do NOT create a memory. Less is more."           |
+----------------------------------------------------------------------+
```

The cloud receives this context + the conversation text and runs its own
LLM to extract facts. Here's what happens on the cloud side:

```
Cloud receives:
  content = "[role: user]\nI just switched from npm to pnpm for all my
             projects.\n[user:end]\n\n[role: assistant]\nGreat choice!
             pnpm is faster and more disk-efficient...\n[assistant:end]"

  entityContext = "Only extract things useful in FUTURE conversations..."

Cloud's extraction AI processes:
  Input:  conversation text + extraction instructions
  Thinks: "The user explicitly stated they switched to pnpm."
          "This is a lasting tool preference."
          "The assistant's response is context only — don't attribute."
  Output: Extract fact: "Uses pnpm instead of npm for all projects"

Cloud's knowledge graph engine:
  Checks: Does an existing fact conflict?
  Found:  "Uses npm for package management"
  Action: OVERWRITE old fact with new fact
          Old: "Uses npm for package management" --> DELETED
          New: "Uses pnpm instead of npm for all projects" --> STORED

Cloud's profile builder:
  Updates static profile to include: "Uses pnpm"
  Removes: "Uses npm"
```

### 5.7 How Facts Are Stored

The `client.addMemory` call (client.ts lines 55-86) sends content to the
Supermemory SDK:

```typescript
const result = await this.client.add({
    content: cleaned,            // sanitized conversation text
    containerTag: tag,           // namespace (e.g., "openclaw_DESKTOP_ABC")
    metadata: {                  // additional data for filtering
        source: "openclaw",
        timestamp: "2026-03-09T14:22:00.000Z"
    },
    customId: "session_abc123",  // session-based document ID
    entityContext: "Only extract things useful in FUTURE..."
})
```

What happens with this data on the cloud:

```
+-----------------------------------------------------------------------+
|  Supermemory Cloud Processing Pipeline                                |
|                                                                       |
|  1. RECEIVE content + entityContext                                    |
|       |                                                               |
|       v                                                               |
|  2. EXTRACT facts using extraction AI + entityContext as instructions  |
|       |                                                               |
|       | produces: ["Uses pnpm instead of npm"]                        |
|       v                                                               |
|  3. EMBED each extracted fact into a vector (1536 dimensions)         |
|       |                                                               |
|       v                                                               |
|  4. STORE vectors in vector database (indexed by containerTag)        |
|       |                                                               |
|       v                                                               |
|  5. UPDATE knowledge graph                                            |
|       |                                                               |
|       | checks for contradictions:                                    |
|       |   "Uses npm" contradicts "Uses pnpm"                          |
|       |   --> old fact replaced                                       |
|       v                                                               |
|  6. REBUILD user profile                                              |
|       |                                                               |
|       | static: add "Uses pnpm", remove "Uses npm"                    |
|       | dynamic: update recent context if applicable                  |
|       v                                                               |
|  7. DONE — next recall will return updated profile                    |
+-----------------------------------------------------------------------+
```

### 5.8 The Session Document Pattern

The `customId` parameter uses a session-based document ID:

```typescript
// memory.ts lines 40-46
export function buildDocumentId(sessionKey: string): string {
    const sanitized = sessionKey
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
    return `session_${sanitized}`
}
```

Example: sessionKey `"sess-abc-123"` → customId `"session_sess_abc_123"`

Why a custom ID? Because of **idempotency**:

```
Scenario WITHOUT customId:
  Turn 1 capture: cloud stores document X
  Turn 2 capture: cloud stores document Y
  Turn 3 capture: cloud stores document Z
  ... every turn creates a NEW document

Scenario WITH customId = "session_abc123":
  Turn 1 capture: cloud stores/creates document "session_abc123"
  Turn 2 capture: cloud UPDATES document "session_abc123"
  Turn 3 capture: cloud UPDATES document "session_abc123"
  ... all turns in the same session update the SAME document

This means: one document per session, updated on each turn.
The cloud sees the cumulative conversation, not individual turns.
It can extract better facts from the full context.
```

---

## 6. The Full Cycle — Both Hooks Working Together

Here's a complete trace of two consecutive turns:

```
=== SESSION START: sessionKey = "sess_001" ===

TURN 1: User says "I just switched from npm to pnpm"
------------------------------------------------------------------------

  1. OpenClaw fires "before_agent_start"
     event.prompt = "I just switched from npm to pnpm"
     ctx.sessionKey = "sess_001"

  2. Pre-hook wrapper captures sessionKey = "sess_001"

  3. Pre-hook calls client.getProfile("I just switched from npm to pnpm")
       --> HTTPS POST to Supermemory Cloud
       <-- Returns:
           static: ["Uses npm", "Prefers TypeScript"]
           dynamic: []
           searchResults: [
             {memory: "Uses npm for package management", similarity: 0.88}
           ]

  4. Turn count = 1, so includeProfile = true (turn <= 1)

  5. Deduplication:
       static has "Uses npm"
       search has "Uses npm for package management"
       These are DIFFERENT strings, so both survive dedup

  6. formatContext produces:
       <supermemory-context>
       ...
       ## User Profile (Persistent)
       - Uses npm
       - Prefers TypeScript

       ## Relevant Memories (with relevance %)
       - [3d ago]Uses npm for package management [88%]
       ...
       </supermemory-context>

  7. Pre-hook returns { prependContext: "<supermemory-context>..." }

  8. OpenClaw prepends context to system prompt

  9. LLM generates: "Great choice! pnpm is faster..."

  10. OpenClaw fires "agent_end"
      event.success = true
      event.messages = [full conversation]

  11. Post-hook extracts last turn:
        [role: user]
        I just switched from npm to pnpm
        [user:end]

        [role: assistant]
        Great choice! pnpm is faster...
        [assistant:end]

  12. captureMode = "all": strip <supermemory-context> blocks
      (In this case the user message doesn't contain them, so no change)

  13. Post-hook calls client.addMemory(content, metadata,
        customId="session_sess_001", entityContext=DEFAULT_ENTITY_CONTEXT)
        --> HTTPS POST to Supermemory Cloud

  14. Cloud acknowledges. Plugin is done.

  15. Cloud (async): extracts "User switched from npm to pnpm"
      Updates knowledge graph: "Uses npm" --> "Uses pnpm"
      Rebuilds profile: static now includes "Uses pnpm" instead of "Uses npm"

------------------------------------------------------------------------

TURN 2: User says "Set up a new Node.js project for me"
------------------------------------------------------------------------

  1. OpenClaw fires "before_agent_start"
     event.prompt = "Set up a new Node.js project for me"

  2. Pre-hook calls client.getProfile("Set up a new Node.js project")
       --> HTTPS POST to Supermemory Cloud
       <-- Returns:
           static: ["Uses pnpm", "Prefers TypeScript"]    <-- UPDATED!
           dynamic: ["Recently switched from npm to pnpm"]
           searchResults: [
             {memory: "Uses pnpm instead of npm", similarity: 0.91}
           ]

  3. Turn count = 2, profileFrequency = 50
     includeProfile = (2 <= 1) = false, (2 % 50 == 0) = false
     includeProfile = FALSE

  4. formatContext with empty static + empty dynamic + search results:
       <supermemory-context>
       ...
       ## Relevant Memories (with relevance %)
       - [just now]Uses pnpm instead of npm [91%]
       ...
       </supermemory-context>

  5. LLM generates: "Setting up with pnpm as your package manager..."
     (It knew to use pnpm from the search result!)

  6. Post-hook captures and sends to cloud (same pattern as above)

------------------------------------------------------------------------
```

---

## 7. Edge Cases and Guard Rails

### Guard 1: Tiny Messages

```typescript
// recall.ts line 174
if (!prompt || prompt.length < 5) return
```

Messages shorter than 5 characters (like "ok" or "y") are skipped entirely.
They're too short to be meaningful search queries.

### Guard 2: System Events

```typescript
// capture.ts lines 6, 37-39
const SKIPPED_PROVIDERS = ["exec-event", "cron-event", "heartbeat"]
if (SKIPPED_PROVIDERS.includes(provider)) return
```

OpenClaw fires `agent_end` for internal system events too. These are not
real conversations and should not be captured.

### Guard 3: Failed Turns

```typescript
// capture.ts lines 41-46
if (!event.success || !Array.isArray(event.messages) || event.messages.length === 0)
    return
```

If the LLM failed to generate a response, don't capture garbage.

### Guard 4: Short Captured Text

```typescript
// capture.ts line 93
.filter((t) => t.length >= 10)
```

After stripping context blocks, if a message has fewer than 10 characters,
skip it. It's noise.

### Guard 5: API Errors

```typescript
// recall.ts lines 212-215
} catch (err) {
    log.error("recall failed", err)
    return   // return nothing = no context injected, conversation continues
}

// capture.ts lines 114-116
} catch (err) {
    log.error("capture failed", err)
    // no return value needed — post-hook return is ignored anyway
}
```

Both hooks swallow errors. Memory is a NICE-TO-HAVE, not a requirement.
A network error, API outage, or malformed response should never crash the
user's conversation.

### Guard 6: Entity Context Clamping

```typescript
// memory.ts lines 35-38
export function clampEntityContext(ctx: string): string {
    if (ctx.length <= MAX_ENTITY_CONTEXT_LENGTH) return ctx  // 1500 chars
    return ctx.slice(0, MAX_ENTITY_CONTEXT_LENGTH)
}
```

User-provided entity context is truncated to 1500 characters to prevent
abuse or accidental massive payloads.

### Guard 7: Content Sanitization

```typescript
// client.ts line 62
const cleaned = sanitizeContent(content)
```

Every piece of content sent to the cloud passes through `sanitizeContent`
which strips control characters, BOM markers, and truncates to 100KB.

---

## 8. What the Cloud Does (The Other Half)

The plugin is only half the story. The Supermemory Cloud does the heavy
lifting. Here's what we know about its responsibilities based on the API
contract:

```
+======================================================================+
|                    SUPERMEMORY CLOUD                                   |
|                                                                       |
|  +-------------------+    +-------------------+    +----------------+ |
|  | Extraction Engine  |    | Vector Database   |    | Knowledge      | |
|  |                   |    |                   |    | Graph          | |
|  | - Receives raw    |    | - Stores vector   |    |                | |
|  |   conversation    |    |   embeddings of   |    | - Entity       | |
|  | - Uses entityCtx  |    |   extracted facts  |    |   relationships| |
|  |   as instructions |    | - Supports cosine |    | - Contradiction| |
|  | - Runs an LLM to  |    |   similarity      |    |   detection    | |
|  |   identify facts  |    |   search          |    | - Temporal     | |
|  | - Outputs: list   |    | - Scoped by       |    |   reasoning    | |
|  |   of facts        |    |   containerTag    |    |                | |
|  +--------+----------+    +--------+----------+    +-------+--------+ |
|           |                        |                        |         |
|           v                        v                        v         |
|  +-------------------------------------------------------------------+|
|  |                     Profile Builder                                ||
|  |                                                                    ||
|  |  Aggregates all facts for a containerTag into:                     ||
|  |    static:  stable facts (seen multiple times or explicitly stated)||
|  |    dynamic: recent/changing facts (from last few sessions)         ||
|  |                                                                    ||
|  |  The profile is rebuilt whenever new facts are extracted.           ||
|  +-------------------------------------------------------------------+|
|                                                                       |
|  API Endpoints Used by This Plugin:                                   |
|                                                                       |
|  POST /add                                                            |
|    Input:  content, containerTag, metadata, customId, entityContext    |
|    Action: Extract facts, embed, store, update graph, rebuild profile |
|    Output: { id: "doc_123" }                                          |
|                                                                       |
|  POST /profile                                                        |
|    Input:  containerTag, q (query)                                    |
|    Action: Return profile + semantic search results for query         |
|    Output: { profile: { static, dynamic }, searchResults: { results }}|
|                                                                       |
|  POST /search/memories                                                |
|    Input:  q (query), containerTag, limit                             |
|    Action: Vector similarity search                                   |
|    Output: { results: [{ id, memory, similarity, metadata }] }        |
|                                                                       |
+======================================================================+
```

### The Profile Endpoint Is Doing Double Duty

The recall hook calls `client.getProfile(prompt)` — a SINGLE API call that
returns BOTH the user profile AND semantically relevant memories. This is
efficient because the cloud can do the profile lookup and vector search in
parallel on its side, returning both in one response.

```
One API call returns:

{
  profile: {
    static: ["...", "..."],     <-- pre-built, cached profile
    dynamic: ["...", "..."]     <-- recent context
  },
  searchResults: {
    results: [                  <-- vector search results for the query
      { memory: "...", similarity: 0.94, updatedAt: "..." },
      { memory: "...", similarity: 0.82, updatedAt: "..." }
    ]
  }
}

This is why the recall hook only makes ONE network call per turn,
despite needing both profile data and search results.
```

### The Add Endpoint Is Fire-and-Forget

The capture hook calls `client.addMemory(...)` which calls the SDK's
`.add()` method. The cloud's response is just `{ id: "doc_123" }` — an
acknowledgment that the content was received. All the extraction,
embedding, graph updates, and profile rebuilding happen AFTER the
acknowledgment, asynchronously on the cloud side.

This is why capture is fast (~100ms round trip) even though the cloud
might spend 1-5 seconds doing the actual extraction work.

```
Plugin timeline:              Cloud timeline:
==============                ===============

  addMemory() --->            Receive content
                              Return { id }    <---  (~100ms)
  Plugin done.
  (moves on)                  Queue for extraction
                              Run extraction AI    (~1-3 sec)
                              Generate embeddings  (~0.5 sec)
                              Update knowledge graph
                              Rebuild profile
                              Done.               (~3-5 sec total)
```

---

## Summary

```
PRE-HOOK (recall.ts):
  TRIGGER:    "before_agent_start" — every user message
  DISCOVERY:  Sends user's prompt as query to cloud's /profile endpoint.
              Cloud does semantic vector search + returns cached profile.
  INJECTION:  Returns { prependContext: string } to OpenClaw.
              OpenClaw prepends this to the system prompt.
              LLM sees memories as part of its instructions.

POST-HOOK (capture.ts):
  TRIGGER:    "agent_end" — after LLM response is generated
  EXTRACTION: Sends last conversation turn to cloud's /add endpoint.
              Cloud's extraction AI uses entityContext instructions to
              identify lasting facts. The plugin does NOT extract facts.
  STORAGE:    Cloud stores extracted facts as vectors + graph nodes.
              Profile is rebuilt asynchronously.
  BACKGROUND: Two levels — (1) hook runs after user sees response,
              (2) cloud processes asynchronously after acknowledging.

THE BRIDGE:  Session key is captured by pre-hook wrapper and shared
             with post-hook via a closure, so both hooks reference the
             same session document.
```
