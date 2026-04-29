# forst-tui Progress Tracking

## LangChain / LangGraph Native Utilities — Adopt to Replace Manual Code

These are **already installed** (no new deps unless noted). Each replaces something forst-tui currently does by hand.

### ✅ Replace manual `sliceIndex` walk → `trimMessages()` *(partially addressed — addMessages reducer adopted; full trimMessages() token-aware trim remains optional)*
**Current:** `callModel` in `Workflow.ts` lines 162–175 manually walks backward to find a safe slice boundary.
**Native:** `trimMessages()` from `@langchain/core/messages` does this token-aware with `startOn`, `endOn`, and `includeSystem` guards.
```ts
import { trimMessages } from '@langchain/core/messages';
const recent = await trimMessages(nonSystemMessages, {
    maxTokens: 4000, tokenCounter: model,
    strategy: "last", includeSystem: true, startOn: "human",
});
```
**File:** `src/core/Workflow.ts` (replace lines 162–177)

### ✅ Replace manual system/type exclusion loops → `filterMessages()` *(done)*
**Current:** `hydrateCheckpointer` loops over messages checking `_getType() === 'system'` to exclude them.
**Native:** `filterMessages({ excludeTypes: ["system"] })` from `@langchain/core/messages`.
```ts
import { filterMessages } from '@langchain/core/messages';
const noSystem = filterMessages(trimmed, { excludeTypes: ["system"] });
await appWorkflow.updateState(config, { messages: noSystem }); // Fix H3
```
**File:** `src/index.tsx` (`hydrateCheckpointer`)

### ✅ Replace `reducer: x.concat(y)` → `addMessages` reducer *(done — uses addMessages which supports RemoveMessage)*
**Current:** `AgentState` uses a plain concat reducer — no way to delete messages, MemorySaver bloats forever (Fix H2).
**Native:** `MessagesAnnotation` from `@langchain/langgraph` uses `addMessages` reducer which supports `RemoveMessage` for in-graph pruning.
```ts
import { MessagesAnnotation } from '@langchain/langgraph';
import { RemoveMessage } from '@langchain/core/messages';
// In AgentState:
messages: MessagesAnnotation.spec,
// To prune old messages from within a node:
return { messages: [new RemoveMessage({ id: oldMsg.id })] };
```
**File:** `src/core/Workflow.ts` (AgentState definition, line ~17)

### ✅ Add `mergeMessageRuns()` at hydration to reduce bloat *(done)*
**Current:** Consecutive human messages are collapsed manually. Tool/AI runs are not merged.
**Native:** `mergeMessageRuns()` from `@langchain/core/messages` collapses consecutive same-role messages before storing.
```ts
import { mergeMessageRuns } from '@langchain/core/messages';
const merged = mergeMessageRuns(trimmed); // fewer messages, same content
```
**File:** `src/index.tsx` (`hydrateCheckpointer`, before `updateState`)

### ✅ Use `REMOVE_ALL_MESSAGES` for chat clear (done)
**Current:** Clear chat creates a new `thread_id` / session. In-graph state is not explicitly wiped.
**Native:** `REMOVE_ALL_MESSAGES` sentinel wipes the message list on the existing thread in one call.
```ts
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
await workflow.updateState(config, { messages: REMOVE_ALL_MESSAGES });
```
**File:** `src/index.tsx` (clear chat handler)

### ✅ Replace `MemorySaver` + `hydrateCheckpointer` → `SqliteSaver` (done)
**Current:** `MemorySaver` (RAM only) + custom `hydrateCheckpointer` that replays DB messages on every session load.
**Native:** `SqliteSaver` from `@langchain/langgraph-checkpoint-sqlite` persists checkpoints natively — `hydrateCheckpointer` can be deleted entirely.
**Install:** `npm install @langchain/langgraph-checkpoint-sqlite`
**File:** `src/index.tsx` (checkpointer init, ~line 30)

