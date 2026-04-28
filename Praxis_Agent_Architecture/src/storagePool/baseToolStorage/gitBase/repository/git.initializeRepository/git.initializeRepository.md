# git.initializeRepository

`git.initializeRepository` initializes a repository through a fixed `git init` action.

The baseTool owns validation, risk metadata, dry-run behavior, and result parsing. The runtime owns the actual host Git process through `BaseToolExecutorPort.git.runGit`.

## Input

```json
{
  "target": {
    "repositoryPath": "/repo/new-project",
    "initialBranch": "main",
    "bare": false,
    "separateGitDir": "/repo/.gitdirs/new-project"
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:write", "filesystem:write"]
  }
}
```

## Runtime

- Dry-run returns the plan and does not call the provider.
- Real execution requires `context.dryRun === false` and an affirmative guard.
- The only runtime command shape is `git init ...` built by storage core.
- The model cannot supply arbitrary Git subcommands.

## Output

The result includes `runtimeEntry`, `gitArgs`, `commandPreview`, `risk`, `providerCalled`, and `resultEnvelope`.
