# LangChain / LangGraph Native Utilities Audit

## What's already installed & available (verified against node_modules)

These are the native primitives available **right now** in this project — no new installs needed unless noted.

---

### `trimMessages` — `@langchain/core/messages`
**What it does:** Trims a message list to a token or count budget. Replaces the manual `sliceIndex` walk in `callModel`.

**Full options (verified from source):**
```ts
import { trimMessages } from '@langchain/core/messages';

const trimmed = await trimMessages(messages, {
    maxTokens: 4000,          // budget in tokens (or use maxMessages for count-based)
    tokenCounter: model,       // any LangChain model with .getNumTokens(), or custom fn
    strategy: "last",          // "last" = keep newest  |  "first" = keep oldest
    includeSystem: true,       // always keep the SystemMessage (only with strategy:"last")
    startOn: "human",          // trim boundary — never start mid-tool-sequence
    endOn: ["human", "tool"],  // trim boundary — safe tail types
    allowPartial: false,       // never split a message mid-content
});
```

**Why this matters for forst-tui:**
Your manual `sliceIndex` walk in `callModel` (lines 162–175 of `Workflow.ts`) does the same thing as `trimMessages` but is count-based only. `trimMessages` is **token-aware** — it counts actual tokens, not just messages. A single tool result can be 2,000 tokens; counting it as "1 message" is inaccurate.

**Replaces:** The manual `sliceIndex` loop in `src/core/Workflow.ts` lines 162–175.

---

### `filterMessages` — `@langchain/core/messages`
**What it does:** Filters a message list by type, id, or name. Useful for stripping `SystemMessage` from checkpointer state before `updateState()`.

```ts
import { filterMessages } from '@langchain/core/messages';

// Strip system messages before storing in checkpointer (Fix H3)
const noSystem = filterMessages(messages, { excludeTypes: ["system"] });

// Keep only human + AI messages (strip tool results)
const chatOnly = filterMessages(messages, { includeTypes: ["human", "ai"] });
```

**Replaces:** Manual `msg._getType() === 'system'` exclusion loops in `hydrateCheckpointer`.

---

### `mergeMessageRuns` — `@langchain/core/messages`
**What it does:** Collapses consecutive same-role messages into one. Reduces message count without losing content.

```ts
import { mergeMessageRuns } from '@langchain/core/messages';

// Before: [HumanMsg("hello"), HumanMsg("also this")] — 2 messages
// After:  [HumanMsg("hello\nalso this")]              — 1 message
const merged = mergeMessageRuns(messages);
```

**When to use:** After hydration, before storing in MemorySaver — reduces bloat from consecutive user messages.

---

### `MessagesAnnotation` + `addMessages` — `@langchain/langgraph`
**What it does:** `MessagesAnnotation` is LangGraph's **built-in state schema** for message lists. It uses `addMessages` as its reducer, which supports **message deletion** via `RemoveMessage`.

```ts
import { MessagesAnnotation, REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
import { RemoveMessage } from '@langchain/core/messages';

// Your current manual Annotation.Root is reinventing MessagesAnnotation:
export const AgentState = Annotation.Root({
    messages: MessagesAnnotation.spec,  // ← drop-in replacement
    taskQueue: Annotation<Task[]>({ ... }),
});

// Delete specific old messages to prune in-graph state:
return { messages: [new RemoveMessage({ id: oldMsg.id })] };

// Nuclear option — clear all messages at once:
return { messages: REMOVE_ALL_MESSAGES };
```

**Why this matters:** The current `reducer: (x, y) => x.concat(y)` in `AgentState` has no deletion support — there's no way to prune old messages without replacing the entire state. `MessagesAnnotation` uses `addMessages` which handles `RemoveMessage` natively. This is the **correct fix for H2** (unbounded MemorySaver growth).

---

### `InMemoryStore` — `@langchain/langgraph`
**What it does:** A key-value + semantic search store for **cross-thread long-term memory** (separate from checkpointer). Supports namespaced `put/get/search/delete` operations.

```ts
import { InMemoryStore } from '@langchain/langgraph';

const store = new InMemoryStore();
await store.put(["user_facts", userId], "preference_1", { theme: "dark" });
const items = await store.search(["user_facts", userId], { query: "theme" });
```

**Currently:** Your project uses `faiss-node` + SQLite for vector memory (`src/database/vectorStore.ts`). `InMemoryStore` is a lighter alternative for facts/preferences that don't need embeddings. Not a replacement — complementary.

