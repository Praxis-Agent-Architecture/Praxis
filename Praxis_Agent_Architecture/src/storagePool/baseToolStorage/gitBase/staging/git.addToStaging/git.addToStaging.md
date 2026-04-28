---
description: Stage files through the runtime git executor.
argument-hint: '{"target":{"repositoryPath":"/repo","pathspecs":["src/index.ts"]},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# git.addToStaging

## Use This Tool

Use `git.addToStaging` when a model needs to stage repository-relative files or perform a governed `git add --all` / `git add --update`.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "pathspecs": ["src/index.ts"],
    "intentToAdd": false,
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

- `target.repositoryPath`: absolute repository path approved by runtime scope.
- One of `target.pathspecs`, `target.all: true`, or `target.update: true`.

## Optional Inputs

- `target.pathspecs`: repository-relative paths passed after `--`.
- `target.all`: fixed `git add --all`.
- `target.update`: fixed `git add --update`.
- `target.intentToAdd`: fixed `git add --intent-to-add`.
- `target.force`: fixed `git add --force`.
- `target.patch`: dry-run preview only; interactive real execution is rejected.
- `timeoutMs`: runtime git executor timeout.

## Runtime Behavior

Storage constructs fixed argv for one action only: `git add ...`. Runtime owns the real Git process through `BaseToolExecutorPort.git.runGit`.

Real execution requires `context.dryRun === false` plus an affirmative guard. Dry-run returns the plan and never calls the provider.

## Returns

The output includes `runtimeEntry`, `risk`, fixed `gitArgs`, `commandPreview`, provider state, raw stdout/stderr when executed, and a staging result envelope.

## Example

```json
{
  "target": { "repositoryPath": "/repo/project", "pathspecs": ["src/index.ts"] },
  "context": { "dryRun": false, "guard": { "allowed": true } }
}
```

## Avoid

- Do not use this as `git.execute`.
- Do not pass arbitrary git add options.
- Do not use shell tools for staging when this fixed-action gitBase tool is available.
