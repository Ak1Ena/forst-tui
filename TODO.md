# forst-tui Progress Tracking

## Phase 1: Foundation & Setup
- [x] Initialize Node.js project (`package.json`, `tsconfig.json`)
- [x] Install core dependencies (Ink, LangChain, React, Better-SQLite3, zod)
- [x] Create directory structure (`src/core`, `src/tools`, `src/components`, `src/database`)
- [x] Set up basic Ink "Hello World" entry point in `src/index.ts`

## Phase 2: Database & State
- [ ] Initialize SQLite database schema for persistent memory
- [ ] Implement global state management (Zustand or React Context)
- [ ] Create basic message history logging logic

## Phase 3: LLM Core & Providers
- [ ] Implement `BaseProvider` abstract class
- [ ] Implement `GeminiProvider`
- [ ] Implement `LocalLLMProvider` (Ollama/LM Studio support)
- [ ] Implement OpenAI/OpenRouter support

## Phase 4: Tool System (Plugin Pattern)
- [ ] Create tool registration and discovery logic
- [ ] Implement system tools:
    - [ ] `run_command`
    - [ ] `read_files`
- [ ] Implement web tools:
    - [ ] `search` (e.g., Tavily or DuckDuckGo)
- [ ] Implement integration architecture (e.g., skeleton for Discord)

## Phase 5: Heartbeat & Background Tasks
- [ ] Create the Heartbeat event loop
- [ ] Implement user-controlled toggle logic for background tasks
- [ ] Create a sample monitor (e.g., system resource monitor or file watcher)

## Phase 6: TUI Components (The Interface)
- [ ] `ChatView`: Scrollable message list with markdown-like formatting
- [ ] `InputBar`: Multi-line text input with command support
- [ ] `ToolStatus`: Visual feedback for active tool execution
- [ ] `Sidebar/Settings`: UI for toggling providers and background tasks

## Phase 7: Orchestration & Integration
- [ ] Connect LangChain agent loop with the Ink UI
- [ ] Ensure tool outputs are streamed to the UI in real-time
- [ ] Implement error handling and "interrupt" capability

## Phase 8: Refinement & Testing
- [ ] Add unit tests for core logic
- [ ] Polish UI aesthetics (colors, borders, spinners)
- [ ] Finalize documentation and usage guide
