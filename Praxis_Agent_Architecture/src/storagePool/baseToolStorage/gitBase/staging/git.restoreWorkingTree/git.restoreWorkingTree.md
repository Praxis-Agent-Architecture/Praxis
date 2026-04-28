---
description: Restore working-tree paths through the runtime git executor.
argument-hint: '{"target":{"repositoryPath":"/repo","paths":["src/index.ts"]},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# git.restoreWorkingTree

## Use This Tool

Use `git.restoreWorkingTree` when a model needs to discard or source-restore working-tree changes for repository-relative paths.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "paths": ["src/index.ts"],
    "sourceRef": "HEAD"
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

- `target.repositoryPath`: absolute repository path approved by runtime scope.
- `target.paths`: repository-relative paths passed after `--`.

## Optional Inputs

- `target.sourceRef`: safe git revision used as `--source <ref>`.
- `timeoutMs`: runtime git executor timeout.

## Runtime Behavior

Storage constructs fixed argv for one action only: `git restore [--source ref] --worktree -- paths...`. Runtime owns the real Git process through `BaseToolExecutorPort.git.runGit`.

Real execution requires `context.dryRun === false` plus an affirmative guard. Dry-run returns the plan and never calls the provider.

## Returns

The output includes `runtimeEntry`, `risk`, fixed `gitArgs`, `commandPreview`, provider state, stdout/stderr when executed, and a restore result envelope.

## Example

```json
{
  "target": { "repositoryPath": "/repo/project", "paths": ["src/index.ts"] },
  "context": { "dryRun": false, "guard": { "allowed": true } }
}
```

## Avoid

- Do not use this as `git.execute`.
- Do not pass arbitrary git restore options.
- Do not use shell tools for working-tree restore when this fixed-action gitBase tool is available.
