# git.manageWorktree

`git.manageWorktree` manages Git worktrees through fixed `git worktree` actions. It is a fine-grained gitBase primitive, not a generic `git.execute` surface.

## Use This Tool

Use this tool to list, add, remove, or prune Git worktrees while keeping real process execution in the runtime.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "add",
    "worktreePath": "/repo/worktrees/feature-a",
    "branchName": "feature/a",
    "targetRef": "main",
    "detach": false,
    "force": false
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Runtime Behavior

- Storage builds the only allowed argv.
- Runtime executes through `BaseToolExecutorPort.git.runGit`.
- `dryRun !== false` returns a plan and never calls the provider.
- `dryRun:false` mutation actions require an affirmative guard.
- Missing runtime provider returns `PROVIDER_UNAVAILABLE`.
- Provider failures are mapped to public-safe provider errors.

## Fixed Argv

- `list`: `worktree list --porcelain`
- `add`: `worktree add [--force] [--detach] [-b <branchName>] <worktreePath> [targetRef]`
- `remove`: `worktree remove [--force] <worktreePath>`
- `prune`: `worktree prune [--force]`

## Returns

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, and `resultEnvelope`.

For `list`, `resultEnvelope.worktrees` parses porcelain output into stable entries.

## Avoid

- Do not use `shell.commandExecution` for worktree management.
- Do not let the model supply arbitrary Git subcommands or flags.
- Do not add a high-level `executor.git.manageWorktree`; runtime stays at `BaseToolExecutorPort.git.runGit`.