---

## History Saver Optimization
- [x] Initialize Node.js project (`package.json`, `tsconfig.json`)
- [x] Install core dependencies (Ink, LangChain, React, Better-SQLite3, zod)
- [x] Create directory structure (`src/core`, `src/tools`, `src/components`, `src/database`)
- [x] Set up basic Ink "Hello World" entry point in `src/index.ts`
- [x] Add Node version management (`.nvmrc`)
- [x] Configure npm to handle dependency conflicts (`.npmrc`)

## Phase 2: Database & State
- [x] Initialize SQLite database schema for persistent memory
- [x] Implement global state management (Zustand or React Context)
- [x] Create basic message history logging logic

## Phase 3: LLM Core & Providers
- [x] Implement `BaseProvider` abstract class
- [x] Implement `GeminiProvider`
- [x] Implement `LocalLLMProvider` (Ollama/LM Studio support)
- [x] Implement OpenAI/OpenRouter support

## Phase 4: Tool System (Plugin Pattern)
- [x] Create tool registration and discovery logic
- [x] Implement system tools:
    - [x] `run_command`
    - [x] `read_files`
- [x] Implement web tools:
    - [x] `search` (e.g., Tavily or DuckDuckGo)
- [x] Implement integration architecture (e.g., skeleton for Discord)

## Phase 5: Heartbeat & Background Tasks
- [x] Create the Heartbeat event loop
- [x] Implement user-controlled toggle logic for background tasks
- [x] Create a sample monitor (e.g., system resource monitor or file watcher)

## Phase 6: TUI Components (The Interface)
- [x] `ChatView`: Scrollable message list with markdown-like formatting
- [x] `InputBar`: Multi-line text input with command support
- [x] `ToolStatus`: Visual feedback for active tool execution
- [x] `Sidebar/Settings`: UI for toggling providers and background tasks

## Phase 7: Orchestration & Integration
- [x] Connect LangChain agent loop with the Ink UI
- [x] Ensure tool outputs are streamed to the UI in real-time
- [x] Implement error handling and "interrupt" capability

## Phase 8: Refinement & Testing
- [x] Add unit tests for core logic
- [x] Polish UI aesthetics (colors, borders, spinners)
- [x] Finalize documentation and usage guide

## Phase 9: Vector Database (Semantic Memory)
- [x] Install `faiss-node` and embedding dependencies
- [x] Implement `VectorStore` wrapper in `src/database/vectorStore.ts`
- [x] Integrate auto-embedding of messages into the chat loop
- [x] Add a search tool for semantic memory retrieval

## Phase 10: Advanced UI Layout & Panels
- [x] Implement a **Dynamic Sidebar** for system stats and active background tasks
- [x] Create a **Two-Column Layout** (Left: Chat, Right: Tools & System Info)
- [x] Add a **Header Dashboard** with real-time status icons (LLM Status, DB connection, Network)
- [ ] Implement **Tabs/Views** to switch between Chat, History, and Settings

## Phase 11: Visual Polish & Aesthetics
- [ ] Integrate **Gradients and Themes** (e.g., Support for 'Nord', 'Dracula', 'Monokai' color schemes)
- [x] Add **Animated Spinners** and progress bars for LLM "Thinking" and Tool "Acting" states
- [x] Implement **Syntax Highlighting** for code blocks within the ChatView
- [x] Use **Icons/Symbols** (Lucide-style) for different message types (User 👤, AI 🤖, Tool 🛠️, System ⚙️)

## Phase 12: Rich Content Rendering
- [ ] Implement **Markdown Parsing** for bold, italic, and list items in chat messages
- [x] Create a **Table Component** for displaying structured tool outputs (e.g., file lists, process info)
- [x] Add **Scroll Indicators** and better viewport management for long conversations
- [ ] Implement **Breadcrumbs** for showing the current chain of thought/tool execution path

