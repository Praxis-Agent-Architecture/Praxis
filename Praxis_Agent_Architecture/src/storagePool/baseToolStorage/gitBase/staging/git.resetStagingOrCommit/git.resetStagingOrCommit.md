# git.resetStagingOrCommit

## Use This Tool

Use `git.resetStagingOrCommit` when the model needs one of these fixed Git reset actions:

- unstage repository-relative paths from the index
- unstage all staged changes
- move `HEAD` with a governed `soft`, `mixed`, `hard`, `merge`, or `keep` reset

This is a fixed-action gitBase tool. It is not a generic `git.execute` surface.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "staging",
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

For commit reset:

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "commit",
    "targetRef": "HEAD~1",
    "mode": "soft"
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Required Inputs

- `target.repositoryPath`: local repository path governed by runtime scope.
- `target.action`: `staging` or `commit`.
- `target.targetRef`: required when `action` is `commit`.

## Optional Inputs

- `target.pathspecs`: repository-relative pathspecs for `action:"staging"`. Empty means reset the whole index.
- `target.mode`: commit reset mode. Defaults to `mixed`.
- `timeoutMs`: runtime git execution timeout.
- `context.allowedRepositoryRoots`: optional scope boundary.
- `context.grantedPermissions`: optional explicit permission check.

## Runtime Behavior

Storage core validates JSON, path scope, revision safety, permissions, governance, risk metadata, and output shape. Runtime owns the host process through:

```text
BaseToolExecutorPort.git.runGit({ repositoryPath, args, timeoutMs })
```

Allowed argv forms are fixed:

```text
git reset [-- pathspec...]
git reset --soft|--mixed|--hard|--merge|--keep <targetRef>
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
- `resultEnvelope` with action, pathspecs, reset mode, target ref, and safe line counts

## Avoid

- Do not route reset requests through `shell.commandExecution`.
- Do not let the model provide arbitrary Git subcommands.
- Do not execute commit reset without an affirmative runtime guard.
- Treat `mode:"hard"` as destructive and require product-level approval before real execution.
