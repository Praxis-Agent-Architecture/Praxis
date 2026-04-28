# git.switchBranch

Use `git.switchBranch` when an agent needs to switch the current branch, optionally creating a branch from a safe start point.

## Runtime Contract

- Fixed action: `git switch`.
- Runtime entry: `BaseToolExecutorPort.git.runGit`.
- No generic `git.execute` surface is exposed.
- `dryRun !== false` returns the command plan and never calls the provider.
- `dryRun:false` requires an affirmative runtime guard.
- The runtime receives only `{ repositoryPath, args, timeoutMs }` after storage has validated and assembled argv.

## Input Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "branchName": "feature/a",
    "create": false,
    "startPoint": "origin/main",
    "track": false,
    "discardChanges": false
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"]
  }
}
```

## Fixed Argv

- Switch existing branch: `switch <branchName>`.
- Create branch: `switch -c <branchName> [startPoint]`.
- Track branch: `switch --track -c <branchName> <startPoint>`.
- Discard local changes during switch: `switch --discard-changes <branchName>`.

Branch refs reject empty values, whitespace, NUL, leading dash, path traversal, `@{`, backslash, `//`, colon, and `.lock` suffix.

## Output

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, and a `resultEnvelope` with the target branch, creation/tracking flags, line counts, and a public-safe switch hint.

## Avoid

- Do not use `shell.commandExecution` for branch switching.
- Do not let the model choose arbitrary git subcommands.
- Do not auto-allow repository roots from model-provided arguments.
