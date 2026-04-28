# git.removeTrackedFile

## Use This Tool

Use `git.removeTrackedFile` when the model needs to remove a tracked file through `git rm`.

This is a fixed-action gitBase tool. It is not a generic `git.execute` surface.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "filePath": "src/obsolete.ts",
    "keepWorkingTree": false,
    "force": false
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
- `target.filePath`: repository-relative tracked file path.

## Optional Inputs

- `target.keepWorkingTree`: pass `--cached` to remove only from the Git index while keeping the working tree file.
- `target.force`: pass `--force`.
- `timeoutMs`: runtime git execution timeout.
- `context.allowedRepositoryRoots`: optional scope boundary.
- `context.grantedPermissions`: optional explicit permission check.

## Runtime Behavior

Storage core validates JSON, repository scope, file path safety, permissions, governance, risk metadata, and output shape. Runtime owns the host process through:

```text
BaseToolExecutorPort.git.runGit({ repositoryPath, args, timeoutMs })
```

Allowed argv form is fixed:

```text
git rm [--cached] [--force] -- <filePath>
```

`dryRun !== false` returns only the command plan and never calls the provider. `dryRun:false` requires `context.guard.allowed === true` or `context.guard.accepted === true`.

## Returns

The output includes:

- `runtimeEntry.port: "BaseToolExecutorPort.git.runGit"`
- fixed `gitArgs`
- `commandPreview`
- `risk` metadata with index and working-tree mutation flags
- `removesTrackedFile: true`
- `providerCalled`
- `exitCode`, `stdout`, and `stderr` when runtime executes
- `resultEnvelope` with file path, cached-only mode, line counts, removed paths, and safe fallback counters

## Example

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "filePath": "src/obsolete.ts",
    "keepWorkingTree": true
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "grantedPermissions": ["git:read", "git:write", "filesystem:read"]
  }
}
```

## Avoid

- Do not route tracked-file removal through `shell.commandExecution`.
- Do not let the model provide arbitrary Git subcommands.
- Do not execute without an affirmative runtime guard.
- Do not pass absolute paths or `..` path traversal in `target.filePath`.
