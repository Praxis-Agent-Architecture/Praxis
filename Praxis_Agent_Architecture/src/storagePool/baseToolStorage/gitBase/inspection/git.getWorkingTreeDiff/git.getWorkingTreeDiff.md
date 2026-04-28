---
description: Read a fixed Git working-tree diff through the runtime git executor.
argument-hint: '{"target":{"repositoryPath":"/repo","mode":"unstaged","pathspecs":["src/index.ts"]},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# git.getWorkingTreeDiff

## Use This Tool

Use `git.getWorkingTreeDiff` when a model needs to inspect repository diff content. It is a read-only gitBase primitive.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "mode": "unstaged",
    "pathspecs": ["src/index.ts"],
    "contextLines": 3
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

- `target.mode`: `unstaged`, `staged`, or `combined`; default is `unstaged`.
- `target.compareRef`: safe revision/ref for a read-only diff.
- `target.pathspecs`: repository-relative paths.
- `target.contextLines`: unified diff context line count from `0` to `1000`.
- `timeoutMs`: runtime git executor timeout.

## Runtime Behavior

Storage constructs fixed argv for one action only: `git diff`. Runtime owns the actual Git process through `BaseToolExecutorPort.git.runGit`.

Real execution requires `context.dryRun === false` plus an affirmative guard. Dry-run returns the plan and never calls the provider.

## Returns

The output includes `runtimeEntry`, `risk`, fixed `gitArgs`, `commandPreview`, provider state, raw stdout/stderr when executed, and a parsed diff envelope with files and hunk count.

## Example

```json
{
  "target": { "repositoryPath": "/repo/project", "mode": "combined", "pathspecs": ["src"] },
  "context": { "dryRun": false, "guard": { "allowed": true } }
}
```

## Avoid

- Do not use this as `git.execute`.
- Do not pass arbitrary git options.
- Do not use shell tools for Git diff when this fixed-action gitBase tool is available.
