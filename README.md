# forst-tui

A Node.js-based TUI wrapper for LLMs, built with LangChain and Ink.

## Features

### 🤖 Multi-Provider LLM Support
- **Provider Agnostic**: Supports Gemini, OpenAI, OpenRouter, and LocalLLMs (Ollama/LM Studio)
- **Dynamic Configuration**: Add and switch providers in real-time via settings

### 🛠️ Tool System (Plugin Pattern)
- **System Tools**: Run shell commands, read/write files
- **Web Tools**: Search the web (DuckDuckGo)
- **Discord Integration**: Send messages to Discord channels
- Easy-to-extend plugin architecture for adding new tools

### 💾 Persistent Memory
- **SQLite-backed** message history
- **Vector Database** (hnswlib-node) for semantic memory retrieval
- Auto-embedding of messages with semantic search capability

### ⚡ Background Tasks
- **Heartbeat System**: Monitor background events (user-controllable)
- Sample monitors for system resources and file watching

### 🎨 Modern TUI Interface
- **Two-Column Layout**: Chat on left, tools & system info on right
- **Dynamic Sidebar**: System stats and active background tasks
- **Header Dashboard**: Real-time status icons (LLM, DB, Network)
- **Command Palette**: Quick actions via `/` (change provider, clear chat, toggle heartbeat)
- **Keyboard Shortcuts**: e.g., `Ctrl+L` to clear chat
- **Animated Spinners**: Visual feedback for "Thinking" and "Acting" states
- **Syntax Highlighting**: Code blocks in chat
- **Table Component**: Structured tool outputs
- **Icons**: User 👤, AI 🤖, Tool 🛠️, System ⚙️

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file or set your API keys:
   ```bash
   export GOOGLE_GENERATIVE_AI_API_KEY=your_key
   ```

3. **Run in Development**:
   ```bash
   npm run dev
   ```

4. **Build**:
   ```bash
   npm run build
   ```

## Project Structure
- `src/core`: Orchestration, providers, ConfigManager, and state management
- `src/tools`: Tool definitions and registration
- `src/components`: Ink TUI components
- `src/database`: SQLite schema, history logic, and vector store

## License
MIT