---

### `REMOVE_ALL_MESSAGES` — `@langchain/langgraph`
**What it does:** A sentinel value that, when returned from a node, wipes the entire message list in state. Useful for implementing `/clear` chat without restarting the graph.

```ts
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph';

// In the clear-chat handler — instead of creating a new thread_id:
await workflow.updateState(config, { messages: REMOVE_ALL_MESSAGES });
```

**Currently:** Chat clear creates a new session (new `thread_id`). `REMOVE_ALL_MESSAGES` lets you clear in-place on the same thread.

---

### `SqliteSaver` — `@langchain/langgraph-checkpoint-sqlite` ⚠️ requires install
**What it does:** Drop-in `MemorySaver` replacement that persists checkpoints to SQLite. State survives process restart natively — no need for `hydrateCheckpointer`.

```ts
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
const checkpointer = SqliteSaver.fromConnString("./data/checkpoints.db");
```

**Currently:** `MemorySaver` + custom `hydrateCheckpointer` function reimplements what `SqliteSaver` does natively. If you switch, `hydrateCheckpointer` can be deleted entirely.

**Install:** `npm install @langchain/langgraph-checkpoint-sqlite`

---

## Duplication Map — What forst-tui reimplements manually vs what's native

| forst-tui (before) | Native alternative | Status |
|---|---|---|
| Manual `sliceIndex` walk in `callModel` | `trimMessages()` | 🟡 Partial — `addMessages` adopted; token-aware trim optional |
| `msg._getType() === 'system'` exclusion loops | `filterMessages({ excludeTypes: ["system"] })` | ✅ Done |
| Consecutive human message collapse in `hydrateCheckpointer` | `mergeMessageRuns()` | ✅ Done |
| `reducer: (x, y) => x.concat(y)` with no delete | `addMessages` reducer + `RemoveMessage` | ✅ Done |
| `hydrateCheckpointer` entire function | `SqliteSaver` (with install) | ✅ Done |
| Chat clear via new `thread_id` | `REMOVE_ALL_MESSAGES` | ✅ Done |
| `faiss-node` vector memory | `InMemoryStore` | 🟢 No — keep faiss (richer) |

---

## Recommended Adoption Order

1. **`filterMessages`** — zero-risk drop-in, removes manual loops (Fix H3)
2. **`trimMessages`** — replaces manual `sliceIndex`, adds token-awareness (Fix H1 + H2 partial)
3. **`mergeMessageRuns`** — add at hydration time, reduces bloat
4. **`MessagesAnnotation` + `RemoveMessage`** — enables proper in-graph pruning (Fix H2 proper)
5. **`REMOVE_ALL_MESSAGES`** — cleaner chat clear
6. **`SqliteSaver`** (install required) — deletes `hydrateCheckpointer` entirely

---

# Tool Usage Optimization Plan

## Why tool calls are expensive
Each tool call is a synchronous round-trip: the LLM produces a tool-call block → tool executes → result is injected back → LLM re-evaluates the full context.
In agentic chains with `recursionLimit: 50`, redundant or sequential tool calls compound latency and token cost.

Three root causes:
1. Independent tool calls execute sequentially even when nothing blocks them from running in parallel
2. The same tool is called repeatedly with identical arguments within a session (no deduplication)
3. Primitive tools (single-file reads, shell `ls`) force the LLM into multi-turn patterns that bulk tools would resolve in one

---

## ✅ Fix A — Batch Independent Tool Calls in Parallel *(done)*
**File:** `src/core/Workflow.ts`

When the LLM emits multiple tool calls in a single response, they are currently executed one-by-one. Independent calls (e.g. `read_file A` + `read_file B` + `run_command ls`) can run concurrently.

**Change:** Configure `ToolNode` with parallel execution enabled. All tool calls in a single LLM response batch are dispatched concurrently via `Promise.all`. Results are collected and returned as a single observation block.

**Impact:** Cuts multi-tool turns from `N × tool_latency` to `max(tool_latency)`.

---

## ✅ Fix B — Deduplicate Redundant Tool Calls (Turn-Scoped Cache) *(done)*
**File:** `src/core/Workflow.ts`

The agent frequently re-reads the same files or re-runs the same commands in the same session (e.g. `read_file README.md` on turn 1, 3, and 7).

**Change:** Add a `Map<string, ToolResult>` cache keyed by `toolName + JSON.stringify(args)`. Before executing any tool, check the cache. On hit, return the cached result instantly. Clear on chat reset or explicit `clear_cache` command.

