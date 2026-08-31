# Contributing to Porygon

Thank you for your interest in contributing to Porygon!

## Development Setup

```bash
npm install        # Install dependencies
npm run dev        # Start with hot reload
npm test           # Run tests
npm run build      # Build for production
```

## Coding Standards

### TypeScript Strictness

**No `any` types.** This is a hard rule.

We learned the hard way that `any` causes silent runtime failures. In August 2026, a bug slipped through because we used `(m: any) => m.role === "assistant"` — but the Letta SDK returns messages with `message_type`, not `role`. TypeScript couldn't catch this because `any` disables type checking.

**Instead:**
```typescript
// ❌ Bad
const assistantMessages = response.messages?.filter(
  (m: any) => m.role === "assistant",
);

// ✅ Good - use SDK types with type guards
import type { AssistantMessage } from "@letta-ai/letta-client/resources/agents/messages";

const assistantMessages = response.messages.filter(
  (m): m is AssistantMessage => m.message_type === "assistant_message",
);
```

**If you need to work with untyped data:**
1. First, check if the SDK exports types for it
2. If not, create an interface that matches the actual runtime shape
3. Use type guards or assertions to narrow types

### Error Handling

- Never silently swallow errors
- Use `console.error` for logging
- Set `SURFACE_ERRORS=true` in development to show errors in Discord
- Always handle async errors in message handlers

### Environment Variables

- All env vars should have sensible defaults
- Document new env vars in README.md
- Use `sync: false` in render.yaml for secrets
- Prefix internal vars with `PORYGON_` if needed

### Testing

- Write tests for all new functions
- Test edge cases (empty strings, missing fields, API errors)
- Use vitest for consistency
- Run `npm test` before pushing

## Commit Messages

Use conventional commits:
- `feat:` for new features
- `fix:` for bug fixes
- `test:` for adding tests
- `docs:` for documentation
- `chore:` for maintenance

Example:
```
feat: add rate limiting to prevent abuse

Adds configurable rate limiting per user/channel.
Default: 10 messages per minute.

Closes #42
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm test` and `npm run build`
4. Submit a PR with a clear description
5. Wait for CI to pass
6. Request review if needed

## Questions?

Open an issue or start a discussion on GitHub.