## Phase 13: Interactive Experience
- [x] Add **Keyboard Shortcuts** (e.g., `Ctrl+L` to clear chat)
- [x] Implement a **Command Palette** (accessible via `/`) for quick actions (change provider, clear chat, toggle heartbeat)
- [ ] Create **Modal/Overlay** support for settings and detailed tool logs
- [X] Add **Sound/Notification support** (optional) for background task alerts

## Phase 14: Dynamic Configuration System
- [x] Implement `ConfigManager` in `src/core/ConfigManager.ts` to manage `settings.config.json`
- [x] Support dynamic addition of LLM providers (name, apiKey, baseUrl, model)
- [x] Create a "Settings" view in the TUI to edit configuration in real-time
- [x] Migrate provider initialization to use `ConfigManager` instead of `.env`
- [X] Implement secure storage/encryption for API keys (optional refinement)

## Phase 15: Agentic Workflow (LangGraph & LangSmith)
- [x] Install `@langchain/langgraph` and `langsmith`
- [x] Implement `getModel()` across providers to expose underlying LangChain models
- [x] Define graph state and nodes in `src/core/Workflow.ts`
- [x] Implement a tool-calling node and a router node using LangGraph
- [x] Integrate LangGraph workflow into the main `index.tsx` chat loop
- [x] Configure LangSmith environment variables for tracing and observability

## Phase 16: Coworker Mode Enhancements
- [ ] **Recursive Task Management** — Allow Coworker mode to create and start tasks with a specific `recursiveLimit`.
    - [ ] Use the user's defined recursion limit for single tasks by default.
    - [ ] If a task fails or hits the limit, implement a "Request User Intervention" flow to ask how to proceed.

## History Saver Optimization

### Why history wastes tokens
Every session resume calls `hydrateCheckpointer` which loads messages from SQLite → stuffs them into `MemorySaver`. The `MemorySaver` concat reducer then grows unbounded all session. The system prompt is stored *inside* the checkpointer state AND re-injected every turn — burning one of the limited `shortTermMemoryLimit` slots twice.

### ✅ Fix H1 — Limit `getMessages()` at hydration time *(done in PR #6)*
**Problem:** `hydrateCheckpointer` calls `getMessages(sessionId)` with the default `limit: 100` — pumping up to 100 raw messages into `MemorySaver` on every session resume, regardless of `shortTermMemoryLimit`.

**Solution:** Pass `shortTermMemoryLimit × 2` (accounts for tool pairs) to `getMessages()` at hydration:
```ts
const messages = getMessages(sessionId, configManager.getSettings().shortTermMemoryLimit * 2);
```
**Files:** `src/index.tsx` (`hydrateCheckpointer` call, ~line 403)

### ✅ Fix H2 — Prevent `MemorySaver` growing forever in-session *(done)*
**Problem:** `AgentState` uses `reducer: (x, y) => x.concat(y)` — every agent turn appends to the in-memory state. After 50 yolo loops, `MemorySaver` holds 50+ messages. `callModel` slices before sending to LLM, but `getState()` returns the full bloated list.

**Solution:** Replaced `reducer: (x, y) => x.concat(y)` with `addMessages` reducer from `@langchain/langgraph`. This enables in-graph pruning via `RemoveMessage` and prevents unbounded appends.

**Files:** `src/core/Workflow.ts` (AgentState messages reducer)

### ✅ Fix H3 — Never store `SystemMessage` inside the checkpointer *(done in PR #6)*
**Problem:** `hydrateCheckpointer` prepends `new SystemMessage(getSystemPrompt())` into the messages array before calling `updateState()`. Then `callModel` injects the system prompt again at invocation time. The prompt is stored as `message[0]` in `MemorySaver` — permanently consuming 1 of N `shortTermMemoryLimit` slots.

**Solution:** Strip all `SystemMessage` entries before calling `updateState()` in `hydrateCheckpointer`. System prompt is always injected fresh at `callModel` time — never persisted in state.

