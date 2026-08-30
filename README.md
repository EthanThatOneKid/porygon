# Porygon

A stateful agent named Porygon, built with the [Letta Agent SDK](https://github.com/letta-ai/letta-agent-sdk).

Porygon is a helpful AI assistant with persistent memory that helps Ethan with general tasks, coding, research, and problem-solving. It remembers context across conversations and learns from interactions.

## Prerequisites

- Node.js 22.19+
- Letta CLI installed globally (`npm install -g @letta-ai/letta-code`)

## Install

```bash
npm install
```

## Usage

```bash
npm start
```

This creates a new "Porygon" agent with local backend, sends a greeting, and streams the response.

### Build

```bash
npm run build
```

### Type check

```bash
npm run check
```

## Configuration

The agent runs with `backend: "local"` by default, which requires no API key. Agent state is stored on your local machine.

To use Letta Cloud instead, update the client configuration in `src/index.ts`:

```typescript
const client = new LettaAgentClient({
  backend: "cloud",
  apiKey: process.env.LETTA_API_KEY,
});
```

## Data

Porygon reads from the shared knowledge graph via the wiki memory connector in `porygon-memory`.

| Repo | Description |
|------|-------------|
| [`porygon-memory`](https://github.com/EthanThatOneKid/porygon-memory) | Agent-specific raw captures and wiki pages |
| [`memory`](https://github.com/EthanThatOneKid/memory) | Personal knowledge graph |

## License

MIT
