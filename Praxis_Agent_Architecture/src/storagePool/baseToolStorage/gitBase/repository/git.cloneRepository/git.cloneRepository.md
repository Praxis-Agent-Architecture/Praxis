# git.cloneRepository

`git.cloneRepository` clones a repository through a fixed `git clone` action.

The baseTool owns validation, scope checks for the runtime working directory and destination path, dry-run behavior, and result parsing. The runtime owns the actual host Git process through `BaseToolExecutorPort.git.runGit`.

## Input

```json
{
  "target": {
    "repositoryPath": "/repo",
    "remoteUrl": "https://example.com/project.git",
    "destinationPath": "/repo/project",
    "branch": "main",
    "depth": 1,
    "singleBranch": true
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "filesystem:write"]
  }
}
```

## Runtime

- Dry-run returns the plan and does not call the provider.
- Real execution requires `context.dryRun === false` and an affirmative guard.
- The only runtime command shape is `git clone ...` built by storage core.
- The model cannot supply arbitrary Git subcommands.

## Output

The result includes `runtimeEntry`, `gitArgs`, `commandPreview`, `risk`, `providerCalled`, `mayUseNetwork`, and `resultEnvelope`.
