# Adapting Supermemory Hooks to Claude Code

> **Context:** This document analyzes how the hooks-based memory architecture in
> [openclaw-supermemory](https://github.com/supermemoryai/openclaw-supermemory)
> could be adapted to [Claude Code](https://docs.anthropic.com/en/docs/claude-code),
> Anthropic's CLI agent. It compares the two hook systems, maps equivalent
> concepts, evaluates trade-offs, and proposes three implementation levels.

---

## Table of Contents

1. [Why Hooks-Based Memory?](#1-why-hooks-based-memory)
2. [System Comparison at a Glance](#2-system-comparison-at-a-glance)
3. [Hook Event Mapping](#3-hook-event-mapping)
4. [Deep Dive: Pre-Request (Recall)](#4-deep-dive-pre-request-recall)
5. [Deep Dive: Post-Request (Capture)](#5-deep-dive-post-request-capture)
6. [Claude Code's Unique Advantage: Compaction Hooks](#6-claude-codes-unique-advantage-compaction-hooks)
7. [Similarities](#7-similarities)
8. [Differences](#8-differences)
9. [Pros and Cons](#9-pros-and-cons)
10. [Three-Level Practical Path](#10-three-level-practical-path)
11. [Assessment: Is This Adaptation Warranted?](#11-assessment-is-this-adaptation-warranted)

---

## 1. Why Hooks-Based Memory?

The core insight from the Supermemory project (discussed in the
[Latent Space Podcast](https://www.youtube.com/watch?v=Io0mAsHkiRY&t=14s)
with Dhravya Shah) is that **hooks beat tools for default memory behavior**.

```
Tools-based approach (fragile):
  User asks question
       |
       v
  LLM decides whether to call search_memory tool  <-- unreliable
       |
       v
  Sometimes gets context, sometimes doesn't

Hooks-based approach (reliable):
  User asks question
       |
       v
  Hook ALWAYS fires, ALWAYS injects context       <-- guaranteed
       |
       v
  LLM always has relevant memories available
```

When memory depends on the LLM choosing to invoke a tool, recall is
inconsistent. The LLM may skip it to save tokens, forget it exists, or
decide the query doesn't need memory. Hooks remove that decision entirely:
context is always injected, facts are always captured.

Both OpenClaw and Claude Code support event-driven hooks that can intercept
the conversation lifecycle. The question is how well the Supermemory
architecture maps onto Claude Code's hook system.

---

## 2. System Comparison at a Glance

```
+----------------------------------+-----------------------------------+
|     Supermemory (OpenClaw)       |        Claude Code                |
+----------------------------------+-----------------------------------+
| Plugin SDK with hook events      | Settings-based hook config        |
| TypeScript handlers              | Shell commands, HTTP, or agents   |
| before_agent_start / agent_end   | UserPromptSubmit / Stop           |
| { prependContext } return value   | stdout → context injection        |
| Supermemory Cloud (vector DB)    | Auto memory (local .md files)     |
| AI-powered fact extraction       | Manual or external extraction     |
| Semantic vector search           | No built-in vector search         |
| Single API call for profile      | File reads or HTTP to external    |
| No compaction concept            | PreCompact + SessionStart hooks   |
| Always-on by default             | Requires manual hook setup        |
+----------------------------------+-----------------------------------+
```

---

## 3. Hook Event Mapping

### OpenClaw Events → Claude Code Events

```
OpenClaw Event            Claude Code Equivalent         Notes
─────────────────────     ──────────────────────         ─────────────────────
before_agent_start        UserPromptSubmit               Fires before LLM processes prompt
agent_end                 Stop                           Fires after LLM finishes response
(no equivalent)           SessionStart                   Fires when session begins
(no equivalent)           PreCompact                     Fires before context compression
(no equivalent)           PreToolUse / PostToolUse       Per-tool-call hooks
(no equivalent)           SessionStart (compact)         Re-inject after compaction
```

Claude Code has a **richer event surface** — six hook points vs OpenClaw's two.
This means an adaptation can do things the original plugin cannot, particularly
around compaction survival and tool-level interception.

### Hook Type Comparison

OpenClaw hooks are **TypeScript functions** that receive structured data and
return structured responses:

```typescript
// OpenClaw: hooks/recall.ts
// Receives: { messages, session, config }
// Returns:  { prependContext: string }
```

Claude Code hooks are **external processes** configured in JSON settings,
available in four types:

```
Type        Description                     Best For
────        ───────────                     ────────
command     Shell command (bash/python)      Simple scripts, file I/O
http        HTTP POST to a URL              External APIs (Supermemory, etc.)
prompt      Send text to a sub-LLM          AI-powered processing
agent       Spawn a Claude sub-agent        Complex multi-step reasoning
```

```json
// Claude Code: ~/.claude/settings.json
{
  "hooks": {
    "UserPromptSubmit": [
      { "type": "command", "command": "python recall.py" }
    ],
    "Stop": [
      { "type": "http", "url": "http://localhost:8080/capture" }
    ]
  }
}
```

---

## 4. Deep Dive: Pre-Request (Recall)

### How Supermemory Does It

In `hooks/recall.ts`, the `before_agent_start` handler:

1. Reads the last user message from the conversation array
2. Calls `client.getProfile(prompt)` — a single HTTPS request to
   Supermemory Cloud that returns `{ static[], dynamic[], searchResults[] }`
3. Deduplicates across all three result sets (static > dynamic > search)
4. Formats everything into an XML `<supermemory-context>` block
5. Returns `{ prependContext: formattedContext }` for injection

```
User prompt ──→ getProfile(prompt) ──→ Supermemory Cloud
                                            |
                     ┌──────────────────────┘
                     v
              { static: [...],         ← persistent facts
                dynamic: [...],        ← recent context
                searchResults: [...] } ← query-matched memories
                     |
                     v
              Deduplicate & Format
                     |
                     v
              <supermemory-context>
                [Profile]
                [Search Results]
              </supermemory-context>
                     |
                     v
              Injected into system prompt
```

Key features:
- **Profile frequency**: Full profile injected on turn 1 and every Nth turn
  (default N=50) to manage token budget. Search results every turn.
- **Deduplication**: Set-based filtering so the same fact doesn't appear in
  both profile and search results.
- **Relative timestamps**: "2d ago", "just now" instead of ISO dates.

### How Claude Code Would Do It

A `UserPromptSubmit` hook receives JSON on stdin:

```json
{
  "session_id": "abc123",
  "transcript_summary": "User is building a React dashboard...",
  "user_prompt": "How should I structure the API layer?"
}
```

Whatever the hook prints to **stdout** is added to Claude's context.

**Option A — Local file-based recall (command hook):**

```python
#!/usr/bin/env python3
"""~/.claude/hooks/recall.py — Local memory recall for Claude Code."""
import json, sys, os, glob

hook_input = json.load(sys.stdin)
user_prompt = hook_input.get("user_prompt", "")

# Search local auto memory files
memory_dir = os.path.expanduser("~/.claude/projects/")
memories = []

for md_file in glob.glob(os.path.join(memory_dir, "*/memory/*.md")):
    with open(md_file) as f:
        content = f.read()
        # Keyword matching (no semantic search available locally)
        prompt_words = set(user_prompt.lower().split())
        if any(word in content.lower() for word in prompt_words):
            memories.append(content[:500])

if memories:
    print("<memory-context>")
    print("Relevant memories from previous sessions:")
    for i, mem in enumerate(memories, 1):
        print(f"\n[Memory {i}]")
        print(mem)
    print("</memory-context>")
```

**Option B — Supermemory cloud recall (HTTP hook):**

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "http",
        "url": "https://api.supermemory.ai/v3/search",
        "timeout": 5000
      }
    ]
  }
}
```

The HTTP hook sends the stdin JSON as the POST body. A proxy server or
serverless function would need to reshape this into the Supermemory API
format and return the results as plain text (which becomes stdout → context).

### Key Differences in Recall

| Aspect | Supermemory | Claude Code |
|--------|-------------|-------------|
| Input | Full message array | `user_prompt` string + `transcript_summary` |
| Search | Semantic vector similarity | Keyword match (local) or external API |
| Profile | Built-in static/dynamic split | Must implement or delegate |
| Injection | `{ prependContext }` return | stdout text |
| Token budget | Profile frequency counter | Must implement manually |

---

## 5. Deep Dive: Post-Request (Capture)

### How Supermemory Does It

In `hooks/capture.ts`, the `agent_end` handler:

1. Scans backward through the message array for the last user message
2. Slices everything from that message to the end (= last conversation turn)
3. Strips previously injected `<supermemory-context>` blocks via regex
4. Sends the cleaned text to `client.addMemory()` with:
   - `entityContext`: extraction instructions from `memory.ts`
   - `customId`: session-based document ID for idempotent updates
   - `containerTag`: namespace for memory isolation
5. The cloud then asynchronously extracts facts using its own AI

```
Conversation ends
       |
       v
  getLastTurn(messages)
       |
       v
  Strip <supermemory-context> blocks   ← prevents feedback loops
       |
       v
  client.addMemory(cleanedText, {
    entityContext: "Extract lasting facts...",
    customId: "session_abc123"
  })
       |
       v
  Supermemory Cloud (async)
       |
       v
  AI extracts facts → stored in vector DB
```

Key features:
- **Context stripping**: Regex `/<supermemory-context>[\s\S]*?<\/supermemory-context>/g`
  prevents the system from memorizing its own injected context.
- **Session document**: `customId` ensures repeated captures in the same session
  update the same document rather than creating duplicates.
- **Filtered providers**: Skips system events like `exec-event`, `cron-event`.
- **Fire-and-forget**: The hook doesn't wait for cloud processing to complete.

### How Claude Code Would Do It

A `Stop` hook receives:

```json
{
  "session_id": "abc123",
  "transcript_summary": "User asked about API structure. Claude suggested...",
  "stop_hook_active": true
}
```

**Option A — Local file capture (command hook):**

```python
#!/usr/bin/env python3
"""~/.claude/hooks/capture.py — Save session facts to auto memory."""
import json, sys, os, re

hook_input = json.load(sys.stdin)
transcript = hook_input.get("transcript_summary", "")
session_id = hook_input.get("session_id", "unknown")

# Strip previously injected context
transcript = re.sub(
    r"<memory-context>[\s\S]*?</memory-context>\s*", "", transcript
)

if not transcript.strip():
    sys.exit(0)

# Determine project memory directory
# (In practice, you'd resolve the current project path)
memory_dir = os.path.expanduser(
    "~/.claude/projects/current-project/memory/"
)
os.makedirs(memory_dir, exist_ok=True)

# Append to a session facts file
facts_file = os.path.join(memory_dir, "session_facts.md")
with open(facts_file, "a") as f:
    f.write(f"\n## Session {session_id}\n")
    f.write(f"{transcript[:1000]}\n")
```

**Option B — Supermemory cloud capture (HTTP hook):**

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "http",
        "url": "http://localhost:8080/capture",
        "timeout": 10000
      }
    ]
  }
}
```

A local proxy would receive the `Stop` event, extract the transcript, strip
injected context, and forward to Supermemory's `addMemory` API.

### Key Differences in Capture

| Aspect | Supermemory | Claude Code |
|--------|-------------|-------------|
| Input | Full message array (raw) | `transcript_summary` (compressed) |
| Last turn extraction | Manual scan backward | Not available (summary only) |
| Fact extraction | Cloud AI (automatic) | Manual parsing or external AI |
| Context stripping | Regex on raw messages | Regex on summary text |
| Deduplication | Session-based `customId` | Must implement manually |
| Storage | Vector DB + graph | Local `.md` files or external |

**Critical gap:** Claude Code's `Stop` hook receives `transcript_summary`,
not the raw conversation. This is a lossy representation — fine for broad
themes but less precise for extracting specific facts like "user prefers
tabs over spaces" or "project uses PostgreSQL 16".

---

## 6. Claude Code's Unique Advantage: Compaction Hooks

Claude Code performs **context compaction** — when the conversation grows too
long for the context window, it summarizes earlier messages. This is invisible
in OpenClaw because OpenClaw plugins don't manage context windows.

Claude Code provides two hooks that Supermemory has no equivalent for:

### PreCompact Hook

Fires before compaction. Use it to save critical context that might be lost:

```json
{
  "hooks": {
    "PreCompact": [
      {
        "type": "command",
        "command": "python ~/.claude/hooks/save_before_compact.py"
      }
    ]
  }
}
```

### SessionStart with Compact Matcher

Fires after compaction completes. Use it to re-inject preserved context:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "type": "command",
        "command": "python ~/.claude/hooks/reinject_after_compact.py"
      }
    ]
  }
}
```

This creates a **compaction-surviving memory layer**:

```
Long conversation grows...
       |
       v
  PreCompact fires
       |
       v
  Hook saves critical facts to disk
       |
       v
  Claude compacts (summarizes old messages)
       |
       v
  SessionStart (compact) fires
       |
       v
  Hook reads saved facts, prints to stdout
       |
       v
  Facts re-injected into compressed context
```

This is genuinely **better** than what Supermemory offers for long-running
sessions. In OpenClaw, if a plugin's injected context gets dropped during
any context management, it's gone. Claude Code's compaction hooks let you
explicitly preserve and restore it.

---

## 7. Similarities

1. **Event-driven architecture.** Both systems use lifecycle hooks rather than
   polling or manual triggers. Memory operations happen automatically.

2. **Stdout/return-value injection.** Both use the same fundamental mechanism:
   hook produces text → text gets added to the LLM's context. Supermemory
   returns `{ prependContext }`, Claude Code reads stdout. Same concept,
   different syntax.

3. **Context stripping.** Both need to prevent feedback loops where the system
   memorizes its own injected context. The solution in both cases is regex-based
   removal of tagged blocks before capture.

4. **Fail-silent philosophy.** Both systems treat memory failures as non-fatal.
   A broken recall hook shouldn't prevent the LLM from responding. A failed
   capture shouldn't crash the session.

5. **Session awareness.** Both receive session identifiers that enable
   per-session deduplication and document tracking.

6. **Transparent to the user.** In both systems, hooks fire invisibly. The user
   doesn't need to remember to search memory or save facts.

---

## 8. Differences

### 8.1 Hook Handler Model

| | Supermemory | Claude Code |
|-|-------------|-------------|
| **Language** | TypeScript (in-process) | Any (external process) |
| **Execution** | Same process, same event loop | Forked subprocess or HTTP call |
| **Latency** | ~50-200ms (one API call) | Variable (depends on hook type) |
| **State** | Closure variables (turn counter, session key) | Must persist state in files/DB |

Supermemory hooks run **in-process** as TypeScript closures. They share memory
with the plugin (e.g., the turn counter for profile frequency lives in a
closure variable). Claude Code hooks are **external processes** — they start
fresh each time, with no shared state between invocations unless you persist
it to disk or a database.

### 8.2 Input Richness

Supermemory's `before_agent_start` receives the **full conversation array**:
every message, every role, every content block. The capture hook can scan
backward to find the exact last user message and slice precisely.

Claude Code's hooks receive a **constrained JSON payload**: `session_id`,
`user_prompt` (for UserPromptSubmit), and `transcript_summary` (for Stop).
The raw conversation is not exposed. This is by design — it limits what
external processes can access — but it reduces precision for fact extraction.

### 8.3 Search Capability

Supermemory has **semantic vector search** built into its cloud. A single
`getProfile(prompt)` call returns semantically relevant memories even if
they share no keywords with the query.

Claude Code has **no built-in search** over memory files. The auto memory
system loads `MEMORY.md` (first 200 lines) at session start, but there's
no query-time search. Any search logic must be implemented in the hook
script itself — either keyword matching (limited) or via an external API.

### 8.4 Fact Extraction Intelligence

Supermemory delegates fact extraction to its **cloud AI**. The `entityContext`
field (from `memory.ts`) tells the cloud what to extract and what to ignore:

```
"Extract lasting personal facts: preferences, decisions, tools, projects.
 Ignore one-time requests, temporary tasks, and the AI's own actions."
```

Claude Code has no built-in fact extraction. A capture hook would need to
either (a) dump raw transcript to files and hope for the best, or (b) call
an external AI service to extract structured facts.

### 8.5 Configuration Model

Supermemory is configured via **plugin config** in `openclaw.json` with
12 typed fields, validated at startup, with interactive setup commands.

Claude Code hooks are configured via **settings.json** with minimal
structure — just the hook type and command/URL. Any additional configuration
(API keys, frequency settings, etc.) must be managed by the hook scripts
themselves (environment variables, config files, etc.).

---

## 9. Pros and Cons

### 9.1 Supermemory on OpenClaw

| Pros | Cons |
|------|------|
| Semantic vector search — finds relevant memories even without keyword overlap | Requires cloud service and API key (cost, latency, privacy) |
| AI-powered fact extraction — automatically identifies what's worth remembering | Tied to OpenClaw's plugin SDK (not portable) |
| Full conversation access — precise last-turn extraction | No compaction awareness — injected context can be lost |
| In-process execution — low latency, shared state | Single provider (Supermemory) — vendor lock-in |
| Rich configuration — 12 tunable options with interactive setup | Complexity — 10+ files, SDK dependency, cloud dependency |
| Deduplication and token budgeting built in | Cloud processes asynchronously — extraction delay |
| Profile builder (static + dynamic facts) | Requires Supermemory Pro subscription |

### 9.2 Claude Code Hooks Adaptation

| Pros | Cons |
|------|------|
| Local-first — auto memory files with no external dependency | No semantic search without external service |
| Language-agnostic hooks — Python, Bash, Node, anything | External process per hook invocation (startup overhead) |
| Compaction hooks — memory survives context compression | No raw conversation access (only summary in Stop hook) |
| Four hook types (command, HTTP, prompt, agent) | No built-in fact extraction AI |
| No vendor lock-in — you own your memory files | Must manage state persistence manually (no closures) |
| Free — no subscription required for local approach | No deduplication, token budgeting, or profile builder built in |
| Richer event surface (6 hook points vs 2) | More manual setup (no interactive config wizard) |
| Works offline | Keyword search is far less effective than vector search |

### 9.3 Side-by-Side Summary

```
                          Supermemory       Claude Code       Winner
                          ───────────       ───────────       ──────
Search quality            Semantic vector   Keyword/none      Supermemory
Fact extraction           AI-powered        Manual/external   Supermemory
Conversation access       Full raw array    Summary only      Supermemory
Compaction survival       Not applicable    PreCompact hook   Claude Code
Privacy / local-first     Cloud required    Local files       Claude Code
Cost                      Subscription      Free              Claude Code
Vendor independence       Supermemory only  Any backend       Claude Code
Hook event richness       2 events          6 events          Claude Code
Setup complexity          Plugin install    Manual scripts    Supermemory
Language flexibility      TypeScript only   Any language       Claude Code
Latency                   ~100ms (in-proc)  Variable          Supermemory
Portability               OpenClaw only     Claude Code only  Tie
```

---

## 10. Three-Level Practical Path

### Level 1 — Local Only (No External Services)

**Goal:** Basic memory persistence using Claude Code's built-in auto memory
and hook system. No cloud, no cost, no privacy concerns.

**Architecture:**

```
UserPromptSubmit hook                    Stop hook
       |                                      |
       v                                      v
  Read ~/.claude/projects/             Read transcript_summary
  <project>/memory/*.md                       |
       |                                      v
       v                                Strip <memory-context>
  Keyword search against                      |
  user_prompt                                 v
       |                                Append facts to
       v                                memory/session_facts.md
  Print matches to stdout
  (injected into context)
```

**What you get:**
- Automatic memory recall on every prompt (keyword-based)
- Automatic capture of session summaries
- `MEMORY.md` (first 200 lines) loaded every session by Claude Code itself
- Compaction survival via `PreCompact` + `SessionStart(compact)` hooks

**What you lose:**
- No semantic search (keyword matching misses conceptual similarity)
- No AI fact extraction (raw summaries, not structured facts)
- No deduplication or token budgeting
- Memory files grow unbounded without manual curation

**Effort:** ~2 hours to write the hook scripts. No ongoing cost.

**Best for:** Individual developers who want basic cross-session memory
without external dependencies.

---

### Level 2 — With Supermemory Cloud

**Goal:** Full semantic recall and AI-powered capture by wiring Claude Code
hooks to Supermemory's API.

**Architecture:**

```
UserPromptSubmit hook (HTTP)              Stop hook (HTTP)
       |                                        |
       v                                        v
  POST /v3/search                         POST /v3/memories
  { query: user_prompt,                   { content: transcript,
    containerTag: "claude_code" }           entityContext: "...",
       |                                    containerTag: "claude_code" }
       v                                        |
  Supermemory Cloud                              v
  (vector search + profile)              Supermemory Cloud
       |                                 (async fact extraction)
       v
  Format results → stdout
  (injected into context)
```

**Implementation notes:**
- Claude Code's HTTP hooks send the stdin JSON as the POST body, but
  Supermemory's API expects a different format. You'll need a **thin proxy**
  (local Express server, serverless function, or Cloudflare Worker) to
  reshape requests and responses.
- The proxy for recall: receives `{ user_prompt }`, calls Supermemory search,
  formats results as plain text, returns as response body.
- The proxy for capture: receives `{ transcript_summary }`, strips context
  blocks, calls Supermemory addMemory, returns 200.

**What you get:**
- Semantic vector search (same quality as the OpenClaw plugin)
- AI-powered fact extraction (same cloud intelligence)
- Profile builder (static + dynamic facts)
- PLUS compaction survival (Claude Code exclusive)

**What you lose:**
- Still only `transcript_summary`, not raw conversation (less precise capture)
- Requires Supermemory subscription
- Requires running a proxy service
- Latency added by HTTP round-trip

**Effort:** ~1 day to build the proxy and configure hooks. Ongoing cost for
Supermemory subscription.

**Best for:** Power users who want production-grade memory and are already
using (or willing to pay for) Supermemory.

---

### Level 3 — Full Feature Parity and Beyond

**Goal:** Match or exceed the OpenClaw plugin's capabilities by combining
Claude Code's richer hook surface with Supermemory's intelligence.

**Architecture:**

```
SessionStart hook
  → Load full profile on session start

UserPromptSubmit hook
  → Semantic search via Supermemory API
  → Inject results to stdout
  → Increment turn counter (persisted to file)
  → Full profile injection every N turns

Stop hook
  → Capture transcript via Supermemory API
  → Update session document (idempotent via customId)

PreCompact hook
  → Save critical context to disk before compression

SessionStart (compact matcher) hook
  → Re-inject preserved context after compression

PreToolUse hook (optional)
  → Log tool usage patterns to memory for personalization
```

**Additional features beyond Supermemory:**
- **Compaction survival**: Preserve and restore key facts across context
  compression — something the OpenClaw plugin cannot do.
- **Tool-aware memory**: `PreToolUse`/`PostToolUse` hooks can track which
  tools the user relies on, building a richer behavioral profile.
- **Multi-backend**: HTTP hooks can route to any vector DB (Supermemory,
  Pinecone, Weaviate, Qdrant, a local embedding server) — no vendor lock-in.
- **Agent-type hooks**: Use Claude Code's `"type": "agent"` hooks to spawn
  a sub-agent for fact extraction, eliminating the need for cloud AI.

**What you get:**
- Everything from Level 2
- Compaction-surviving memory (exclusive to Claude Code)
- Profile frequency management (turn counter in persistent file)
- Deduplication logic (in the recall proxy)
- Tool usage tracking
- Multi-provider flexibility

**Effort:** ~3-5 days for full implementation. Requires proxy service,
persistent state management, and thorough testing.

**Best for:** Teams or developers building a reusable memory infrastructure
for Claude Code across multiple projects.

---

## 11. Assessment: Is This Adaptation Warranted?

### What Claude Code Already Has

Before building anything, consider what Claude Code provides natively:

1. **CLAUDE.md files** — Project instructions loaded every session. These are
   manually curated but always available. User-scope (`~/.claude/CLAUDE.md`),
   project-scope (`./CLAUDE.md`), and managed scope (`~/.claude/managed/`).

2. **Auto memory** — `~/.claude/projects/<project>/memory/MEMORY.md` with
   first 200 lines loaded automatically. Claude itself writes to these files
   during sessions when it deems something worth remembering.

3. **Topic files** — Additional `.md` files in the memory directory, linked
   from `MEMORY.md`, that Claude can read on demand.

4. **`/memory` command** — Users can explicitly tell Claude to remember things.

This built-in system is **simple, local, and works well for most use cases**.
It's not semantic search — it's "load the first 200 lines of notes every
session" — but for individual developers on a single project, it's often
sufficient.

### When the Adaptation IS Warranted

| Scenario | Why Hooks Help |
|----------|---------------|
| **Multi-project developer** | You work across 10+ projects and need memories to transfer between them. Auto memory is project-scoped; a cloud-based system is global. |
| **Team/shared memory** | Multiple developers need shared context about a codebase. Local files don't sync; a cloud service does. |
| **Long-running projects** | After months, `MEMORY.md` becomes stale or bloated. AI-powered fact extraction keeps it pruned and relevant. |
| **Precision recall** | You need memories found by meaning, not keywords. "What database did we choose?" should find "We decided on PostgreSQL 16" even without the word "database" in the memory. |
| **Compaction-heavy sessions** | Deep coding sessions that trigger multiple compactions lose context. Compaction hooks (Level 1+) solve this even without cloud services. |

### When It's NOT Warranted

| Scenario | Why Built-in Is Enough |
|----------|----------------------|
| **Solo developer, 1-3 projects** | `MEMORY.md` + `CLAUDE.md` covers your needs. The overhead of hook scripts isn't justified. |
| **Short sessions** | If your sessions rarely exceed the context window, compaction hooks are unnecessary and recall is less critical. |
| **Privacy-sensitive work** | If you can't send conversation data to any external service, Level 2+ is off the table. Level 1 adds marginal value over the built-in system. |
| **Stable projects** | If the project context doesn't change much, a well-maintained `CLAUDE.md` is more reliable than automated extraction. |

### Recommendation

```
                                            ┌─────────────────────┐
                                            │  Are your sessions  │
                                            │  long enough to     │
                                     No     │  trigger compaction?│
                              ┌─────────────┤                     │
                              │             └──────────┬──────────┘
                              v                        │ Yes
                     ┌────────────────┐                v
                     │ Built-in auto  │       ┌────────────────┐
                     │ memory is      │       │ Level 1 is     │
                     │ probably fine  │       │ worth it just  │
                     └────────────────┘       │ for compaction │
                                              │ hooks alone    │
                                              └───────┬────────┘
                                                      │
                                            ┌─────────v──────────┐
                                            │ Do you need cross- │
                                     No     │ project or semantic│
                              ┌─────────────┤ memory search?     │
                              │             └──────────┬─────────┘
                              v                        │ Yes
                     ┌────────────────┐                v
                     │ Stay at        │       ┌────────────────┐
                     │ Level 1        │       │ Level 2+ with  │
                     └────────────────┘       │ Supermemory or │
                                              │ similar API    │
                                              └────────────────┘
```

**Bottom line:** Level 1 (compaction hooks + local recall) is a low-effort,
high-value improvement for anyone doing deep coding sessions. It takes ~2
hours to set up and costs nothing. Level 2+ is warranted only if you need
semantic search or cross-project memory — powerful, but introduces external
dependencies and ongoing costs.

The hooks-based architecture from Supermemory translates cleanly to Claude
Code. The main gap — Claude Code not exposing raw conversation to the `Stop`
hook — limits capture precision but doesn't block the overall approach.
For recall, the `UserPromptSubmit` → stdout injection is functionally
identical to Supermemory's `{ prependContext }` pattern.

The most exciting aspect is that Claude Code's richer hook surface (especially
compaction hooks) enables capabilities that the original Supermemory plugin
**cannot achieve** on OpenClaw. An adaptation wouldn't just be a port — it
would be an upgrade.

---

## References

- [openclaw-supermemory source](https://github.com/supermemoryai/openclaw-supermemory)
- [Hooks Deep Dive](./HOOKS_DEEP_DIVE.md) — detailed analysis of Supermemory's pre/post hooks
- [Architecture](./ARCHITECTURE.md) — full system design of the OpenClaw plugin
- [Claude Code Hooks Reference](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Claude Code Memory Documentation](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Latent Space Podcast — Supermemory episode](https://www.youtube.com/watch?v=Io0mAsHkiRY&t=14s)
