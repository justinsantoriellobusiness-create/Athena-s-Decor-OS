# Agent Teams — Master Reference Guide

Source: https://code.claude.com/docs/en/agent-teams (current as of v2.1.186)

This is our project's internal reference for using Claude Code agent teams effectively. Use it when deciding whether to spawn a team, how many teammates to use, and how to structure prompts for them.

## Status in this project

Agent teams are enabled locally via `.claude/settings.local.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

This is a personal/local setting (gitignored), not a team-wide default. Each contributor who wants agent teams needs to set this themselves.

## What agent teams are

Agent teams coordinate multiple independent Claude Code instances:

- **Team lead** — the main session. Spawns teammates, coordinates work, synthesizes results.
- **Teammates** — separate Claude Code instances, each with its own context window. They work independently and message each other directly.
- **Task list** — shared list of work items teammates claim and complete.
- **Mailbox** — messaging system for inter-agent communication.

Unlike subagents (which only report back to the main agent), teammates can talk to each other directly and self-coordinate.

## Agent teams vs. subagents

| | Subagents | Agent teams |
|---|---|---|
| Context | Own window; results return to caller | Own window; fully independent |
| Communication | Report to main agent only | Teammates message each other directly |
| Coordination | Main agent manages all work | Shared task list, self-coordination |
| Best for | Focused tasks where only the result matters | Complex work needing discussion/collaboration |
| Token cost | Lower (summarized back) | Higher (each teammate is a full instance) |

**Use subagents** for quick, focused workers that report back (e.g. a single research lookup).
**Use agent teams** when workers need to share findings, challenge each other, or coordinate independently.

## When to use agent teams

Strong use cases:
- **Research and review** — multiple teammates investigate different angles, then compare/challenge findings.
- **New modules or features** — teammates each own a separate piece without stepping on each other.
- **Debugging with competing hypotheses** — teammates test different theories in parallel, converge faster.
- **Cross-layer coordination** — frontend/backend/tests owned by different teammates simultaneously.

Avoid for:
- Sequential tasks
- Same-file edits
- Work with many interdependencies
- Routine/simple tasks (single session or a subagent is more cost-effective)

## Starting a team

Just describe the task and roles in natural language — no manual setup step required (as of v2.1.178+, `TeamCreate`/`TeamDelete` no longer exist).

Example:

```
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Spawn three teammates to explore this from different angles:
one on UX, one on technical architecture, one playing devil's advocate.
```

Claude populates a shared task list, spawns teammates, has them explore, and synthesizes findings.

### Controls in the agent panel (lead's terminal)
- **Up/Down arrows**: select a teammate
- **Enter**: open selected teammate's transcript, message it directly
- **Escape**: interrupt the selected teammate's current turn
- Idle teammate rows hide after 30s, reappear on next turn (still running/addressable while hidden)

## Display modes

- **`in-process`** (default): all teammates run inside the main terminal; works anywhere.
- **`split panes`**: each teammate gets its own pane; requires `tmux` or iTerm2 + `it2` CLI. Not supported in VS Code's integrated terminal, Windows Terminal, or Ghostty.

Set globally in `~/.claude/settings.json`:
```json
{ "teammateMode": "auto" }
```
Or per-session: `claude --teammate-mode auto`

Modes: `in-process` (default), `auto` (split panes if already in tmux/iTerm2+it2, else in-process), `tmux`, `iterm2` (explicit, requires `it2` CLI).

## Specifying teammates and models

Claude decides team size based on the task, or you can specify it:

```
Spawn 4 teammates to refactor these modules in parallel. Use Sonnet for each teammate.
```

- Teammates do **not** inherit the lead's `/model` selection by default — set "Default teammate model" in `/config`, or pick "Default (leader's model)".
- Teammates inherit the lead's **effort level** (split-pane support from v2.1.186+).

## Plan approval for risky tasks

```
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

Teammate works in read-only plan mode → sends plan to lead → lead approves/rejects with feedback → teammate revises or proceeds. Give the lead explicit approval criteria in your prompt if needed (e.g. "only approve plans that include test coverage").

## Talking to teammates directly

- **In-process**: arrow keys to select, Enter to view/message, `x` to stop, Ctrl+T toggles task list.
- **Split-pane**: click into a teammate's pane directly.

## Task list mechanics

- States: pending → in progress → completed
- Tasks can depend on other tasks (blocked until dependencies complete)
- **Lead assigns** tasks explicitly, or **teammates self-claim** the next unblocked task
- File locking prevents race conditions on simultaneous claims

## Shutting down teammates

```
Ask the researcher teammate to shut down
```

Lead sends shutdown request; teammate can approve (graceful exit) or reject with explanation. Team directories clean up automatically when the session ends — no manual cleanup step.

## Quality gates via hooks

- `TeammateIdle` — fires when a teammate is about to go idle; exit code 2 sends feedback and keeps it working.
- `TaskCreated` — fires on task creation; exit code 2 blocks creation + sends feedback.
- `TaskCompleted` — fires on task completion; exit code 2 blocks completion + sends feedback.

## Architecture details

| Component | Role |
|---|---|
| Team lead | Main session; spawns teammates, coordinates |
| Teammates | Separate instances, each assigned tasks |
| Task list | Shared work items |
| Mailbox | Inter-agent messaging |

