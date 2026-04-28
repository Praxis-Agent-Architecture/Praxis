---
description: Read Git commit history through the runtime git executor.
argument-hint: '{"target":{"repositoryPath":"/repo","maxCount":5},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# git.getCommitHistory

## Use This Tool

Use `git.getCommitHistory` when a model needs recent commit history, commit subjects, authors, or path-filtered history.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "maxCount": 5,
    "ref": "main",
    "pathFilter": "src/index.ts"
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

## Optional Inputs

- `target.maxCount`: number of commits, default `20`, max `200`.
- `target.ref`: safe revision or ref.
- `target.pathFilter`: repository-relative path filter.
- `timeoutMs`: runtime git executor timeout.

## Runtime Behavior

Storage constructs fixed argv for one action only: `git log --format=... --max-count N`. Runtime owns the real Git process through `BaseToolExecutorPort.git.runGit`.

Real execution requires `context.dryRun === false` plus an affirmative guard. Dry-run returns the plan and never calls the provider.

## Returns

The output includes `runtimeEntry`, `risk`, fixed `gitArgs`, `commandPreview`, provider state, raw stdout/stderr when executed, and parsed commit entries.

## Example

```json
{
  "target": { "repositoryPath": "/repo/project", "maxCount": 3 },
  "context": { "dryRun": false, "guard": { "allowed": true } }
}
```

## Avoid

- Do not use this as `git.execute`.
- Do not pass arbitrary git log options.
- Do not use shell tools for commit history when this fixed-action gitBase tool is available.
