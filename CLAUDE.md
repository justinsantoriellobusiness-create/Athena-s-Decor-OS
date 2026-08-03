# Athena's Decor OS — agent guide

## Core operational directive: token & cost efficiency

API usage credits are strictly budgeted. Every token counts. Operate with
maximum operational density and zero verbosity.

### Mandatory efficiency rules

- **No conversational fluff.** No pleasantries, no filler, no "let me explain
  what I'm about to do", no closing offers of further help. Output the data,
  the code, or the answer.
- **Aggressive conciseness.** Status checks and command executions get the
  shortest correct response. Do not restate a diff you just made in prose.
- **Local logic first.** Never route math, sorting, string manipulation, or
  filtering through a model when the host script (Node/TypeScript here) can do
  it natively. That applies to code you write for this app and to how you work
  in this repo.

### Payload & context management

- **Stateless by default.** Treat each request as an independent event unless
  history is strictly required. Don't re-read files you've already read or
  re-derive facts already established.
- **Structured outputs.** When returning data to the host app, emit compact
  JSON or clean unpadded formats that downstream code can parse without regex
  cleanup.

### Error handling & fallbacks

- Ambiguous instruction or missing data: return a tight JSON error flag or a
  single-sentence exception the parent script can handle programmatically. Do
  not write a paragraph of clarification.

## LLM spend rules for code in this repo

All model calls go through `invokeLLM()` in `server/_core/llm.ts`. Nothing
should call a provider API directly.

- **Model.** Default is `claude-sonnet-5`, overridable with the
  `ANTHROPIC_MODEL` env var. Do not hardcode a model at a call site unless that
  call genuinely needs a different tier — and say why in a comment. Current
  valid Anthropic IDs: `claude-opus-5`, `claude-sonnet-5`,
  `claude-haiku-4-5-20251001`. Never guess an ID from memory; check the
  provider's docs.
- **Output caps.** Every new `invokeLLM()` call site must pass `maxTokens`,
  using a tier from `LLM_MAX_TOKENS` (`micro` / `small` / `medium` / `list` /
  `chat`). Falling through to the 4096 default is a last resort for genuine
  long-form generation (blog bodies, full HTML emails). The cap bounds what a
  runaway response can bill.
- **Prompt caching.** `invokeAnthropic()` already marks the system block
  `cache_control: ephemeral`. Anthropic ignores this below 1024 tokens
  (Sonnet/Opus), and every system prompt here is well under that today — so it
  is currently a no-op that starts paying off automatically if prompts grow.
  Don't claim caching savings without checking prompt length.
- **Background loops are the expensive ones.** `server/_core/scheduler.ts`
  polls every 60s (cron modules) and every 5 minutes (autonomous hub). Any
  handler that calls a model must stamp `lastAutoRunAt` *before* the model call
  so a downstream failure backs off to `frequencyHours` instead of retrying a
  paid call every tick. This has broken before — see `git log` for
  "Fix autonomous-hub retry-loop bug".

## Commands

```bash
pnpm install          # deps (pnpm only — package-lock.json is gitignored)
pnpm check            # tsc --noEmit
pnpm build            # vite build + esbuild server bundle
pnpm test             # vitest run
```

Both `pnpm check` and `pnpm build` must pass before committing.

To verify an outgoing LLM request shape without spending credit, point
`ANTHROPIC_BASE_URL` at a local HTTP server and inspect the body.

## Workflow

Work on a feature branch, open a PR, merge it. Do not commit directly to
`main`.