```ts
const toolCache = new Map<string, ToolResult>();
const cacheKey = `${toolName}::${JSON.stringify(sortedArgs)}`;
if (toolCache.has(cacheKey)) return toolCache.get(cacheKey)!;
const result = await tool.invoke(args);
toolCache.set(cacheKey, result);
return result;
```

**Do not cache** tools with side-effects: `run_command`, `edit_file`, `write_file`, `search`.

---

## Fix C — Extend `read_files` to Accept Bulk Paths
**File:** `src/tools/system/read_files.ts`

Reading 5 files currently costs 5 LLM turns (one tool call each). The tool already supports multiple files by name but the description doesn't signal this clearly enough to the LLM.

**Change:**
1. Ensure the schema accepts an **array** of paths (not just one)
2. Rewrite the tool description to explicitly say: *"Prefer passing all needed paths in one call over separate single-file calls"*
3. Return results as an array of `{ path, content }` objects

---

## ✅ Fix D — Add `write_file` and `list_directory` Native Tools *(done)*
**Files:** `src/tools/system/write_file.ts`, `src/tools/system/list_directory.ts`

The agent currently shells out to `bash -c "echo ... > file"` for writes and `ls` for directory scans.

**Change:** Implement two new tools:
- `write_file(path, content)` — atomic write with the same symlink/escape guard as `edit_file`
- `list_directory(path, recursive?)` — returns structured `{ name, type, size }[]` array, sandboxed to project root

Add both to the tool registry in `src/tools/index.ts`.

### Output style — match `read_files` short format
Both tools should return compact, line-numbered output so the LLM gets maximum signal in minimum tokens.

**`write_file` output:**
```
--- src/foo.ts (12 lines written) ---
   1 │ import { z } from 'zod';
   2 │
   3 │ export const foo = ...
   4 │ ...
     … (8 more lines)
```

**`list_directory` output:**
```
--- src/tools/system (6 entries) ---
   1 │ [FILE]  edit_file.ts        2.1 KB
   2 │ [FILE]  read_files.ts       1.8 KB
   3 │ [FILE]  write_file.ts         890 B
   4 │ [DIR]   __tests__
   5 │ [FILE]  memory.ts           3.4 KB
   6 │ [FILE]  run_command.ts      1.2 KB
```

**Rules (same as `read_files`):**
- Line numbers left-padded, separated by ` │ `
- Header: `--- <path> (<N> lines/entries) ---`
- Preview cap: first 8 lines, then `… (N more lines)`
- Errors inline: `--- <path> ---\nError: <message>`

---

## Fix E — Tool Usage Stats in StatusHeader
**Files:** `src/core/AppContext.tsx`, `src/components/StatusHeader.tsx`, `src/core/Workflow.ts`

No visibility into which tools are called how often or how much time they consume.

**Change:**
1. Add `toolStats: Record<string, { calls: number; totalMs: number }>` to `AppContext` state
2. In `Workflow.ts`, wrap each tool invocation with a timer that dispatches `UPDATE_TOOL_STATS`
3. In `StatusHeader.tsx`, show the top-used tool when stats exist:
   ```
   🛠 read_files ×12 (avg 4ms) | run_command ×4 (avg 210ms)
   ```
4. Reset stats on `CLEAR_CHAT`

---

## Files to Modify

| File | Change |
|---|---|
| `src/core/Workflow.ts` | Parallel `ToolNode`, turn-scoped dedup cache, tool timing dispatch |
| `src/tools/system/read_files.ts` | Accept array input, improve description |
| `src/tools/system/write_file.ts` | New tool — atomic write with path guard |
| `src/tools/system/list_directory.ts` | New tool — structured directory listing |
| `src/tools/index.ts` | Register `write_file` + `list_directory` |
| `src/core/AppContext.tsx` | Add `toolStats` to state + `UPDATE_TOOL_STATS` reducer |
| `src/components/StatusHeader.tsx` | Display live tool call stats |

---

## Implementation Order
1. `Workflow.ts` — parallel ToolNode (immediate latency win, no deps)
2. `Workflow.ts` — dedup cache (wraps existing tool calls, safe to layer on)
3. `read_files.ts` — bulk schema + description update
4. `write_file.ts` + `list_directory.ts` — new tools + registry
5. `AppContext.tsx` — add `toolStats`
6. `Workflow.ts` — dispatch timing to `UPDATE_TOOL_STATS`
7. `StatusHeader.tsx` — display stats

