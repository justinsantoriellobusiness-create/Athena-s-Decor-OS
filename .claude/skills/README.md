# Vendored Superpowers skills

These skills are a verbatim copy of the `skills/` directory from
[obra/superpowers](https://github.com/obra/superpowers), MIT licensed
(see `LICENSE` in this directory).

- Upstream version: **6.2.0**
- Vendored from commit: `44c9b2d6e889982ac18c27d05a19fefe335194e1`

## Why vendored instead of installed as a plugin

Installing the plugin (`/plugin install superpowers@claude-plugins-official`) is
per-machine and per-user. Checking the skills into the repo means every Claude
session started against this repository — web, CLI, or a fresh clone — has them
available with no setup.

## How it activates

`../settings.json` registers a `SessionStart` hook that runs
`../hooks/session-start`, which injects the `using-superpowers` bootstrap into
the session. That bootstrap is what makes the other skills auto-trigger at the
right moments; without it the skills sit on disk unused.

## Naming

Upstream skill documents refer to skills as `superpowers:<name>`. As project
skills they are registered under their bare names (`brainstorming`,
`test-driven-development`, ...). The session-start hook states this mapping so
agents drop the prefix when calling the `Skill` tool. Skill bodies are left
unmodified so they can be diffed against upstream.

## Updating

```bash
git clone --depth 1 https://github.com/obra/superpowers.git /tmp/superpowers
rm -rf .claude/skills/*/
cp -R /tmp/superpowers/skills/. .claude/skills/
cp /tmp/superpowers/LICENSE .claude/skills/LICENSE
```

Then re-apply the local edit in `../hooks/session-start` if upstream changed that
file, and update the version and commit recorded above.
