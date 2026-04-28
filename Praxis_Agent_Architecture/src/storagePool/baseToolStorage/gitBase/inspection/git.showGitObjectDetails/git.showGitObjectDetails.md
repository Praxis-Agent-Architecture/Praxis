---
description: Read one Git object through the runtime git executor.
argument-hint: '{"target":{"repositoryPath":"/repo","objectRef":"HEAD","format":"raw"},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# git.showGitObjectDetails

## Use This Tool

Use `git.showGitObjectDetails` when a model needs to inspect one Git object, commit metadata, summary, or patch.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "objectRef": "HEAD",
    "format": "raw",
    "maxBytes": 128000
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
- `target.objectRef`: safe Git object reference.

## Optional Inputs

- `target.format`: `summary`, `raw`, or `patch`; default `summary`.
- `target.maxBytes`: preview/truncation budget for the parsed envelope.
- `timeoutMs`: runtime git executor timeout.

## Runtime Behavior

Storage constructs fixed argv for one action only: `git show --no-ext-diff ... <objectRef>`. Runtime owns the real Git process through `BaseToolExecutorPort.git.runGit`.

Real execution requires `context.dryRun === false` plus an affirmative guard. Dry-run returns the plan and never calls the provider.

## Returns

The output includes `runtimeEntry`, `risk`, fixed `gitArgs`, `commandPreview`, provider state, raw stdout/stderr when executed, and a parsed object envelope.

## Avoid

- Do not use this as `git.execute`.
- Do not pass arbitrary git show options.
- Do not use shell tools for object inspection when this fixed-action gitBase tool is available.
