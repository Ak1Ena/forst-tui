# forst-tui
A Node.js-based TUI wrapper for LLMs, built with LangChain and Ink.

## Core Technologies
- **LangChain**: Orchestrates AI agents and tool-calling capabilities.
- **Ink**: React-style TUI for managing complex state and UI rendering in the terminal.
- **TypeScript**: Ensures type safety across providers and tool interfaces.
- **Better-SQLite3**: For persistent memory and conversation history.

## Project Structure
```text
/forst-tui
  /src
    /core           # Orchestration, LLM provider logic, agent loops
      /providers    # OpenAI, Gemini, Anthropic, LocalLLM implementations
    /tools          # Modular tool definitions (Plugin pattern)
      /system       # run_command, read_files
      /web          # search, read_pdf
      /integrations # Discord, Slack, etc.
    /components     # Ink React components (ChatView, ToolStatus, InputBar)
    /database       # SQLite schema and migration logic
    index.ts        # TUI Entry point
  /data             # Local storage for .sqlite and persistent logs
  /tests            # Unit and integration tests
```

## Architectural Mandates
### 1. Tool Management (Plugin Pattern)
To ensure the system is "human readable" and easily extendable:
- Every tool must reside in its own directory within `src/tools`.
- Tools must export a standard LangChain-compatible interface.
- Adding a new integration (like Discord) should be as simple as adding a new folder and registering it in the core tool index.

### 2. Provider Agnostic
- The `core/providers` layer must abstract LLM differences.
- Support for OpenAI, Gemini, Anthropic, and LocalLLMs (Ollama/LM Studio) must be implemented via a common `BaseProvider` class.

### 3. Heartbeat & Background Tasks
- The **Heartbeat** system monitors background integrations (e.g., watching for new Discord messages or system events).
- **User Control:** Background tasks MUST be optional and user-controllable. Users should be able to enable or disable specific background monitors via the TUI settings/UI.
- It should run as a decoupled event loop that feeds updates into the Ink UI state only when active.

### 4. State Management
- Use React Context or Zustand to manage global state:
  - `messages`: Conversation history.
  - `agentState`: Current thinking/acting status.
  - `activeTools`: History of tool execution and results.
