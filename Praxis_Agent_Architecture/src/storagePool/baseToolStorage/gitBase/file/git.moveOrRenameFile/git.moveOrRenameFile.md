---
description: Move or rename one tracked file with fixed git mv argv through the runtime git executor.
argument-hint: "{target:{repositoryPath,sourcePath,destinationPath,force?},context:{dryRun?,guard?,allowedRepositoryRoots?,grantedPermissions?}}"
---

# git.moveOrRenameFile

## Use This Tool

Use `git.moveOrRenameFile` when an agent needs to move or rename a tracked file in a Git repository.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "sourcePath": "src/old.ts",
    "destinationPath": "src/new.ts",
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

## Required Inputs

- `target.repositoryPath`: repository root.
- `target.sourcePath`: repository-relative tracked source path.
- `target.destinationPath`: repository-relative destination path.

## Optional Inputs

- `target.force`: adds `--force`.
- `timeoutMs`: runtime git executor timeout.

## Runtime Behavior

Storage builds exactly:

```text
git mv [--force] -- <sourcePath> <destinationPath>
```

The runtime owns process execution through `BaseToolExecutorPort.git.runGit`. `dryRun !== false` returns a plan only. Real execution requires `dryRun:false` plus an affirmative guard.

## Returns

The result includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `exitCode/stdout/stderr` for real execution, and a `resultEnvelope` with the moved source/destination pair.

## Example

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "sourcePath": "docs/old.md",
    "destinationPath": "docs/new.md",
    "force": true
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Avoid

- Do not use this as a generic `git.execute`.
- Do not pass absolute paths or `..` path traversal.
- Do not use shell commands for Git moves when this fixed-action tool can express the intent.
