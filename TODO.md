# forst-tui Progress Tracking

## LangChain / LangGraph Native Utilities — Adopt to Replace Manual Code

These are **already installed** (no new deps unless noted). Each replaces something forst-tui currently does by hand.

### 🔴 Replace manual `sliceIndex` walk → `trimMessages()`
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

### 🔴 Replace manual system/type exclusion loops → `filterMessages()`
**Current:** `hydrateCheckpointer` loops over messages checking `_getType() === 'system'` to exclude them.
**Native:** `filterMessages({ excludeTypes: ["system"] })` from `@langchain/core/messages`.
```ts
import { filterMessages } from '@langchain/core/messages';
const noSystem = filterMessages(trimmed, { excludeTypes: ["system"] });
await appWorkflow.updateState(config, { messages: noSystem }); // Fix H3
```
**File:** `src/index.tsx` (`hydrateCheckpointer`)

### 🔴 Replace `reducer: x.concat(y)` → `MessagesAnnotation` + `RemoveMessage`
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

### 🟡 Add `mergeMessageRuns()` at hydration to reduce bloat
**Current:** Consecutive human messages are collapsed manually. Tool/AI runs are not merged.
**Native:** `mergeMessageRuns()` from `@langchain/core/messages` collapses consecutive same-role messages before storing.
```ts
import { mergeMessageRuns } from '@langchain/core/messages';
const merged = mergeMessageRuns(trimmed); // fewer messages, same content
```
**File:** `src/index.tsx` (`hydrateCheckpointer`, before `updateState`)

### 🟡 Use `REMOVE_ALL_MESSAGES` for chat clear
**Current:** Clear chat creates a new `thread_id` / session. In-graph state is not explicitly wiped.
**Native:** `REMOVE_ALL_MESSAGES` sentinel wipes the message list on the existing thread in one call.
```ts
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph';
await workflow.updateState(config, { messages: REMOVE_ALL_MESSAGES });
```
**File:** `src/index.tsx` (clear chat handler)

### 🟢 Replace `MemorySaver` + `hydrateCheckpointer` → `SqliteSaver` *(requires install)*
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
- [ ] Add **Sound/Notification support** (optional) for background task alerts

## Phase 14: Dynamic Configuration System
- [x] Implement `ConfigManager` in `src/core/ConfigManager.ts` to manage `settings.config.json`
- [x] Support dynamic addition of LLM providers (name, apiKey, baseUrl, model)
- [x] Create a "Settings" view in the TUI to edit configuration in real-time
- [x] Migrate provider initialization to use `ConfigManager` instead of `.env`
- [ ] Implement secure storage/encryption for API keys (optional refinement)

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

### 🔴 Fix H2 — Prevent `MemorySaver` growing forever in-session
**Problem:** `AgentState` uses `reducer: (x, y) => x.concat(y)` — every agent turn appends to the in-memory state. After 50 yolo loops, `MemorySaver` holds 50+ messages. `callModel` slices before sending to LLM, but `getState()` returns the full bloated list.

**Solution:** After `callModel` slices to `shortTermMemoryLimit`, write back a truncated snapshot to the checkpointer every N turns (e.g. every 20 messages), or swap `MemorySaver` → `SqliteSaver` which naturally persists without unbounded RAM growth.

**Files:** `src/core/Workflow.ts` (post-slice truncation), `src/index.tsx` (checkpointer init)

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
- [ ] **Fix symlink escape in `edit_file`** — replace `path.resolve` check with `fs.realpathSync` to prevent escaping the project directory via symlinks (`src/tools/system/edit_file.ts`)
- [ ] **Deduplicate `Task`/`TaskStatus` types** — defined independently in both `AppContext.tsx` and `Workflow.ts`; export from one canonical location
- [x] **Update default Anthropic model ID** — `claude-3-5-sonnet-20240620` → `claude-3-5-sonnet-20241022` *(done in PR #6)*

### 🟡 Medium Priority
- [x] **Add logging to silent `hydrateCheckpointer` catch** — now logs via `console.warn` *(done in PR #6)*
- [ ] **Refactor `callModel` into named helpers** — the ~130-line function handles 5 distinct steps; extract each into a named helper for readability and testability (`src/core/Workflow.ts`)
- [ ] **Refactor fire-and-forget async IIFEs in escape handler** — async IIFEs in `useInput` are untracked and may cause issues on unmount (`src/index.tsx`)
- [ ] **Cache `SkillManager.loadSkills()` result** — currently re-reads all skill files from disk on every agent turn; add mtime-based caching (`src/core/SkillManager.ts`)

### 🟢 Low Priority
- [ ] **Fix hardcoded `Math.min(7, ...)` in SettingsView** — magic number must be manually kept in sync with fields array length (`src/components/SettingsView.tsx`)
- [ ] **Review module-load-time `toolRetriever.build()` ordering** — runs at import time before runtime config may be loaded (`src/core/Workflow.ts`)
- [ ] **Add unit tests** — TF-IDF retriever edge cases (empty query, single tool, zero scores), `edit_file` line range arithmetic (insert at 0, out-of-bounds), and `hydrateCheckpointer` message sanitization logic

---

## Tool Usage Optimization

### Why tool calls are expensive
Each tool call is a synchronous round-trip: the LLM emits a tool-call token block → tool executes → result injected back → LLM re-evaluates. In agentic chains with `recursionLimit: 50`, redundant or sequential tool calls multiply latency and token cost.

### 🔴 Fix A — Batch Independent Tool Calls in Parallel
**Problem:** Multi-step tasks call tools one-by-one even when they are completely independent (e.g. `read_file A`, `read_file B`, `run_command ls`).

**Solution:** Enable parallel tool calling via LangGraph's `ToolNode` with `parallel=true`. When the LLM emits multiple tool calls in one response, execute them concurrently.

**Files:** `src/core/Workflow.ts` (ToolNode config)

### 🔴 Fix B — Deduplicate Redundant Tool Calls (Tool Result Cache)
**Problem:** The agent re-reads the same files or re-runs the same commands across turns (e.g. `read_file README.md` called 3 times in one session).

**Solution:** Add a turn-scoped `Map<string, ToolResult>` cache keyed by `toolName + JSON.stringify(args)`. Return cached result immediately instead of re-executing. Clear cache when the agent loop resets.

**Files:** `src/core/Workflow.ts` — wrap `ToolNode` execution

### 🟡 Fix C — Prefer Bulk Tools Over Repeated Single-Item Calls
**Problem:** Reading 5 files = 5 separate `read_file` calls, each with its own LLM turn.

**Solution:** Extend `read_files` to accept an array of paths and return all results in one call. Update tool description so the LLM knows to prefer bulk over single.

**Files:** `src/tools/system/read_files.ts`

### 🟡 Fix D — Add `write_file` and `list_directory` to Reduce Command Shelling
**Problem:** The agent shells out to `bash` for simple file writes and `ls` — this is slow, OS-dependent, and bypasses error handling.

**Solution:** Implement native `write_file` and `list_directory` tools with proper path sandboxing (same symlink guard as `edit_file`).

Both must use the **short line-numbered output format** matching `read_files`:
```
--- <path> (<N> lines/entries) ---
   1 │ <line or entry>
   2 │ ...
     … (N more lines)
```
- Header: `--- <path> (<N> lines written / entries) ---`
- Lines left-padded and separated by ` │ `
- Preview cap: first 8 lines, then `… (N more lines)`
- Errors inline: `--- <path> ---\nError: <message>`

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
