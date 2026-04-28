# forst-tui 🌲

[![npm version](https://img.shields.io/npm/v/forst-tui.svg)](https://www.npmjs.com/package/forst-tui)
[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A powerful, globally installable Node.js-based TUI wrapper for LLMs, built with **LangGraph**, **LangChain**, and **Ink**.

---

## 🚀 Installation

> **Requires Node.js >= 22.0.0** — use [nvm](https://github.com/nvm-sh/nvm) to manage versions.

```bash
# Install from npm (recommended)
npm install -g forst-tui

# Install from local directory
npm install -g .

# Install directly from GitHub
npm install -g git+https://github.com/Ak1Ena/forst-tui.git
```

### ⚠️ Troubleshooting: Permission Errors
If you see an `EACCES` or "permission denied" error during global installation:

1. **Recommended:** Use [nvm](https://github.com/nvm-sh/nvm) — allows global installs without root privileges.
2. **Alternative:** Use `sudo` with a system-installed Node:
   ```bash
   sudo npm install -g forst-tui
   ```
3. **npm prefix:** [Configure npm to use a different directory](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

---

## ✨ Features

### 🧠 Agentic Workflow
- **LangGraph Orchestration**: State-based graph for robust agentic behavior (Agent → Tools → Router loop).
- **Observability**: Built-in **LangSmith** support for tracing thoughts and tool executions.
- **Automatic Titling**: Conversations are automatically named by the model after the first interaction.

### 🤖 Multi-Provider LLM Support
- **Provider Agnostic**: Supports **Gemini**, **OpenAI**, **Anthropic (Claude)**, **OpenRouter**, and **LocalLLMs** (Ollama / LM Studio).
- **Dynamic Configuration**: Add and switch providers in real-time via the Settings view (**Ctrl+S**).

### 🛠️ Advanced Tool System
- **System Tools**: Run shell commands, list files, read files (with line-range support), and write/edit code.
- **File Editing**: The `edit_file` tool can create, insert, replace, or delete lines in files — auto-creates missing directories and returns a preview of changes.
- **Vim Integration**: Use `/code <path>` to open files in `vim` directly from the chat.
- **Web Tools**: Search the web via DuckDuckGo.
- **Discord Integration**: Send messages to Discord channels.

### 🧩 Skill Manager
- **Persistent Skills**: Teach the AI specialized instructions or domain knowledge that persist across all sessions.
- **Markdown-based**: Skills are stored as `.md` files in `~/.forst-tui/skills/`.
- **Tool-driven**: The AI can `list`, `read`, `add`, and `delete` skills autonomously via the `manage_skills` tool.
- **Auto-injected**: All installed skills are automatically included in the system prompt at startup.

  ```
  # Example: telling the AI to save a skill
  "Remember that I always want TypeScript strict mode in my projects."
  ```

### 🧠 Core Memory
- **Cross-session Memory**: Store persistent facts about yourself, the user, or the world using the `core_memory` tool.
- **Categorized**: Memories are tagged as `ai`, `user`, or `world` for organized retrieval.
- **SQLite-backed**: Stored in `~/.forst-tui/core_memory.db` — survives restarts and reinstalls.
- **Full CRUD**: The AI can `add`, `list`, `delete`, and `search` individual memory entries.

  | Action | Description |
  |--------|-------------|
  | `add`  | Store a new fact with a category |
  | `list` | Retrieve all stored memories |
  | `delete` | Remove a memory by its ID |
  | `search` | Semantic search over conversation history |

### 🔍 Contextual Retrieval (RAG)
- **Local Embeddings**: Uses a locally downloaded `bge-m3` model for fully offline semantic search.
- **FAISS Vector Store**: Efficient similarity search over long conversation histories.
- **Automatic Context Injection**: Relevant past conversation turns are injected into the system prompt automatically.
- **Progress Reporting**: Visual download progress bar shown when the embedding model is first installed.

### 💾 Persistent Memory & Global Storage
- **Global Settings**: Configuration, history, skills, and memory are stored in **`~/.forst-tui/`**.
- **SQLite History**: Fully persistent, searchable message history.
- **Vector Memory**: Semantic retrieval using `faiss-node` for long-term project context.

### 🎨 Modern TUI Interface
- **Command Palette**: Access actions and tools via `/` suggestions.
- **Session Manager**: Interactive list (**Ctrl+R**) to switch or delete (`d`) sessions.
- **Two-Column Layout**: Real-time system stats (CPU/RAM) and background task monitors.
- **Visual Polish**: Animated spinners, syntax highlighting, and custom iconography.
- **Code Blocks**: Dedicated syntax-highlighted code rendering in the chat view.

---

## ⌨️ Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl + S` | Toggle Settings / Change Provider |
| `Ctrl + R` | Open Session Manager (Switch / Delete) |
| `Ctrl + L` | Clear current chat display |
| `Up / Down` | Scroll chat history |
| `Esc` | Cancel active generation or close modals |
| `/` | Open Command / Tool palette |
| `d` | Delete session (while in Session Manager) |

---

## ⚙️ Configuration

Settings are managed in-app via **Ctrl+S** and saved to `~/.forst-tui/settings.config.json`.

To enable **LangSmith** tracing:
```bash
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY=your_langsmith_key
```

---

## 📂 Project Structure

```
~/.forst-tui/
├── settings.config.json   # Provider and app configuration
├── history.db             # SQLite message history
├── core_memory.db         # Persistent core memories
├── vector_store/          # FAISS semantic memory index
└── skills/                # Markdown skill files (auto-loaded)
```

**Source layout:**
```
src/
├── index.tsx                     # Entry point
├── core/
│   ├── Workflow.ts               # LangGraph agent orchestration
│   ├── Agent.ts                  # Agent logic
│   ├── Prompts.ts                # System prompt construction
│   ├── ConfigManager.ts          # Provider & app configuration
│   ├── SkillManager.ts           # Skill loading and management
│   ├── ToolRetriever.ts          # Dynamic tool registration
│   ├── Heartbeat.ts              # Background task event loop
│   ├── AppContext.tsx            # Global React context / state
│   ├── monitors/                 # Background monitor implementations
│   └── providers/                # LLM provider adapters
├── tools/
│   ├── system/                   # Shell, file read/write tools
│   ├── web/                      # DuckDuckGo search tool
│   └── integrations/             # Discord and other integrations
├── components/
│   ├── ChatView.tsx              # Scrollable message list
│   ├── InputBar.tsx              # Multi-line text input
│   ├── ToolStatus.tsx            # Tool execution visual feedback
│   ├── CodeBlock.tsx             # Syntax-highlighted code rendering
│   ├── Sidebar.tsx               # System stats & background tasks
│   ├── StatusHeader.tsx          # Real-time status dashboard
│   ├── SettingsView.tsx          # In-app settings editor
│   ├── SessionListView.tsx       # Session switch/delete UI
│   ├── Table.tsx                 # Structured data table component
│   └── AnimatedSpinner.tsx       # Thinking/acting spinner
└── database/                     # SQLite schema, CoreMemory & VectorStore
```

---

## 🛠️ Development

```bash
# Run in dev mode (no build step)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Rebuild native modules (after Node version change)
npm run rebuild
```

---

## 📦 Changelog

### v0.2.5
- Added line-range support and output limiting for the `read_files` tool
- Improved model download script with progress reporting and visual progress bar
- Added `postinstall` script to pre-download the embedding model on install
- Implemented local `bge-m3` embeddings and contextual retrieval (RAG) system
- Added `search` action to `core_memory` for semantic search over conversation history

---

## License
MIT — [Aki](https://github.com/Ak1Ena)
