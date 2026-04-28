# git.archiveRepository

`git.archiveRepository` writes an archive through a fixed `git archive` action.

The baseTool owns validation, scope checks for both repository and output path, dry-run behavior, and result parsing. The runtime owns the actual host Git process through `BaseToolExecutorPort.git.runGit`.

## Input

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "outputPath": "/repo/project.tar",
    "ref": "HEAD",
    "format": "tar",
    "pathspecs": ["src"],
    "prefix": "project/"
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
- The only runtime command shape is `git archive ...` built by storage core.
- The model cannot supply arbitrary Git subcommands.

## Output

The result includes `runtimeEntry`, `gitArgs`, `commandPreview`, `risk`, `providerCalled`, and `resultEnvelope`.
