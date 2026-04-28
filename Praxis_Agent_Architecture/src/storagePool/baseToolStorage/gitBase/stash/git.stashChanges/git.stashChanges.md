# git.stashChanges

## Use This Tool

Use `git.stashChanges` when the model needs to save current working-tree changes into a Git stash entry.

This is a fixed-action gitBase tool. It is not a generic `git.execute` surface.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "message": "checkpoint before refactor",
    "includeUntracked": true,
    "keepIndex": false,
    "pathspecs": ["src/index.ts"]
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

- `target.message`: stash message passed with `-m`.
- `target.includeUntracked`: include untracked files with `--include-untracked`.
- `target.keepIndex`: keep staged changes in the index with `--keep-index`.
- `target.pathspecs`: repository-relative pathspecs after `--`.
- `timeoutMs`: runtime git execution timeout.
- `context.allowedRepositoryRoots`: optional scope boundary.
- `context.grantedPermissions`: optional explicit permission check.

## Runtime Behavior

Storage core validates JSON, path scope, message safety, pathspec scope, permissions, governance, risk metadata, and output shape. Runtime owns the host process through:

```text
BaseToolExecutorPort.git.runGit({ repositoryPath, args, timeoutMs })
```

Allowed argv form is fixed:

```text
git stash push [--include-untracked] [--keep-index] [-m message] [-- pathspec...]
```

`dryRun !== false` returns only the command plan and never calls the provider. `dryRun:false` requires `context.guard.allowed === true` or `context.guard.accepted === true`.

## Returns

The output includes:

- `runtimeEntry.port: "BaseToolExecutorPort.git.runGit"`
- fixed `gitArgs`
- `commandPreview`
- `risk` category and mutation flags
- `providerCalled`
- `exitCode`, `stdout`, and `stderr` when runtime executes
- `resultEnvelope` with message, options, pathspecs, line counts, and a public-safe stash hint

## Example

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "message": "checkpoint",
    "includeUntracked": true
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Avoid

- Do not route stash requests through `shell.commandExecution`.
- Do not let the model provide arbitrary Git subcommands.
- Do not execute stash mutation without an affirmative runtime guard.
- Do not treat this as stash apply or pop; use dedicated fixed-action tools for those intents.
