# OpenClaw Supermemory — User Guide

> **Audience:** End users who want to install, configure, and use the Supermemory
> plugin in their OpenClaw setup. No programming experience required.

---

## Table of Contents

1. [What Is This Plugin?](#1-what-is-this-plugin)
2. [Quick Start (5 Minutes)](#2-quick-start-5-minutes)
3. [Understanding How It Works](#3-understanding-how-it-works)
4. [Slash Commands Reference](#4-slash-commands-reference)
5. [CLI Commands Reference](#5-cli-commands-reference)
6. [Configuration Options](#6-configuration-options)
7. [10 Educational Use Cases](#7-ten-educational-use-cases)
8. [Custom Containers](#8-custom-containers)
9. [Advanced Configuration](#9-advanced-configuration)
10. [Tips and Best Practices](#10-tips-and-best-practices)
11. [FAQ](#11-faq)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What Is This Plugin?

OpenClaw Supermemory gives your AI assistant **long-term memory**. Without it,
every conversation starts from scratch — the AI doesn't know your preferences,
your projects, or anything you've told it before.

With Supermemory installed, the AI:
- **Remembers** facts about you (preferences, tools, projects)
- **Recalls** relevant memories when you ask questions
- **Forgets** outdated information when you tell it to
- **Builds** a profile of you that gets better over time

All of this happens **automatically** in the background. You don't need to do
anything special after setup.

---

## 2. Quick Start (5 Minutes)

### Step 1: Get an API Key

1. Go to https://app.supermemory.ai
2. Sign up or log in
3. Navigate to Integrations
4. Copy your API key (it starts with `sm_`)

### Step 2: Install the Plugin

Open your terminal and run:

```bash
openclaw plugins install @supermemory/openclaw-supermemory
```

### Step 3: Configure Your API Key

```bash
openclaw supermemory setup
```

When prompted, paste your API key and press Enter.

### Step 4: Restart OpenClaw

```bash
openclaw gateway --force
```

### Step 5: Verify It's Working

```bash
openclaw supermemory status
```

You should see:

```
  Supermemory Status

  API key:         sm_abc1...xyz9 (from config)
  Enabled:          true
  Container tag:    openclaw_YOUR_HOSTNAME
  Auto-recall:      true
  Auto-capture:     true
  ...
```

**That's it!** The plugin is now active. Start a conversation and it will
automatically begin learning about you.

---

## 3. Understanding How It Works

### The Automatic Loop

Every time you chat with OpenClaw, two things happen invisibly:

```
You type a message
       |
       v
  +----------------------------+
  | BEFORE the AI responds:    |
  | Plugin fetches your profile|
  | and relevant memories from |
  | the cloud and gives them   |
  | to the AI as context.      |
  +----------------------------+
       |
       v
  AI responds (with full context about you)
       |
       v
  +----------------------------+
  | AFTER the AI responds:     |
  | Plugin sends the convo to  |
  | the cloud, which extracts  |
  | any new facts and updates  |
  | your profile.              |
  +----------------------------+
```

### What Gets Remembered?

The plugin is selective. It remembers:
- Personal facts ("I work at Acme Corp")
- Preferences ("I prefer dark mode")
- Decisions ("I'm going with PostgreSQL")
- Contact info (emails, phone numbers mentioned)

It does NOT remember:
- One-time requests ("search for X")
- Temporary tasks ("fix this bug")
- The AI's own actions (code it generated, files it searched)

### The User Profile

Over time, the cloud builds a profile of you with two parts:

```
Persistent Profile (rarely changes):
  - Works at Acme Corp
  - Uses TypeScript and Python
  - Prefers VS Code with Vim keybindings
  - Located in San Francisco

Recent Context (changes frequently):
  - Working on a React dashboard
  - Debugging WebSocket reconnection
  - Preparing for a demo on Friday
```

---

## 4. Slash Commands Reference

Use these inside an OpenClaw conversation:

### `/remember <text>`

Manually save something to memory.

```
/remember I prefer using pnpm instead of npm

Response: Remembered: "I prefer using pnpm instead of npm"
```

**When to use:** When you want to explicitly tell the AI to remember something
that might not come up naturally in conversation.

### `/recall <query>`

Search your memories.

```
/recall package manager

Response: Found 2 memories:

1. I prefer using pnpm instead of npm (95%)
2. Uses bun for the dashboard project (72%)
```

**When to use:** When you want to check what the AI knows about a topic.

---

## 5. CLI Commands Reference

Use these from your terminal (not inside OpenClaw conversations):

### `openclaw supermemory setup`

Interactive API key configuration.

```bash
$ openclaw supermemory setup

  Supermemory Setup

Get your API key from: https://app.supermemory.ai

Enter your Supermemory API key: sm_your_key_here

  API key saved to ~/.openclaw/openclaw.json
  Restart OpenClaw to apply changes: openclaw gateway --force
```

### `openclaw supermemory setup-advanced`

Configure all options interactively: container tag, auto-recall/capture,
capture mode, profile frequency, entity context, custom containers.

### `openclaw supermemory status`

View your current configuration.

### `openclaw supermemory search <query>`

Search your memories from the terminal.

```bash
$ openclaw supermemory search "Python"

- User prefers Python for data analysis scripts (92%)
- Uses Python 3.11 on the server project (78%)
```

### `openclaw supermemory profile`

View your user profile.

```bash
$ openclaw supermemory profile

Stable Preferences:
  - Prefers TypeScript for frontend
  - Uses VS Code with Vim keybindings
  - Works at Acme Corp

Recent Context:
  - Building a React dashboard
  - Researching WebSocket libraries
```

### `openclaw supermemory wipe`

Delete ALL memories. Requires confirmation.

```bash
$ openclaw supermemory wipe

This will permanently delete all memories in "openclaw_DESKTOP".
Type "yes" to confirm: yes

Wiped 47 memories from "openclaw_DESKTOP".
```

**Warning:** This is irreversible. Use with caution.

---

## 6. Configuration Options

Configuration lives in `~/.openclaw/openclaw.json`:

```json
{
    "plugins": {
        "entries": {
            "openclaw-supermemory": {
                "enabled": true,
                "config": {
                    "apiKey": "sm_your_key_or_${ENV_VAR}",
                    "containerTag": "my_memory",
                    "autoRecall": true,
                    "autoCapture": true,
                    "maxRecallResults": 10,
                    "profileFrequency": 50,
                    "captureMode": "all",
                    "debug": false
                }
            }
        }
    }
}
```

### Option Reference

| Option | What It Does | Default |
|--------|-------------|---------|
| `apiKey` | Your Supermemory API key | (required) |
| `containerTag` | Namespace for your memories | `openclaw_HOSTNAME` |
| `autoRecall` | Auto-inject memories before AI responds | `true` |
| `autoCapture` | Auto-store conversations after AI responds | `true` |
| `maxRecallResults` | Max memories injected per turn (1-20) | `10` |
| `profileFrequency` | Full profile injected every N turns (1-500) | `50` |
| `captureMode` | `"all"` filters noise, `"everything"` captures raw | `"all"` |
| `entityContext` | Custom rules for what to extract | (smart defaults) |
| `debug` | Show detailed API logs | `false` |

### Using Environment Variables

Instead of putting your API key directly in the config file, you can reference
an environment variable:

```json
{
    "apiKey": "${SUPERMEMORY_OPENCLAW_API_KEY}"
}
```

Then set the variable in your shell:

```bash
# Linux/Mac:
export SUPERMEMORY_OPENCLAW_API_KEY="sm_your_key"

# Windows PowerShell:
$env:SUPERMEMORY_OPENCLAW_API_KEY = "sm_your_key"

# Windows Git Bash:
export SUPERMEMORY_OPENCLAW_API_KEY="sm_your_key"
```

Or just set the environment variable and omit `apiKey` from config entirely —
the plugin checks for `SUPERMEMORY_OPENCLAW_API_KEY` automatically.

---

## 7. Ten Educational Use Cases

These use cases show you what the plugin can do and help you build confidence.
Try them in order.

### Use Case 1: First Conversation — Automatic Learning

**Goal:** See the plugin learn about you automatically.

```
You:    I'm working on a Python web scraper using Beautiful Soup.
AI:     [responds with help]

You:    I prefer to use requests over httpx for simple scripts.
AI:     [responds acknowledging your preference]
```

**What happened behind the scenes:**
- The capture hook sent both exchanges to Supermemory cloud
- The cloud extracted: "Working on a Python web scraper", "Prefers requests
  over httpx for simple scripts"
- These are now stored as memories

### Use Case 2: Memory Recall in a New Session

**Goal:** See the AI use memories from a previous conversation.

Start a **new conversation** and say:

```
You:    I need to make an HTTP request in my script.
AI:     Since you prefer using `requests` over httpx, here's how...
```

**What happened:** The recall hook searched for memories relevant to "HTTP
request in my script" and found your preference for `requests`. The AI used
this context without you having to repeat yourself.

### Use Case 3: Manual Memory Storage

**Goal:** Explicitly save important information.

```
/remember My project deadline is March 31st, 2026

Response: Remembered: "My project deadline is March 31st, 2026"
```

### Use Case 4: Searching Your Memories

**Goal:** See what the AI knows about a topic.

```
/recall deadline

Response: Found 1 memory:

1. My project deadline is March 31st, 2026 (97%)
```

The percentage shows how relevant the memory is to your query.

### Use Case 5: The AI Asks You for Preferences (And Remembers)

**Goal:** Natural preference learning.

```
You:    Set up a new Node.js project for me.
AI:     I'll set it up. Do you prefer npm, yarn, or pnpm?
You:    Always use pnpm.
AI:     Got it! Setting up with pnpm...
```

**Next session:**

```
You:    Set up another Node.js project.
AI:     Setting up with pnpm as you prefer...
```

### Use Case 6: Forgetting Outdated Information

**Goal:** Remove a memory that's no longer true.

```
You:    I moved from San Francisco to Seattle.
        Please forget that I live in San Francisco.
```

The AI will use the `supermemory_forget` tool to remove the old memory and the
capture hook will store the new location.

### Use Case 7: Viewing Your Profile

**Goal:** See the full profile the AI has built about you.

```
You:    What do you know about me?
```

The AI will use the `supermemory_profile` tool and show you:

```
User Profile (Persistent):
- Works at Acme Corp
- Prefers TypeScript and pnpm
- Located in Seattle (recently moved from SF)

Recent Context:
- Working on a Python web scraper
- Project deadline March 31st
```

### Use Case 8: Context-Aware Recommendations

**Goal:** See the AI make personalized suggestions.

```
You:    I need a database for my new side project.
AI:     Given that you work primarily with TypeScript and pnpm,
        and your current project uses Node.js, I'd suggest:
        1. SQLite via better-sqlite3 (simple, file-based)
        2. PostgreSQL via Drizzle ORM (if you need more power)
        Both work great with TypeScript...
```

The AI uses your profile (TypeScript preference, pnpm, Node.js projects) to
tailor its recommendations.

### Use Case 9: CLI Memory Search

**Goal:** Search memories without starting an OpenClaw conversation.

From your terminal:

```bash
$ openclaw supermemory search "database"
- Prefers SQLite for side projects (85%)
- Uses PostgreSQL at work (79%)

$ openclaw supermemory profile
Stable Preferences:
  - Prefers TypeScript
  - Uses pnpm
  ...
```

### Use Case 10: Multiple Workspaces with Containers

**Goal:** Separate work and personal memories.

First, set up custom containers:

```bash
openclaw supermemory setup-advanced
# Enable custom container tags: true
# Add container: work:Work projects and coding
# Add container: personal:Personal notes and preferences
# Container instructions: Route work tasks to 'work', personal to 'personal'
```

Now in conversations:

```
You:    Remember that the sprint demo is next Tuesday.
AI:     [stores in 'work' container]

You:    Remember my dentist appointment is on Thursday.
AI:     [stores in 'personal' container]
```

The AI automatically routes memories to the right container based on the
instructions you provided.

---

## 8. Custom Containers

### What Are Containers?

Containers are like folders for your memories. By default, everything goes into
one container. With custom containers, you can organize memories into categories.

### Setting Up Custom Containers

**Option A: Interactive setup**

```bash
openclaw supermemory setup-advanced
```

Follow the prompts to enable custom containers and define them.

**Option B: Manual config**

Edit `~/.openclaw/openclaw.json`:

```json
{
    "plugins": {
        "entries": {
            "openclaw-supermemory": {
                "config": {
                    "apiKey": "sm_...",
                    "enableCustomContainerTags": true,
                    "customContainers": [
                        { "tag": "work", "description": "Work projects" },
                        { "tag": "personal", "description": "Personal notes" },
                        { "tag": "bookmarks", "description": "Saved links and references" }
                    ],
                    "customContainerInstructions": "Store work items in 'work', personal items in 'personal', URLs and references in 'bookmarks'"
                }
            }
        }
    }
}
```

Restart OpenClaw after changing config.

---

## 9. Advanced Configuration

### Tuning Profile Frequency

- **Lower number (e.g., 5):** Full profile injected more often. More tokens
  used per turn, but the AI always has full context.
- **Higher number (e.g., 200):** Full profile injected rarely. Saves tokens,
  but the AI might miss long-term context in some turns.
- **Default (50):** Good balance for most users.

### Tuning Max Recall Results

- **Lower (e.g., 3):** Fewer memories per turn. Faster, cheaper, less noise.
- **Higher (e.g., 15):** More memories per turn. Better context but uses more
  tokens and may include less relevant results.
- **Default (10):** Good balance.

### Capture Mode

- **`"all"` (default):** Filters out short messages, strips previously injected
  memory context, and removes noise. Recommended for most users.
- **`"everything"`:** Captures every message verbatim. Useful if you want
  maximum information captured but may include more noise.

### Custom Entity Context

The `entityContext` option lets you customize what the cloud extracts from your
conversations. The default is well-tuned, but you can override it:

```json
{
    "entityContext": "Only extract technical preferences and tool choices. Ignore everything else."
}
```

Maximum length: 1500 characters.

---

## 10. Tips and Best Practices

1. **Let it learn naturally.** You don't need to use `/remember` for everything.
   The auto-capture hook picks up important facts from normal conversation.

2. **Be explicit about preferences.** Say "I always prefer X" or "I like X"
   rather than "maybe try X" — the extraction AI is tuned to recognize these.

3. **Periodically check your profile.** Use `/recall` or `openclaw supermemory
   profile` to see what the AI knows about you. Correct any mistakes.

4. **Use `/remember` for non-obvious facts.** If something is important but
   unlikely to come up in conversation, save it explicitly.

5. **Don't worry about duplicates.** The cloud handles deduplication and the
   recall hook deduplicates before injection.

6. **Start with defaults.** The default settings are well-tuned. Only change
   them if you have a specific need.

7. **Enable debug mode temporarily** if something seems wrong. Set `debug: true`,
   reproduce the issue, then check the logs.

8. **Use containers for separation.** If you use OpenClaw for both work and
   personal tasks, set up custom containers to keep memories organized.

9. **The AI won't bring up memories unprompted.** The injected context includes
   instructions to only use memories when relevant. The AI won't randomly say
   "by the way, I remember you like dark mode."

10. **Memories improve over time.** The more you use OpenClaw, the better your
    profile becomes. The system is designed to get smarter, not noisier.

---

## 11. FAQ

### Q: Does it send my conversations to the cloud?

**A:** Yes. The last user+assistant turn from each conversation is sent to
Supermemory's cloud for memory extraction. The cloud extracts facts and
discards the raw conversation. If this is a concern, you can disable
auto-capture (`autoCapture: false`) and use only manual `/remember` commands.

### Q: How much does it cost?

**A:** The plugin requires a Supermemory Pro plan or above. The plugin itself
is free and open source.

### Q: Can I use it offline?

**A:** No. The plugin requires an internet connection to communicate with the
Supermemory cloud API.

### Q: Will it slow down my AI responses?

**A:** The recall hook adds one API call before each response (typically
100-300ms). This is usually not noticeable. The capture hook runs AFTER the
response, so it doesn't add any latency to what you see.

### Q: Can I export my memories?

**A:** Use `openclaw supermemory search ""` to list memories, or use the
Supermemory web dashboard at app.supermemory.ai.

### Q: What happens if the API is down?

**A:** The plugin fails silently. If the Supermemory API is unreachable,
the hooks log an error and skip. Your OpenClaw conversations continue
normally without memory context.

### Q: Can multiple machines share memories?

**A:** Yes! Use the same `containerTag` on all machines. By default, each
machine gets its own container (based on hostname). To share, set the same
`containerTag` explicitly in your config on all machines.

---

## 12. Troubleshooting

### "Supermemory not configured"

**Symptom:** `/remember` or `/recall` says "not configured."

**Fix:**

```bash
openclaw supermemory setup
# Enter your API key
openclaw gateway --force
# Restart OpenClaw
```

### The AI doesn't seem to remember anything

**Possible causes:**

1. **Plugin not enabled.** Run `openclaw supermemory status` to check.
2. **Auto-capture disabled.** Check that `autoCapture` is `true`.
3. **Auto-recall disabled.** Check that `autoRecall` is `true`.
4. **Too few conversations.** The profile needs several conversations to build.
5. **Short conversations.** Very short exchanges (< 10 characters) are filtered.

### Memories seem wrong or outdated

Use the forget tool:

```
You:    Forget that I live in San Francisco. I moved to Seattle.
```

Or wipe everything and start fresh:

```bash
openclaw supermemory wipe
```

### Debug mode shows errors

Common errors:

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Invalid API key | Re-run `openclaw supermemory setup` |
| `429 Too Many Requests` | Rate limited | Wait a moment, reduce `maxRecallResults` |
| `Network error` | No internet | Check your connection |
| `invalid API key` | Key doesn't start with `sm_` | Get a new key from app.supermemory.ai |

### Performance issues

If OpenClaw feels slower:

1. Reduce `maxRecallResults` to 5
2. Increase `profileFrequency` to 100
3. Set `captureMode` to `"all"` (filters more aggressively)
