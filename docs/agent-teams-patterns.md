# Agent Teams — Patterns, Use Cases & Gaps

This document synthesizes a research pass over `docs/agent-teams-guide.md` and the rest of this repo, performed by a 3-agent research team (Researcher, Strategist, Critic). It complements the guide: the guide explains *how* agent teams work; this document captures a full configuration inventory, concrete use-case patterns, and known gaps/recommendations for improving the guide itself.

## Configuration Reference (from Researcher)

Sources: `docs/agent-teams-guide.md` (full read), `.claude/settings.local.json` (full read), repo-wide grep for teammate/team-related references. No `CLAUDE.md` exists in this repo. No other `.claude/` config files found (no project-level `settings.json`, no `teams.json`, no hooks files).

### 1. Enabling the Feature
- Experimental flag required: env var `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- In this repo, set via `.claude/settings.local.json`:
  ```json
  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
  ```
- This file is **gitignored** / personal-local — not a team-wide default. Each contributor must set it individually.
- No manual "create team" step needed (`TeamCreate`/`TeamDelete` removed as of v2.1.178+) — just describe the task/roles in natural language.

### 2. CLI Flags
- `--teammate-mode <mode>` — sets display mode per-session (overrides global setting for that invocation).

### 3. Settings Keys
- `teammateMode` — global default, set in `~/.claude/settings.json`: `{ "teammateMode": "auto" }`
- "Default teammate model" — configured via `/config` (not a documented raw JSON key); controls what model teammates use when spawned (teammates do NOT inherit the lead's `/model` selection by default unless set to "Default (leader's model)").

### 4. Display Modes
| Mode | Behavior |
|---|---|
| `in-process` (default) | All teammates run inside main terminal; works everywhere |
| `auto` | Split panes if already in tmux/iTerm2+it2, else falls back to in-process |
| `tmux` | Explicit split panes via tmux |
| `iterm2` | Explicit split panes via iTerm2, requires `it2` CLI |

Not supported in VS Code integrated terminal, Windows Terminal, or Ghostty (use `in-process` there). Split-pane effort-level inheritance from lead supported as of v2.1.186+.

### 5. Hooks Relevant to Teams
| Hook | Trigger | Exit code 2 behavior |
|---|---|---|
| `TeammateIdle` | Fires when a teammate is about to go idle | Sends feedback, keeps it working (blocks idle) |
| `TaskCreated` | Fires on task creation | Blocks creation + sends feedback |
| `TaskCompleted` | Fires on task completion | Blocks completion + sends feedback |

No hook config files exist in this repo currently — documented capabilities, not configured here.

### 6. Permissions Behavior
- Teammates **start with the lead's permission settings**, including `--dangerously-skip-permissions` if the lead uses it.
- Permission **mode is fixed at spawn time** — no per-teammate modes at spawn; can change a teammate's mode only *after* spawn.
- Plan-mode teammates: spawned read-only, send plan to lead, lead approves/rejects with feedback, teammate revises or proceeds.

### 7. Storage Locations
| Item | Path | Retention |
|---|---|---|
| Team config | `~/.claude/teams/{team-name}/config.json` | Removed when session ends |
| Task list | `~/.claude/tasks/{team-name}/` | Persists locally, survives resumed sessions; retention governed by `cleanupPeriodDays` |

Team name format: `session-` + first 8 chars of session ID. All storage is local only, never uploaded. Don't hand-edit team config JSON — overwritten on every state update. A project-level `.claude/teams/teams.json` is **not** recognized config.

### 8. Task Management Features
- **States**: pending → in progress → completed.
- **Dependencies**: tasks can depend on others; blocked until dependencies complete.
- **Assignment**: lead can explicitly assign, or teammates can self-claim the next unblocked task.
- **File locking**: prevents race conditions on simultaneous task *claims* (see Gaps section — this is not the same as file-content write safety).
- Task status can lag (known limitation); may block dependents until manually nudged.

### 9. Model Selection
- Default: teammates do not inherit the lead's `/model` choice.
- Configurable via `/config` ("Default teammate model"), or specified per-spawn in natural language (e.g. "Use Sonnet for each teammate").
- Teammates do inherit the lead's **effort level** (v2.1.186+, split-pane mode).

### 10. Shutdown Behavior
- Lead sends a shutdown request; teammate can approve (graceful exit) or reject with explanation.
- Can be slow — teammate finishes its current tool call/request first.
- Team directories clean up automatically at session end.

### 11. Subagent-as-Teammate-Role
- Can spawn a teammate using an existing subagent type by name to reuse a defined role.
- Honors that subagent's `tools` allowlist and `model`; subagent body text is **appended** to the teammate's system prompt.
- `SendMessage` and task tools always available regardless of `tools` restrictions.
- `skills` and `mcpServers` frontmatter fields are **not** applied — teammates load these normally from project/user settings.

### 12. Context & Communication Mechanics
- Each teammate loads project context fresh (CLAUDE.md, MCP servers, skills) plus the lead's spawn prompt. Lead's conversation history does **not** carry over — spawn prompts must be self-contained.
- Messages deliver automatically, no polling. Idle teammates auto-notify the lead.
- No broadcast — one message per recipient. Teammate names are assigned by the lead at spawn time.

### 13. UI/Controls (Lead's Terminal)
Up/Down to select a teammate, Enter to open transcript/message, Escape to interrupt, Ctrl+T to toggle task list, `x` to stop a teammate (in-process mode). Idle rows hide after 30s, reappear on next turn.

### 14. Known Limitations (Experimental Feature)
No session resumption for in-process teammates; task status can lag; shutdown can be slow; one team per session; no nested teams; lead role is fixed; permissions fixed at spawn; split panes require tmux/iTerm2.

### 15. Token Usage / Cost
Significantly more tokens than a single session; scales with number of active teammates (each is a full independent instance, not summarized back). Worthwhile for research/review/new-feature work, not routine tasks.

### 16. Other Notable Behaviors
`CLAUDE.md` works normally for teammates, read from their own working directory (this repo currently has none). Best-practice guidance: team size 3-5, ~5-6 tasks per teammate, distinct file ownership per teammate, wait for teammates before the lead implements anything itself.

---

## Use Case Patterns (from Strategist)

### 1. Multi-Hypothesis Production Incident Triage
**Scenario**: A SaaS app throws intermittent 500s in production with 4 plausible root causes (DB pool exhaustion, a deploy's cache bug, a third-party rate limit, a race condition).

**Why agent teams win**: Subagents report back only to the lead and can't challenge each other, so the lead manually adjudicates disconnected reports and may anchor on whichever returns first. A team lets teammates cross-examine each other's evidence in real time, converging faster with higher confidence.

**Recommended team structure**: 4 teammates, one per hypothesis, lead as moderator/synthesizer.

**Expected workflow**: Lead spawns all 4 with self-contained evidence (logs/metrics), instructs them to message each other and try to disprove rival theories. Lead waits, monitors, redirects only if stalled, then synthesizes consensus into an incident report.

*Caveat (from Critic)*: assumes the 4 hypotheses are already well-formed before spawning. If forming them requires its own investigation, do that first (possibly via subagents) — spawning a team before hypotheses exist is a cost trap.

### 2. Cross-Layer Feature Build (Frontend + Backend + Tests + Docs)
**Scenario**: Adding a "saved searches" feature needing a new API endpoint, DB migration, UI component, integration tests, and docs.

**Why agent teams win**: Genuinely parallelizable across non-overlapping file sets. A single session serializes everything; subagents could parallelize work but report back blind to each other, risking interface mismatches. Teammates can message each other mid-flight to negotiate the contract.

**Recommended team structure**: 4 teammates — backend/API+migration, frontend/UI, tests, docs — each with clearly scoped file ownership.

**Expected workflow**: Backend teammate drafts the API contract first and messages it to the others once finalized; they proceed in parallel. Lead waits for all to report idle, then reviews end-to-end.

*Caveat (from Critic)*: the "publish contract, others wait" flow assumes dependency-unblocking mechanics the reference guide doesn't confirm (automatic vs. lead-must-notice). Treat as illustrative, not guaranteed, until verified.

### 3. Adversarial Security/Code Review Before a Risky Release
**Scenario**: Before shipping a payment-handling change, get more than a single linear review pass — one that actively tries to break the implementation.

**Why agent teams win**: A security-reviewer subagent and a performance-reviewer subagent can't argue with each other's conflicting recommendations. Teammates can surface and discuss the tradeoff directly before reporting, giving the lead better-informed inputs.

**Recommended team structure**: 3 teammates, optionally reusing the `security-reviewer` subagent type for one, plus performance and test-coverage roles.

**Expected workflow**: Each reviews independently first (avoid early anchoring), then explicitly discusses conflicts with each other. Lead synthesizes into a single review.

*Caveat (from Critic)*: there's no shared-artifact/merge mechanism in the doc, only messaging — "reconciled recommendation" still means the lead does the final synthesis, just from better-informed inputs.

### 4. Architecture Exploration With Built-In Devil's Advocate
**Scenario**: Deciding whether to split a monolith into services, before committing engineering time.

**Why agent teams win**: This mirrors the guide's own canonical example. A single session exploring alone is prone to confirmation bias; subagents wouldn't push back on each other. A devil's-advocate teammate can directly interrogate the other two's proposals mid-discussion.

**Recommended team structure**: 3 teammates — UX/operational impact, technical architecture/cost, and an explicit devil's advocate.

**Expected workflow**: UX and architecture teammates draft initial positions; devil's advocate waits for both, then challenges each via messages. Lead intervenes if debate circles, writes the final recommendation once a position survives challenge.

*(Lowest-risk of the five — closely matches a pattern the guide already documents.)*

### 5. Coordinated Multi-File Refactor With Independent Validation
**Scenario**: Renaming/restructuring a widely-used internal API (e.g. a shared `OrderService` interface) across the codebase.

**Why agent teams win**: A validator teammate can run tests continuously as others land changes and flag regressions immediately — something a single session only catches at the end.

**Recommended team structure**: 4-5 teammates — one interface owner (blocking dependency), 2-3 call-site owners each on a distinct module/directory (or distinct git worktree), one validator running the test suite in a loop.

**Expected workflow**: Interface owner lands the contract change first and messages/unblocks the others; call-site teammates self-claim non-overlapping modules; validator messages the responsible teammate the instant a regression appears.

*Caveat (from Critic, strongest of the five)*: the guide explicitly warns against teams for "same-file edits" and "many interdependencies," and whether file locking protects file *contents* (vs. just task-claim races) is unconfirmed. **Treat this pattern as experimental** — verify file-isolation behavior before relying on it, or use a worktree-per-teammate setup, which sidesteps the ambiguity entirely by giving each teammate a physically separate working copy.

---

## Gaps & Recommendations (from Critic)

### Configuration items documented vaguely or not at all
- **"Default teammate model" via `/config`** has no shown JSON equivalent — unclear if it's scriptable/version-controllable like `teammateMode`.
- **`cleanupPeriodDays`** is named once with no default, range, or example.
- **`--teammate-mode` CLI flag** has no example of combined usage or precedence vs. the global `teammateMode` setting.
- **Project-level enablement** isn't explained — the guide confirms there's no project-level team config equivalent, but never offers a recommended convention (e.g. a checked-in `settings.local.json.example`) for getting a whole team onto agent teams.
- **Hooks are entirely undemonstrated** — `TeammateIdle`/`TaskCreated`/`TaskCompleted` get one line each, no example script, no payload schema.
- **`it2` CLI** (required for iTerm2 split-pane mode) has no install pointer or version requirement.

### Edge cases, failure modes, and limitations not covered
- **Concurrent file edits — the guide contradicts itself.** "File locking prevents race conditions on simultaneous claims" vs. "avoid file conflicts — assign each teammate a distinct set of files" describe two different layers (task-claim locking vs. file-content write safety) without ever reconciling them. **Recommendation**: add an explicit "what file locking does and does NOT protect" callout — there is no runtime protection against two teammates editing the same file; partitioning is entirely the user's responsibility.
- **Lead session crash/recovery is undocumented.** Given "no session resumption for in-process teammates" + "lead is fixed," it's unclear whether a crashed lead orphans running teammates (burning tokens) or whether they self-terminate. "Team directories clean up automatically when the session ends" only covers the clean-exit case.
- **No error-recovery procedure** for a stalled/errored teammate's claimed task — does it stay locked forever blocking dependents until manual intervention? Unclear if there's a force-unclaim or reassign mechanism.
- **No git/VCS interaction model.** Do teammates commit independently mid-task? Can uncommitted edits collide outside the "file ownership" convention? The guide treats git worktrees as a separate alternative to teams rather than something that composes with them (e.g. one worktree per teammate for hard isolation).
- **No debugging/observability guidance** for a stuck vs. legitimately-working team — no timeout or token-budget controls described.
- **No worked cost example** — "significantly more tokens" should be backed by at least one concrete before/after comparison so the "Quick decision checklist" question about cost is actually answerable.
- **`auto` display-mode fallback behavior is unclear** — does it silently fall back to `in-process` when tmux/it2 are unavailable, warn, or error?
- **Subagent-within-teammate capability is unstated** — "no nested teams" (can't spawn teammates) is distinct from whether a teammate can use the regular `Agent`/subagent tool for a one-off lookup; this should be stated explicitly.

### Use case evaluation highlights
- Use case **#5** (multi-file refactor) is the riskiest to present as a recommended pattern given the unresolved file-locking ambiguity — downgrade to "experimental, verify file-isolation first," paired with the worktree-per-teammate alternative.
- Use case **#2** (cross-layer build) rests on unverified dependency-unblocking mechanics — flag as illustrative, not confirmed.
- Use case **#3** (adversarial review) should be reframed: teammates surface conflicts to each other, but the lead still performs final reconciliation — there's no shared-artifact mechanism.
- Use case **#1** (incident triage) has an unstated prerequisite: hypothesis formation may itself require investigation before a team is warranted.
- Use case **#4** (architecture/devil's-advocate) is the safest — it mirrors the guide's own canonical example.

### Concrete recommendations for docs/agent-teams-guide.md
1. Add a **"File safety model"** subsection distinguishing task-claim locking from file-content write safety; cross-reference from "Avoid for: Same-file edits."
2. Add a **"Crash and recovery"** subsection covering unclean lead-session exits and stuck-task recovery procedure.
3. Add a **worked example of task dependencies** in a natural-language spawn prompt, stating whether dependency inference is automatic or must be explicit.
4. Replace "significantly more tokens" with a **concrete order-of-magnitude example**.
5. Clarify whether **teammates can use the regular subagent tool** for sub-delegation.
6. Add a **git/VCS workflow subsection**, including whether worktrees-per-teammate compose with agent teams.
7. Expand the **hooks section** with one full worked example and the input payload schema.
8. Add a **debugging/observability subsection** for diagnosing a stuck team.
9. State explicitly whether `auto` display mode fails silently or visibly when tmux/it2 are unavailable.
10. Add an explicit caveat on multi-teammate-same-codebase refactor patterns rather than implying it's a settled strong-fit case.
11. Add a question to the **"Quick decision checklist"**: "Are the competing hypotheses/sub-problems already articulated, or does forming them require its own investigation first?"
