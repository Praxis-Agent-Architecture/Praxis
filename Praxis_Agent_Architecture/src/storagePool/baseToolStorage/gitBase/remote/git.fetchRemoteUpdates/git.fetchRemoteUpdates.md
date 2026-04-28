# git.fetchRemoteUpdates

`git.fetchRemoteUpdates` fetches remote refs through a fixed `git fetch` action.

The baseTool owns validation, risk metadata, dry-run behavior, fixed argv construction, and result parsing. The runtime owns the actual host Git process and network access through `BaseToolExecutorPort.git.runGit`.

## Use This Tool

Use this tool when the model needs to update remote-tracking refs from a configured remote.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "remoteName": "origin",
    "refspecs": ["main"],
    "prune": true,
    "tagsMode": "no-tags"
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "git:write", "filesystem:write", "network:egress"]
  }
}
```

## Runtime Behavior

- Dry-run returns the plan and does not call the provider.
- Real execution requires `context.dryRun === false` plus an affirmative guard.
- The only runtime command shape is `git fetch ...` built by storage core.
- Runtime owns the Git binary, process execution, network egress, timeout, and sandbox roots.

## Returns

The result includes `runtimeEntry`, `gitArgs`, `commandPreview`, `risk`, `providerCalled`, and `resultEnvelope`.

## Avoid

- Do not use this as a generic `git.execute`.
- Do not use this tool for pull, push, merge, or rebase.
- Do not let the model supply arbitrary flags.