---

## Expected Gains

| Scenario | Before | After |
|---|---|---|
| Read 5 files in one turn | 5 sequential tool calls | **1 parallel batch** |
| Same file read 3× in session | 3 disk reads | **1 read + 2 cache hits** |
| Multi-tool LLM response | `N × latency` | **`max(latency)`** |
| Shell `ls` call | subprocess fork + bash | **native structured array** |

---

---

# History Saver Optimization Plan

## Why history wastes tokens

The current flow on every session resume:
```
SQLite (up to 100 msgs) → hydrateCheckpointer → MemorySaver → callModel slices to shortTermMemoryLimit → LLM
```

Three compounding problems:
1. `MemorySaver` receives 100 messages but only N are ever sent to the LLM — the rest sit in RAM unused
2. `MemorySaver`'s concat reducer grows unbounded all session — `getState()` returns an ever-growing list
3. `SystemMessage` is baked into the checkpointer state AND re-injected at call time — one of N window slots wasted

---

## ✅ Fix H1 — Limit `getMessages()` at Hydration Time *(done in PR #6)*
**File:** `src/index.tsx` (~line 403, `hydrateCheckpointer` call site)

`hydrateCheckpointer` currently calls `getMessages(sessionId)` with the default `limit: 100`. This pumps up to 100 messages into `MemorySaver` even though `callModel` will only use `shortTermMemoryLimit` of them.

**Change:** Pass a capped limit at the call site:
```ts
const messages = getMessages(
    sessionId,
    configManager.getSettings().shortTermMemoryLimit * 2
    // ×2 to keep full tool pairs (AI message + ToolMessage count as 2)
);
```

**Impact:** Hydration only loads what will actually be used — no bloat in MemorySaver from the start.

---

## ✅ Fix H2 — Prevent `MemorySaver` Growing Forever In-Session *(done)*
**Files:** `src/core/Workflow.ts`, `src/index.tsx`

The `AgentState` reducer is:
```ts
reducer: (x, y) => x.concat(y),  // appends every turn
```

This is correct for LangGraph's state model, but means `MemorySaver` holds the full unbounded history. After a 50-loop yolo run, `getState()` returns 50+ messages even though `callModel` only sends the last N.

**Change:** Two options (pick one):

**Option A — Periodic truncation (lighter):** After `callModel` slices, write a trimmed snapshot back every 20 messages:
```ts
if (nonSystemMessages.length > shortTermMemoryLimit * 2) {
    await workflow.updateState(config, { messages: recentMessages });
}
```

**Option B — Switch to `SqliteSaver` (cleaner):** Replace `MemorySaver` with `@langchain/langgraph-checkpoint-sqlite`. State persists to the same SQLite DB and can be queried/pruned. Removes the in-memory growth entirely.

---

## ✅ Fix H3 — Strip `SystemMessage` From Checkpointer State *(done in PR #6)*
**File:** `src/index.tsx` (`hydrateCheckpointer`, lines ~137–143)

Current code:
```ts
const langchainMessages = [
    new SystemMessage(getSystemPrompt(plannerMode)),  // ← stored in MemorySaver
    ...trimmed,
];
await appWorkflow.updateState(config, { messages: langchainMessages });
```

Then in `callModel` the system prompt is reconstructed and prepended again. The stored `SystemMessage` in `MemorySaver` counts as one of the `shortTermMemoryLimit` slots — so a history of 12 messages really only gets 11 real messages through.

**Change:** Remove `SystemMessage` from the hydration payload entirely:
```ts
await appWorkflow.updateState(config, { messages: trimmed });
// System prompt is always injected fresh inside callModel — never stored
```

---

## ✅ Fix H4 — Warn When `getMessages` Hits the 100-Message Cap *(done in PR #6)*
**File:** `src/database/messages.ts` (line ~71)

If a session exceeds 100 messages, `getMessages` silently returns only the first 100. The developer and user have no signal that history is being truncated at load time.

**Change:**
```ts
const rows = stmt.all(sessionId, limit) as any[];
if (rows.length === limit) {
    console.warn(`[messages] Session ${sessionId} hit the ${limit}-msg load cap — older messages not loaded.`);
}
```

---

## Files Modified

