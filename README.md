# forst-tui 🌲

[![npm version](https://img.shields.io/npm/v/forst-tui.svg)](https://www.npmjs.com/package/forst-tui)

A powerful, globally installable Node.js-based TUI wrapper for LLMs, built with **LangGraph**, **LangChain**, and **Ink**.

## 🚀 Installation

Install globally to use `forst-tui` from any directory:

```bash
# From local directory
npm install -g .

# Or directly from GitHub
npm install -g git+https://github.com/Ak1Ena/forst-tui.git
```

### ⚠️ Troubleshooting: Permission Errors
If you see an `EACCES` or "permission denied" error during global installation:

1. **Recommended:** Use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions. It allows global installs without root privileges.
2. **Alternative:** Use `sudo` if you are using the system-installed Node:
   ```bash
   sudo npm install -g forst-tui
   ```
3. **npm prefix:** Alternatively, [configure npm to use a different directory](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

## ✨ Features

### 🧠 Agentic Workflow
- **LangGraph Orchestration**: Uses a state-based graph for robust agentic behavior (Agent → Tools → Router loop).
- **Observability**: Built-in **LangSmith** support for tracing thoughts and tool executions.
- **Automatic Titling**: Conversations are automatically named by the model after the first interaction.

### 🤖 Multi-Provider LLM Support
- **Provider Agnostic**: Supports Gemini, OpenAI, OpenRouter, and LocalLLMs (Ollama/LM Studio).
- **Dynamic Configuration**: Add and switch providers in real-time via the Settings view (**Ctrl+S**).

### 🛠️ Advanced Tool System
- **System Tools**: Run shell commands, list files, read files, and **write/edit code**.
- **File Writing**: The `write_file` tool can create or overwrite files, auto-creates missing directories, and returns a preview of the written content.
- **Vim Integration**: Use `/code <path>` to open files in `vim` directly from the chat.
- **Web Tools**: Search the web via DuckDuckGo.
- **Discord Integration**: Send messages to Discord channels.

### 🧩 Skill Manager
- **Persistent Skills**: Teach the AI specialized instructions or domain knowledge that persist across all sessions.
- **Markdown-based**: Skills are stored as `.md` files in `~/.forst-tui/skills/`.
- **Tool-driven**: The AI can `list`, `read`, `add`, and `delete` skills autonomously using the `manage_skills` tool.
- **Auto-injected**: All installed skills are automatically included in the system prompt at startup.

  ```
  # Example: telling the AI to add a skill
  "Remember that I always want TypeScript strict mode in my projects."
  ```

### 🧠 Core Memory
- **Cross-session Memory**: Store persistent facts about yourself, the user, or the world using the `core_memory` tool.
- **Categorized**: Memories are tagged as `ai`, `user`, or `world` for organized retrieval.
- **SQLite-backed**: Stored in `~/.forst-tui/core_memory.db` — survives restarts and reinstalls.
- **Full CRUD**: The AI can `add`, `list`, and `delete` individual memory entries by ID.

  | Action | Description |
  |--------|-------------|
  | `add`  | Store a new fact with a category |
  | `list` | Retrieve all stored memories |
  | `delete` | Remove a memory by its ID |

### 💾 Persistent Memory & Global Storage
- **Global Settings**: Configuration, history, skills, and memory are stored in **`~/.forst-tui/`**.
- **SQLite History**: Fully persistent, searchable message history.
- **Vector Memory**: Semantic retrieval using `faiss-node` for long-term project context.

### 🎨 Modern TUI Interface
- **Command Palette**: Access actions and tools via `/` suggestions.
- **Session Manager**: Interactive list (**Ctrl+R**) to switch or delete (`d`) sessions.
- **Two-Column Layout**: Real-time system stats (CPU/RAM) and background task monitors.
- **Visual Polish**: Animated spinners, syntax highlighting, and custom iconography.

## ⌨️ Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + S` | Toggle Settings / Change Provider |
| `Ctrl + R` | Open Session Manager (Switch/Delete) |
| `Ctrl + L` | Clear current chat display |
| `Up/Down` | Scroll chat history |
| `Esc` | Cancel active generation or Close Modals |
| `/` | Open Command/Tool palette |

## ⚙️ Configuration

Settings are managed in-app via **Ctrl+S** and saved to `~/.forst-tui/settings.config.json`.

To enable **LangSmith** tracing:
```bash
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY=your_langsmith_key
```

## 📂 Project Structure

```
~/.forst-tui/
├── settings.config.json   # Provider and app configuration
## 📂 Project Structure

```
~/.forst-tui/
├── settings.config.json   # Provider and app configuration
├── history.db             # SQLite message history
├── core_memory.db         # Persistent core memories
├── vector_store/          # FAISS semantic memory index
└── skills/                # Markdown skill files (auto-loaded)
```

**Source layout (`src/`):**
```
src/
├── index.tsx                        # Entry point
├── core/
│   ├── Agent.ts                     # LangGraph agent node
│   ├── AppContext.tsx                # Global React context
│   ├── ConfigManager.ts             # Settings read/write
│   ├── Heartbeat.ts                 # Keep-alive / health
│   ├── Prompts.ts                   # System prompt builder
│   ├── SkillManager.ts              # Skill file management
│   ├── ToolRetriever.ts             # Dynamic tool selection
│   ├── Workflow.ts                  # LangGraph graph definition
│   ├── monitors/
│   │   └── SystemMonitor.ts         # CPU/RAM stats
│   └── providers/
│       ├── BaseProvider.ts          # Abstract provider interface
│       ├── AnthropicProvider.ts
│       ├── GeminiProvider.ts
│       ├── LocalLLMProvider.ts      # Ollama / LM Studio
│       ├── OpenAIProvider.ts
│       └── ProviderFactory.ts       # Provider instantiation
├── tools/
│   ├── index.ts                     # Tool registry
│   ├── system/
│   │   ├── edit_file.ts
│   │   ├── list_files.ts
│   │   ├── memory.ts                # core_memory tool
│   │   ├── read_files.ts
│   │   ├── run_command.ts
│   │   ├── skills.ts                # manage_skills tool
│   │   └── write_file.ts
│   ├── web/
│   │   └── search.ts                # DuckDuckGo search
│   └── integrations/
│       └── discord.ts
├── components/
│   ├── AnimatedSpinner.tsx
│   ├── ChatView.tsx
│   ├── CodeBlock.tsx
│   ├── InputBar.tsx
│   ├── SessionListView.tsx
│   ├── SettingsView.tsx
│   ├── Sidebar.tsx
│   ├── StatusHeader.tsx
│   ├── Table.tsx
│   └── ToolStatus.tsx
└── database/
    ├── schema.ts                    # SQLite schema definitions
    ├── messages.ts                  # Chat history queries
    ├── coreMemory.ts                # Core memory CRUD
    └── vectorStore.ts               # FAISS vector store
```
