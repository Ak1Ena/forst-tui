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

### 🧠 Agentic Workflow (NEW)
- **LangGraph Orchestration**: Uses a state-based graph for robust agentic behavior (Agent -> Tools -> Router loop).
- **Observability**: Built-in **LangSmith** support for tracing thoughts and tool executions.
- **Automatic Titling**: Conversations are automatically named by the model after the first interaction.

### 🤖 Multi-Provider LLM Support
- **Provider Agnostic**: Supports Gemini, OpenAI, OpenRouter, and LocalLLMs (Ollama/LM Studio).
- **Dynamic Configuration**: Add and switch providers in real-time via the Settings view (**Ctrl+S**).

### 🛠️ Advanced Tool System
- **System Tools**: Run shell commands, list files, and **write/edit code**.
- **Vim Integration**: Use `/code <path>` to open files in `vim` directly from the chat.
- **Web Tools**: Search the web via DuckDuckGo.
- **Discord Integration**: Send messages to Discord channels.

### 💾 Persistent Memory & Global Storage
- **Global Settings**: Configuration, history, and memory are stored in **`~/.forst-tui/`**.
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
- `src/core`: Workflow orchestration (LangGraph), Providers, and Config.
- `src/tools`: Tool definitions (System, Web, Integrations).
- `src/components`: Ink React components for the TUI.
- `src/database`: SQLite schema and Vector Store management.

## License
MIT