Storage (local only, never uploaded):
- Team config: `~/.claude/teams/{team-name}/config.json` (removed when session ends)
- Task list: `~/.claude/tasks/{team-name}/` (persists locally; survives resumed sessions; retention via `cleanupPeriodDays`)

Team name = `session-` + first 8 chars of session ID. **Don't hand-edit the team config** — it's overwritten on every state update.

There is no project-level team config equivalent — a `.claude/teams/teams.json` file is just an ordinary file, not recognized config.

## Using subagent definitions as teammate roles

Reference an existing subagent type by name to reuse a defined role (e.g. `security-reviewer`):

```
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```

- Honors that subagent's `tools` allowlist and `model`
- The subagent's body is **appended** to the teammate's system prompt (not a replacement)
- `SendMessage` and task tools are always available regardless of `tools` restrictions
- **Not applied**: `skills` and `mcpServers` frontmatter fields — teammates load skills/MCP from project/user settings normally

## Permissions

- Teammates start with the **lead's** permission settings (including `--dangerously-skip-permissions` if the lead uses it)
- You can change individual teammate modes after spawning
- You **cannot** set per-teammate modes at spawn time

## Context and communication

- Each teammate loads project context fresh: CLAUDE.md, MCP servers, skills, plus the lead's spawn prompt
- The lead's conversation history does **not** carry over to teammates
- Messages between agents deliver automatically (no polling)
- Idle teammates auto-notify the lead when they finish
- To message multiple teammates, send one message per recipient (no broadcast)
- Names are assigned by the lead at spawn — specify names in your prompt if you want to reference teammates predictably later

## Token usage

Agent teams use significantly more tokens than a single session — scales with number of active teammates. Worthwhile for research/review/new-feature work; not for routine tasks.

## Use case examples

### Parallel code review
```
Spawn three teammates to review PR #142:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

### Competing hypotheses for debugging
```
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific
debate. Update the findings doc with whatever consensus emerges.
```
The adversarial structure avoids anchoring bias from sequential investigation — the theory that survives cross-examination is more likely correct.

## Best practices

1. **Give teammates enough context in the spawn prompt** — they don't inherit lead conversation history.
   ```
   Spawn a security reviewer teammate with the prompt: "Review the authentication
   module at src/auth/ for security vulnerabilities. Focus on token handling,
   session management, and input validation. The app uses JWT tokens stored in
   httpOnly cookies. Report any issues with severity ratings."
   ```
2. **Team size**: start with 3–5 teammates. Token cost scales linearly, coordination overhead increases, and returns diminish beyond a point. Aim for 5–6 tasks per teammate (15 independent tasks → 3 teammates is a good start).
3. **Size tasks appropriately**: not so small that coordination overhead dominates, not so large that teammates go too long without check-ins.
4. **Wait for teammates to finish** rather than letting the lead start implementing itself:
   ```
   Wait for your teammates to complete their tasks before proceeding
   ```
5. **Start with research/review tasks** (no code writes) before trying parallel implementation.
6. **Avoid file conflicts** — assign each teammate a distinct set of files to own.
7. **Monitor and steer** — don't let a team run unattended too long; redirect failing approaches early.

## Troubleshooting

- **Teammates not appearing**: check the agent panel (arrow keys + Enter); confirm the task was complex enough to trigger a team; for split panes confirm `tmux`/`it2` are installed and on PATH.
- **Too many permission prompts**: pre-approve common operations in permission settings before spawning a team.
- **Teammates stopping on errors**: open their transcript, give additional instructions, or spawn a replacement.
- **Lead shuts down early**: tell it to keep going / wait for teammates before finishing.
- **Orphaned tmux sessions**: `tmux ls` then `tmux kill-session -t <session-name>`.

## Known limitations (experimental feature)

- **No session resumption for in-process teammates** — `/resume`/`/rewind` don't restore them; respawn if the lead tries to message a teammate that no longer exists.
- **Task status can lag** — teammates may fail to mark tasks complete, blocking dependents; check manually or nudge via the lead.
- **Shutdown can be slow** — teammates finish their current tool call/request first.
- **One team per session** — scoped to that session, no sharing across sessions, no multiple named teams.
- **No nested teams** — only the lead can spawn/manage teammates.
- **Lead is fixed** — can't promote a teammate to lead or transfer leadership.
- **Permissions fixed at spawn** — all teammates inherit the lead's mode; per-teammate mode changes only happen after spawn.
- **Split panes need tmux or iTerm2** — not supported in VS Code terminal, Windows Terminal, or Ghostty (use `in-process` there).

`CLAUDE.md` works normally for teammates — they read it from their working directory, so project-specific guidance reaches the whole team automatically.

## Related approaches

- **Subagents** (`/en/sub-agents`) — lightweight delegation within a single session, no inter-agent coordination needed.
- **Git worktrees** (`/en/worktrees`) — manual parallel sessions without automated team coordination.
- **Agent SDK** (`/en/agent-sdk/overview`) — fully custom orchestration, tool access, and permissions for building your own agents.

## Quick decision checklist

Before spawning a team, ask:
1. Does this task genuinely benefit from parallel, independent exploration? (If sequential/single-file, skip teams.)
2. Can I clearly partition the work so teammates won't touch the same files?
3. Is the expected payoff worth the extra token cost?
4. Have I given each teammate enough standalone context in the spawn prompt?
5. Am I prepared to monitor and steer rather than let it run unattended?

If all five are "yes," agent teams are a good fit.