**Files:** `src/index.tsx` (`hydrateCheckpointer`, line ~137–143)

### ✅ Fix H4 — Warn when `getMessages` silently hits the 100-message cap *(done in PR #6)*
**Problem:** If a session grows past 100 messages, `getMessages` silently returns only the first 100 and drops the rest, with no warning to the developer or user.

**Solution:** After `stmt.all()`, check if `rows.length === limit` and log a warning:
```ts
if (rows.length === limit) console.warn(`[messages] Session ${sessionId} hit the ${limit}-message load cap.`);
```
**Files:** `src/database/messages.ts` (line ~71)

---

## Code Review: `develop` Branch — Action Items

### 🔴 High Priority
- [x] **Fix symlink escape in `edit_file`** — replaced `path.resolve` check with `fs.realpathSync` in `edit_file.ts` and `write_file.ts`
- [x] **Deduplicate `Task`/`TaskStatus` types** — removed from `Workflow.ts`; now imported from `AppContext.tsx`
- [x] **Update default Anthropic model ID** — `claude-3-5-sonnet-20240620` → `claude-3-5-sonnet-20241022` *(done in PR #6)*

### 🟡 Medium Priority
- [x] **Add logging to silent `hydrateCheckpointer` catch** — now logs via `console.warn` *(done in PR #6)*
- [x] **Refactor `callModel` into named helpers** — the ~130-line function handles 5 distinct steps; extracted each into a named helper for readability and testability (`src/core/Workflow.ts`)
- [x] **Refactor fire-and-forget async IIFEs in escape handler** — async IIFEs in `useInput` now use `syncGraphState` helper (`src/index.tsx`)
- [x] **Cache `SkillManager.loadSkills()` result** — added mtime-based cache; `invalidateCache()` method added (`src/core/SkillManager.ts`)

### 🟢 Low Priority
- [x] **Fix hardcoded `Math.min(7, ...)` in SettingsView** — now uses `fields.length - 1` (`src/components/SettingsView.tsx`)
- [x] **Review module-load-time `toolRetriever.build()` ordering** — now lazy-built inside `createAgentWorkflow` (`src/core/Workflow.ts`)
- [x] **Add unit tests** — TF-IDF retriever edge cases, history truncation, and Anthropic sanitization logic (see `tests/workflow.test.ts` and `tests/toolRetriever.test.ts`)

---

## Tool Usage Optimization

### Why tool calls are expensive
Each tool call is a synchronous round-trip: the LLM emits a tool-call token block → tool executes → result injected back → LLM re-evaluates. In agentic chains with `recursionLimit: 50`, redundant or sequential tool calls multiply latency and token cost.

### ✅ Fix A — Batch Independent Tool Calls in Parallel *(done)*
**Problem:** Multi-step tasks call tools one-by-one even when they are completely independent (e.g. `read_file A`, `read_file B`, `run_command ls`).

**Solution:** Replaced `ToolNode` with a custom `parallelToolNode` that dispatches all tool calls in a single LLM response concurrently via `Promise.all`. Results collected and returned as an array.

**Files:** `src/core/Workflow.ts`

### ✅ Fix B — Deduplicate Redundant Tool Calls (Tool Result Cache) *(done)*
**Problem:** The agent re-reads the same files or re-runs the same commands across turns (e.g. `read_file README.md` called 3 times in one session).

**Solution:** Added turn-scoped `Map<string, string>` cache keyed by `toolName + JSON.stringify(args)`. Caches `read_files`, `list_files`, `list_directory`. Clears on each new human turn. Write/exec tools not cached.

**Files:** `src/core/Workflow.ts`

### 🟡 Fix C — Prefer Bulk Tools Over Repeated Single-Item Calls
**Problem:** Reading 5 files = 5 separate `read_file` calls, each with its own LLM turn.

**Solution:** Extend `read_files` to accept an array of paths and return all results in one call. Update tool description so the LLM knows to prefer bulk over single.

**Files:** `src/tools/system/read_files.ts`

### ✅ Fix D — Add `write_file` and `list_directory` to Reduce Command Shelling *(done)*
**Problem:** The agent shells out to `bash` for simple file writes and `ls` — this is slow, OS-dependent, and bypasses error handling.

**Solution:** Implemented native `write_file` (rewritten with realpathSync guard + numbered output) and new `list_directory` tool with structured output. Both sandboxed to project root. Registered in `src/tools/index.ts`.

**Files:** `src/tools/system/write_file.ts`, `src/tools/system/list_directory.ts`, `src/tools/index.ts`

### 🟢 Fix E — Add Tool Usage Stats to StatusHeader
**Problem:** No visibility into which tools are called how often or how much time they consume.

**Solution:** Track per-tool call count + cumulative ms in `AppContext`. Display top tool + call count in `StatusHeader` (e.g. `🛠 read_files ×12 | run_command ×4`). Reset on chat clear.

**Files:** `src/core/AppContext.tsx`, `src/components/StatusHeader.tsx`, `src/core/Workflow.ts`

---

## Token Cost Reduction & Prompt Caching

### Why tokens grow every turn
Every LLM call is stateless — the app must resend `System Prompt + Full History + New Message` on every single turn.
In `yolo` + `plannerMode` with `recursionLimit: 50`, a single user request can chain 50 agentic loops, each paying the full context cost.

### 🔴 Fix 1 — Split & Freeze the System Prompt (biggest win)
**Problem:** `getSystemPrompt()` rebuilds the entire prompt on every turn, mixing static rules with dynamic data (memories, skills, task context). This prevents any caching.

**Solution:** Split into two layers:
- **Static layer** (never changes per session): base rules, planner instructions, skills → cache this
- **Dynamic layer** (changes per turn): current task, RAG context, core memories → inject separately

**Files:** `src/core/Prompts.ts`, `src/core/Workflow.ts`

### 🔴 Fix 2 — Enable Anthropic Prompt Caching
**Problem:** `AnthropicProvider.ts` sends raw `SystemMessage` with no cache hints — Anthropic re-processes the full system prompt on every turn.

**Solution:** Use `cache_control: { type: "ephemeral" }` on the static system prompt block. Anthropic caches any content block ≥ 1,024 tokens for 5 minutes, charging only 10% of normal input cost on cache hits.

```ts
// AnthropicProvider.ts — use anthropic_cache_control metadata
new SystemMessage({
    content: staticPrompt,
    additional_kwargs: {
        cache_control: { type: "ephemeral" }  // marks this block for caching
    }
})
```

**Files:** `src/core/providers/AnthropicProvider.ts`, `src/core/Prompts.ts`

### 🔴 Fix 3 — Enable OpenAI Prompt Caching
**Problem:** OpenAI (GPT-4o, o-series) auto-caches prompts ≥ 1,024 tokens, but only if the **prefix is identical** across calls. The current dynamic prompt rebuilds break prefix stability.

**Solution:** Once Fix 1 splits the prompt, ensure the static prefix is always identical and always placed first — OpenAI caching kicks in automatically with no API changes needed. Add `cached_tokens` read-back from `usage` to verify hits.

**Files:** `src/core/providers/OpenAIProvider.ts` (read `usage.prompt_tokens_details.cached_tokens`)

### 🟡 Fix 4 — Cache the System Prompt String in Memory
**Problem:** `getSystemPrompt()` calls `getCoreMemories()` + `SkillManager.loadSkills()` (disk I/O) on **every agent turn**.

**Solution:** Cache the result in a module-level variable, invalidate only when memories/skills are explicitly modified via their tools.

```ts
// Prompts.ts
let _cachedPrompt: string | null = null;
export const invalidatePromptCache = () => { _cachedPrompt = null; };
export const getSystemPrompt = (plannerMode: boolean) => {
    if (_cachedPrompt) return _cachedPrompt;
    _cachedPrompt = buildPrompt(plannerMode);
    return _cachedPrompt;
};
```

Call `invalidatePromptCache()` in `memoryTool` and `skillsTool` after write operations.

**Files:** `src/core/Prompts.ts`, `src/tools/system/memory.ts`, `src/tools/system/skills.ts`

### 🟡 Fix 5 — Lower Default `recursionLimit`
**Problem:** Default of 50 allows 50 full-context LLM calls per user message in `yolo` mode.

**Solution:** Lower default to `15`. Most tasks complete in under 10 steps. Power users can raise it in Settings.

**Files:** `src/core/ConfigManager.ts` (change default from `50` → `15`)

### 🟢 Fix 6 — Display Cache Hit Stats in StatusHeader
**Problem:** No visibility into whether caching is working.

**Solution:** Read `cache_read_input_tokens` / `cache_creation_input_tokens` from Anthropic response metadata and `usage.prompt_tokens_details.cached_tokens` from OpenAI. Display as a small indicator in `StatusHeader.tsx` (e.g. `💾 cache hit: 4,200 tok`).

**Files:** `src/components/StatusHeader.tsx`, `src/core/providers/AnthropicProvider.ts`, `src/core/providers/OpenAIProvider.ts`

## System Prompt Context Optimization (Target: 10-20k tokens)
- [x] **Fix Relevant Memories (Top-K)**: Implemented keyword-based (TF-IDF style) Top-5 retrieval for core memories in `Workflow.ts`.
- [x] **Recent Messages Context**: `truncateHistory` is used to provide a lean "Recent Messages" block.
- [x] **Context Ordering**: Strict sequence enforced: `Static (Cached) -> Relevant Memories (Top-K) -> Recent Messages -> Selected Tools (Top-K)`.
- [x] **Pruning**: Top-K retrieval for both memories and conversation RAG keeps prompt size stable.

---

## Repo Index & Cross-Session Token Reduction

### The Problem
Every new session (or new provider) re-reads the entire repo from scratch to understand it.
A single "review this repo" task burns ~70k tokens because the agent reads full file contents
instead of summaries. After an `edit_file`, the agent re-reads the whole file to verify the change.
This cost is paid **per session, per provider** — the same understanding is never reused.

### Architecture: Folder-Level Summaries

```
.forst/
  repo-index.md            ← top-level map: project purpose, folder list, entry points, key patterns
  summaries/
    src_core.md            ← what's in src/core/, key classes, how they connect
    src_components.md      ← what's in src/components/, which component does what
    src_tools.md           ← what's in src/tools/, each tool's purpose + input/output
    src_database.md        ← schema overview, what each DB module does
    tests.md               ← what's tested, test patterns used
    scripts.md             ← build/utility scripts
```

Each summary file includes a content hash header so staleness can be detected cheaply:
```md
<!-- hash: a3f92b1c | updated: 2026-04-29 | files: Workflow.ts,Agent.ts,Prompts.ts -->
# src/core/
...
```

**Token cost comparison:**
- Current: ~70k tokens per session (reads raw files)
- After:   ~500 tokens per session (loads repo-index.md + relevant folder summary only)
- Savings: pay 70k once ever, then reuse across all sessions and all providers

---

### Fix R1 — `index_repo` Tool (One-Time Repo Scanner)
**Status:** 🔴 Not started

**What it does:**
- Walks the repo folder by folder
- For each folder: reads all files, generates a summary into `.forst/summaries/<folder>.md`
- Writes `.forst/repo-index.md` linking all summaries with a high-level project overview
- Stores a content hash of each file inside the summary so staleness can be checked without re-reading

**Trigger:** Agent calls `index_repo` once manually, or auto-triggered when `.forst/repo-index.md` is missing.

**Files to create:**
- `src/tools/system/index_repo.ts` — new tool
- `src/tools/index.ts` — register it

---

### Fix R2 — Staleness Detection & Incremental Re-index
**Status:** 🔴 Not started  
**Depends on:** Fix R1

**What it does:**
- On session start, check each `.forst/summaries/*.md` hash against current file mtimes
- If a folder's files changed since last summary → regenerate only that folder's summary
- Untouched folders → load summary as-is, zero re-read cost

**Implementation:**
- `index_repo` tool accepts an optional `folder` arg to re-index a single folder
- `edit_file.ts` — after a successful edit, mark the affected folder summary as stale
  by appending `<!-- stale -->` to its header (or deleting the hash line)
- On next session start, stale summaries are regenerated before the first agent turn

**Files to modify:**
- `src/tools/system/index_repo.ts` — add single-folder re-index mode
- `src/tools/system/edit_file.ts` — add post-edit stale marker write

---

### Fix R3 — Auto-inject `repo-index.md` into Static System Prompt
**Status:** 🔴 Not started  
**Depends on:** Fix R1

**What it does:**
- On session start, if `.forst/repo-index.md` exists, load it and append to the static system prompt
- Agent starts every session already knowing the project structure — no `list_files` / `read_files` needed to orient itself
- Pairs with Anthropic `cache_control: ephemeral` (Fix 2) so the index is cached too

**Files to modify:**
- `src/core/Prompts.ts` — read `.forst/repo-index.md` in `getStaticPrompt()`, append if present

---

### Fix R4 — Smart `read_files` Guard (Suggest Summary First)
**Status:** 🔴 Not started  
**Depends on:** Fix R1

**What it does:**
- When agent calls `read_files` on a source file, check if a folder summary exists for its parent folder
- If yes AND the summary is not stale → return the summary content instead, with a note:
  `"[Folder summary available — returning .forst/summaries/src_core.md instead of full file.
    Call read_files with force: true to read the raw file.]"`
- Agent can override with `force: true` when it genuinely needs raw line content (e.g. before a targeted edit)

**Files to modify:**
- `src/tools/system/read_files.ts` — add summary-first intercept logic

---

### Fix R5 — Post-Edit Targeted Validation (No Full Re-read)
**Status:** 🔴 Not started

**What it does:**
- After `edit_file` succeeds, it already returns the changed lines in its response
- Agent should trust this confirmation and NOT call `read_files` on the same file again
- If the agent does call `read_files` on a file that was just edited this turn → intercept and return
  only the edited lines ±10 lines of context, not the full file

**Implementation:**
- `edit_file.ts` — enrich the return value to include a diff-style summary:
  ```
  ✅ Edit applied: src/core/Workflow.ts
  Line 42: - const old = x;
           + const old = y;
  Context (lines 38–46): [snippet]
  ```
- `Workflow.ts` (`toolResultCache`) — after an `edit_file` call, store a `post-edit:<path>` marker
- `read_files.ts` — if `post-edit:<path>` marker exists in cache, return only surrounding lines

**Files to modify:**
- `src/tools/system/edit_file.ts` — return rich diff confirmation
- `src/tools/system/read_files.ts` — check post-edit cache marker, slice to context window
- `src/core/Workflow.ts` — extend `toolResultCache` to track recently-edited files

---

### Fix R6 — Cross-Provider Shared Index
**Status:** 🔴 Not started  
**Depends on:** Fix R1

**What it does:**
- `.forst/` folder is provider-agnostic plain markdown — any provider (Claude, Gemini, GPT, Ollama) reads the same index
- No re-indexing needed when switching providers mid-project
- Commit `.forst/repo-index.md` and `.forst/summaries/` to git so the index travels with the repo
  (add `.forst/summaries/*.md` to `.gitignore` optionally if summaries contain sensitive paths)

**Files to modify:**
- `.gitignore` — decide whether to track or ignore `.forst/summaries/`
- `README.md` — document the `.forst/` convention
