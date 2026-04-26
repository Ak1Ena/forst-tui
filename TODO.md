# forst-tui Progress Tracking

## Phase 1: Foundation & Setup
- [x] Initialize Node.js project (`package.json`, `tsconfig.json`)
- [x] Install core dependencies (Ink, LangChain, React, Better-SQLite3, zod)
- [x] Create directory structure (`src/core`, `src/tools`, `src/components`, `src/database`)
- [x] Set up basic Ink "Hello World" entry point in `src/index.ts`
- [x] Add Node version management (`.nvmrc`)

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
- [x] Install `hnswlib-node` and embedding dependencies
- [x] Implement `VectorStore` wrapper in `src/database/vectorStore.ts`
- [x] Integrate auto-embedding of messages into the chat loop
- [x] Add a search tool for semantic memory retrieval
