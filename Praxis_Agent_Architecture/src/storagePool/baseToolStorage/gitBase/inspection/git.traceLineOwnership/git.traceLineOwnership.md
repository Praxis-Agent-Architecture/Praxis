---
description: Read Git line ownership through the runtime git executor.
argument-hint: '{"target":{"repositoryPath":"/repo","filePath":"src/index.ts","range":{"startLine":1,"endLine":5}},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# git.traceLineOwnership

## Use This Tool

Use `git.traceLineOwnership` when a model needs commit ownership, author metadata, or blame details for a specific file range.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "filePath": "src/index.ts",
    "range": { "startLine": 1, "endLine": 5 },
    "revision": "HEAD"
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "filesystem:read"]
  }
}
```

## Required Inputs

- `target.repositoryPath`: absolute repository path approved by runtime scope.
- `target.filePath`: repository-relative file path.
- `target.range`: positive inclusive line range.

## Optional Inputs

- `target.revision`: safe Git revision or ref.
- `timeoutMs`: runtime git executor timeout.

## Runtime Behavior

Storage constructs fixed argv for one action only: `git blame --line-porcelain -L start,end [revision] -- filePath`. Runtime owns the real Git process through `BaseToolExecutorPort.git.runGit`.

Real execution requires `context.dryRun === false` plus an affirmative guard. Dry-run returns the plan and never calls the provider.

## Returns

The output includes `runtimeEntry`, `risk`, fixed `gitArgs`, `commandPreview`, provider state, raw stdout/stderr when executed, and parsed blame entries.

## Avoid

- Do not use this as `git.execute`.
- Do not pass arbitrary git blame options.
- Do not use shell tools for line ownership when this fixed-action gitBase tool is available.
