# git.manageRemote

`git.manageRemote` lists, inspects, and updates Git remote configuration through fixed `git remote` actions.

The baseTool owns validation, risk metadata, dry-run behavior, and result parsing. The runtime owns the actual host Git process through `BaseToolExecutorPort.git.runGit`.

## Input

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "set-url",
    "remoteName": "origin",
    "remoteUrl": "git@example.com:org/project.git",
    "urlMode": "push"
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Runtime

- Dry-run returns the plan and does not call the provider.
- `list` and `show` are read-only and do not require a mutation guard.
- `add`, `remove`, `rename`, and `set-url` require `context.dryRun === false` plus an affirmative guard for real execution.
- The only runtime command shape is `git remote ...` built by storage core.
- The model cannot supply arbitrary Git subcommands.

## Output

The result includes `runtimeEntry`, `gitArgs`, `commandPreview`, `risk`, `providerCalled`, and `resultEnvelope`.
