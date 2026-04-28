# git.popStashChanges

## Use This Tool

Use `git.popStashChanges` when the model needs to apply an existing Git stash entry to the working tree and drop that stash entry after a successful pop.

This is a fixed-action gitBase tool. It is not a generic `git.execute` surface.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "stashRef": "stash@{0}",
    "reinstateIndex": false
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    "allowedRepositoryRoots": ["/repo"]
  }
}
```

## Required Inputs

- `target.repositoryPath`: local repository path governed by runtime scope.

## Optional Inputs

- `target.stashRef`: safe stash ref token. Defaults to `stash@{0}`.
- `target.reinstateIndex`: pass `--index` to restore index state.
- `timeoutMs`: runtime git execution timeout.
- `context.allowedRepositoryRoots`: optional scope boundary.
- `context.grantedPermissions`: optional explicit permission check.

## Runtime Behavior

Storage core validates JSON, repository scope, stash ref safety, permissions, governance, risk metadata, and output shape. Runtime owns the host process through:

```text
BaseToolExecutorPort.git.runGit({ repositoryPath, args, timeoutMs })
```

Allowed argv form is fixed:

```text
git stash pop [--index] <stashRef>
```

`dryRun !== false` returns only the command plan and never calls the provider. `dryRun:false` requires `context.guard.allowed === true` or `context.guard.accepted === true`.

## Returns

The output includes:

- `runtimeEntry.port: "BaseToolExecutorPort.git.runGit"`
- fixed `gitArgs`
- `commandPreview`
- `risk` category and mutation flags
- `dropsStashOnSuccess: true`
- `providerCalled`
- `exitCode`, `stdout`, and `stderr` when runtime executes
- `resultEnvelope` with stash ref, index option, line counts, and a public-safe pop hint

## Example

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "stashRef": "stash@{0}"
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Avoid

- Do not route stash pop requests through `shell.commandExecution`.
- Do not let the model provide arbitrary Git subcommands.
- Do not execute stash mutation without an affirmative runtime guard.
- Do not use this when the stash entry must remain available after applying; use `git.applyStashChanges` for that fixed action.
