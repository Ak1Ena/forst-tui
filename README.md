# forst-tui

A Node.js-based TUI wrapper for LLMs, built with LangChain and Ink.

## Features
- **Provider Agnostic**: Supports Gemini, OpenAI, OpenRouter, and LocalLLMs (Ollama).
- **Tool System**: Modular plugin pattern for extending capabilities (run commands, read files, search web).
- **Background Tasks**: Heartbeat system for monitoring background events (user-controllable).
- **Persistent Memory**: SQLite-backed message history.
- **Modern TUI**: Built with React-style components using Ink.

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
- `src/core`: Orchestration, providers, and state management.
- `src/tools`: Tool definitions and registration.
- `src/components`: Ink TUI components.
- `src/database`: SQLite schema and history logic.

## License
MIT