| File | Change | Status |
|---|---|---|
| `src/index.tsx` | Pass `shortTermMemoryLimit×2` to `getMessages()` at hydration; strip `SystemMessage` from `updateState()` payload | ✅ Done (PR #6) |
| `src/core/Workflow.ts` | Optional: periodic truncation write-back after slice | ⬜ Pending (Fix H2) |
| `src/database/messages.ts` | Add cap warning when `rows.length === limit` | ✅ Done (PR #6) |

---

## Implementation Order
1. `index.tsx` — Fix H3 first (strip SystemMessage from checkpointer) — zero risk, immediate correctness win
2. `index.tsx` — Fix H1 (cap `getMessages` at hydration) — reduces MemorySaver bloat from session start
3. `messages.ts` — Fix H4 (warning log) — pure observability, no behaviour change
4. `Workflow.ts` / `index.tsx` — Fix H2 (truncation or SqliteSaver) — heavier, do last

---

## Expected Savings

| Scenario | Before | After |
|---|---|---|
| Session resume hydration | Up to 100 msgs in MemorySaver | `shortTermMemoryLimit×2` msgs max |
| System prompt slot usage | 1 of N window slots consumed by stored SystemMessage | All N slots available for real messages |
| Long yolo session `getState()` | 50+ msg blob in RAM | Bounded to `shortTermMemoryLimit×2` |
| Silent history loss at 100 msgs | No warning | Console warn at cap |

---

# Token Optimization & Prompt Caching Plan

## Why
Every LLM call is stateless — the app resends `System Prompt + Full History + New Message` on every single turn.
In `yolo` + `plannerMode` with `recursionLimit: 50`, one user message can chain **50 loops**, each paying the full context cost (~3k–13k tokens/turn → up to 650k tokens per request).

Three root causes:
1. System prompt is rebuilt from disk (SQLite + file I/O) on every turn with no caching
2. No provider-side prompt caching hints are sent — Anthropic/OpenAI re-process the static prefix every time
3. `recursionLimit` defaults to 50 — far too high for most tasks

---

## ✅ Fix 1 — Split System Prompt into Static + Dynamic Layers *(done in PR #6)*
**File:** `src/core/Prompts.ts`

The current `getSystemPrompt()` mixes static rules with dynamic data (memories, skills, task context) into one string — this makes caching impossible since it changes every turn.

**Change:** Export two separate functions:
- `getStaticPrompt(plannerMode)` → base rules + planner instructions + skills *(stable per session — cache this)*
- `getDynamicContext()` → core memories only *(changes when user adds/deletes memories)*

In `Workflow.ts callModel`, build the final system message from two blocks:
1. **Block 1** (static): `getStaticPrompt()` → send with `cache_control` hint for Anthropic
2. **Block 2** (dynamic): `getDynamicContext()` + RAG context + `[CURRENT TASK]` → never cached

---

## ✅ Fix 2 — In-Memory Prompt String Cache *(done in PR #6)*
**File:** `src/core/Prompts.ts`

`getStaticPrompt()` currently re-reads all skill `.md` files on every agent turn. Add a module-level cache keyed by `plannerMode`:

```ts
const _cache = new Map<boolean, string>();
export const invalidatePromptCache = () => _cache.clear();

export const getStaticPrompt = (plannerMode: boolean): string => {
    if (_cache.has(plannerMode)) return _cache.get(plannerMode)!;
    const result = buildStaticPrompt(plannerMode);
    _cache.set(plannerMode, result);
    return result;
};
```

Call `invalidatePromptCache()` in:
- `src/tools/system/memory.ts` → after `addCoreMemory()` / `deleteCoreMemory()`
- `src/tools/system/skills.ts` → after `writeFileSync` (add) and `unlinkSync` (delete)

---

## ✅ Fix 3 — Anthropic Prompt Caching *(done in PR #6)*
**File:** `src/core/providers/AnthropicProvider.ts`

Anthropic caches any content block ≥ 1,024 tokens for 5 minutes. Cache hits cost **10% of normal input price**.

**Changes:**
1. Add `anthropic-beta: prompt-caching-2024-07-31` to client headers
2. In `Workflow.ts callModel`, send the static block with a cache control marker:
```ts
new SystemMessage({
    content: [{
        type: "text",
        text: staticPrompt,
        cache_control: { type: "ephemeral" }
    }]
})
```
3. Read back `cache_read_input_tokens` + `cache_creation_input_tokens` from response metadata for display

---

## ✅ Fix 4 — OpenAI / OpenRouter Prompt Caching *(done in PR #6)*
**File:** `src/core/providers/OpenAIProvider.ts`

OpenAI auto-caches prompt prefixes ≥ 1,024 tokens **for free** — but only when the prefix is byte-identical across calls. Fix 1 guarantees this by keeping the static block stable.

**Changes:**
- No API changes needed — caching activates automatically after Fix 1
- Read back `usage.prompt_tokens_details.cached_tokens` from response and dispatch to `UPDATE_USAGE`

---

## ✅ Fix 5 — Lower Default `recursionLimit` *(done in PR #6)*
**File:** `src/core/ConfigManager.ts` — line 39

```ts
recursionLimit: 15,  // was: 50
```

Most tasks complete in < 10 steps. This alone cuts worst-case per-request token cost by **70%**. Users can still raise it in Settings.

---

## ✅ Fix 6 — Display Cache Hit Stats in StatusHeader *(done in PR #6)*
**Files:** `src/core/AppContext.tsx`, `src/components/StatusHeader.tsx`, `src/index.tsx`

1. Add `cached: number` field to `TokenUsage` in `AppContext.tsx`
2. In `processStream` (`index.tsx` ~line 454), extract:
   - Anthropic: `response_metadata.cache_read_input_tokens`
   - OpenAI: `usage.prompt_tokens_details.cached_tokens`
3. Dispatch to `UPDATE_USAGE` with `cached` count
4. In `StatusHeader.tsx`, show when `totalUsage.cached > 0`:
   ```
   Tokens: 1200i / 300o (1500) | 💾 800 cached
   ```

---

## Files Modified *(all done in PR #6)*

| File | Change | Status |
|---|---|---|
| `src/core/Prompts.ts` | Split into `getStaticPrompt()` + `getDynamicContext()`, add `_cache` + `invalidatePromptCache()` | ✅ Done |
| `src/core/Workflow.ts` | Use split prompts in `callModel` — static block with cache hint, dynamic block separate | ✅ Done |
| `src/core/providers/AnthropicProvider.ts` | Add `anthropic-beta` header + `cache_control` on static system block | ✅ Done |
| `src/core/providers/OpenAIProvider.ts` | Read back `cached_tokens` from usage metadata | ✅ Done |
| `src/core/ConfigManager.ts` | `recursionLimit` default: `50` → `15` | ✅ Done |
| `src/core/AppContext.tsx` | Add `cached: number` to `TokenUsage` + `UPDATE_USAGE` reducer | ✅ Done |
| `src/components/StatusHeader.tsx` | Display `💾 N cached` when cache hits > 0 | ✅ Done |
| `src/tools/system/memory.ts` | Call `invalidatePromptCache()` after `add`/`delete` | ✅ Done |
| `src/tools/system/skills.ts` | Call `invalidatePromptCache()` after `add`/`delete` | ✅ Done |
| `src/index.tsx` | Extract cache hit tokens in `processStream` (~line 454), dispatch to `UPDATE_USAGE` | ✅ Done |

---

## Implementation Order
1. `Prompts.ts` — split + cache (unblocks everything else)
2. `memory.ts` + `skills.ts` — hook `invalidatePromptCache()`
3. `Workflow.ts` — restructure system message building to use split prompts
4. `AnthropicProvider.ts` — add cache_control header + beta flag
5. `OpenAIProvider.ts` — read back cached_tokens
6. `AppContext.tsx` — add `cached` to TokenUsage
7. `index.tsx` — extract cache stats in `processStream`
8. `StatusHeader.tsx` — display cache stats
9. `ConfigManager.ts` — lower recursionLimit default

---

## Expected Savings

| Scenario | Before | After |
|---|---|---|
| System prompt (Anthropic, turn 2+) | 100% cost | **~10% cost** (cache hit) |
| System prompt (OpenAI, turn 2+) | 100% cost | **~0% cost** (auto-cached) |
| Skill file I/O per turn | Every turn | **Once per session** |
| 50-step yolo run | ~650k tokens | **~195k tokens** (15 steps + caching) |

---

## Verification
- Anthropic: Send 2+ turn conversation → StatusHeader shows `💾 N cached` on turn 2
- Check `cache_creation_input_tokens` on turn 1, `cache_read_input_tokens` on turns 2+
- OpenAI: `cached_tokens` appears in stats after the first turn
- Memory add/delete → next turn sends fresh prompt (not stale cached version)
- `recursionLimit: 15` → long yolo tasks stop at 15 iterations
