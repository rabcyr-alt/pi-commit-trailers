# pi-commit-trailers

A [Pi](https://github.com/badlogic/pi) extension that automatically appends git
trailers to commit messages when the agent runs `git commit`. Records which
model, which pi version, and which pi session produced the commit.

![pi-commit-trailers preview](https://raw.githubusercontent.com/rabcyr-alt/pi-commit-trailers/master/docs/pi-commit-trailers.png)

## Trailers

| Trailer | Value | Example |
|---------|-------|---------|
| `Co-Authored-By` | Model name | `Co-Authored-By: Claude Sonnet 4 <noreply@pi.dev>` |
| `Generated-By` | Pi version | `Generated-By: pi 0.83.0` |
| `Pi-Session` | Session UUID | `Pi-Session: 019fb565-7ecc-7b45-9b0c-06dbf0f7964c` |

Example commit:

```
fix: resolve null pointer

Co-Authored-By: Claude Sonnet 4 <noreply@pi.dev>
Generated-By: pi 0.83.0
Pi-Session: 019fb565-7ecc-7b45-9b0c-06dbf0f7964c
```

## Why this exists

It merges the trailer set of
[`pi-co-authored-by`](https://github.com/bruno-garcia/pi-co-authored-by)
(Co-Authored-By + Generated-By) with a Pi-Session trailer, and — importantly —
attaches them **robustly**.

`pi-co-authored-by` appends its `-m` flags at the end of the whole bash command
string. That works when `git commit` is the last command, but silently drops the
trailers (and can corrupt the trailing command) when the agent chains commands
like:

```bash
git commit -m "msg" && echo done
# pi-co-authored-by glues its trailers onto `echo`, not the commit
```

This extension parses the bash command and splices the trailer block into each
`git commit` invocation directly, so it survives chaining (`&&`, `||`, `;`,
`|`, `&`), pipes, redirects (`> /dev/null 2>&1`, `2>&1`), subshells, comments,
and multiple commits in one command.

## Install

This is a local extension. Drop it in the global extensions directory:

```
~/.pi/agent/extensions/pi-commit-trailers/
├── index.ts
├── lib/commit-span.ts
└── README.md
```

Pi auto-discovers it on startup (or `/reload`). No `pi install` needed.

## How it works

Hooks Pi's `tool_call` event. When it detects a `git commit -m` command, it
parses the bash command into simple commands, locates each `git commit` word
list, and splices a single `-m "" -m $'...'` block (containing all three
trailers) at the end of each commit's own argument list — before any trailing
operator.

The parsing logic (`lib/commit-span.ts`) is pure and unit-testable, handling:
single/double/`$'` quotes, `$(...)` and backtick command substitution, line
continuations, comments, fd-prefixed redirects, transparent command runners
(`sudo`, `env`, `nohup`, ...), and env-var assignments preceding the command.

## Credits

The `tool_call` hook structure, model-name resolution, and the `Co-Authored-By`
/ `Generated-By` trailer content in `index.ts` are derived from
[`pi-co-authored-by`](https://github.com/bruno-garcia/pi-co-authored-by) by
Bruno Garcia (MIT licensed). The shell command-parsing and trailer-splicing
logic in `lib/commit-span.ts` is original to this project. See
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) for details.

## License

MIT — Copyright (c) 2026 Ashley Willis, with portions of `index.ts` derived
from `pi-co-authored-by` (Copyright (c) 2026 Bruno Garcia). See
[`LICENSE`](./LICENSE) for the full text.
