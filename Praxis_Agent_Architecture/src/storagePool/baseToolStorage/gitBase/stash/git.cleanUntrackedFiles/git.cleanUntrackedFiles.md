# git.cleanUntrackedFiles

## Use This Tool

Use `git.cleanUntrackedFiles` when the model needs to delete untracked files through `git clean`.

This is a fixed-action gitBase tool. It is not a generic `git.execute` surface.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "paths": ["tmp/output.log", "build"],
    "includeDirectories": true,
    "ignoredMode": "none"
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

- `target.paths`: repository-relative path filters. Empty means repository-wide clean.
- `target.includeDirectories`: include untracked directories with `-d`. Defaults to `true`.
- `target.ignoredMode`: `none`, `tracked-ignored` for `-x`, or `ignored-only` for `-X`.
- `timeoutMs`: runtime git execution timeout.
- `context.allowedRepositoryRoots`: optional scope boundary.
- `context.grantedPermissions`: optional explicit permission check.

## Runtime Behavior

Storage core validates JSON, repository scope, path safety, permissions, governance, destructive risk metadata, and output shape. Runtime owns the host process through:

```text
BaseToolExecutorPort.git.runGit({ repositoryPath, args, timeoutMs })
```

Allowed argv forms are fixed:

```text
git clean --dry-run -f [-d] [-x|-X] [-- <paths...>]
git clean -f [-d] [-x|-X] [-- <paths...>]
```

`dryRun !== false` returns only the command plan with `--dry-run` and never calls the provider. `dryRun:false` requires `context.guard.allowed === true` or `context.guard.accepted === true`.

## Returns

The output includes:

- `runtimeEntry.port: "BaseToolExecutorPort.git.runGit"`
- fixed `gitArgs`
- `commandPreview`
- destructive `risk` metadata
- `deletesUntrackedFiles: true`
- `providerCalled`
- `exitCode`, `stdout`, and `stderr` when runtime executes
- `resultEnvelope` with path filters, ignored mode, line counts, removed paths, preview paths, and safe fallback counters

## Example

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "paths": ["tmp/output.log"],
    "includeDirectories": false
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Avoid

- Do not route clean requests through `shell.commandExecution`.
- Do not let the model provide arbitrary Git subcommands.
- Do not execute destructive cleanup without an affirmative runtime guard.
- Do not pass absolute paths or `..` path traversal in `target.paths`.
