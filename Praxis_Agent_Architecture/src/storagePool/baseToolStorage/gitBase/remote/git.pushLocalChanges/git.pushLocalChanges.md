# git.pushLocalChanges

`git.pushLocalChanges` pushes local refs through a fixed `git push` action. It is a narrow gitBase primitive, not a generic `git.execute` surface.

## Runtime Boundary

- Storage core builds the only allowed argv.
- Runtime executes through `BaseToolExecutorPort.git.runGit`.
- The model cannot pass arbitrary Git subcommands.
- `dryRun !== false` returns a command plan and never calls the provider.
- `dryRun:false` requires `context.guard.allowed === true` or `context.guard.accepted === true`.

## Input Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "remoteName": "origin",
    "branchName": "main",
    "setUpstream": true,
    "forceWithLease": false,
    "pushTags": false,
    "deleteRemoteBranch": false
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "network:egress"]
  }
}
```

## Fixed Argv

- Branch push: `push [--set-upstream] [--force-with-lease] <remoteName> <branchName>`
- Tag push: `push <remoteName> --tags`
- Remote branch delete: `push <remoteName> :<branchName>`

`remoteName` and `branchName` must be safe Git atoms: no whitespace, no NUL bytes, and no leading dash.

## Output

The result includes:

- `runtimeEntry.port: "BaseToolExecutorPort.git.runGit"`
- `gitArgs`
- `commandPreview`
- `risk`
- `permissionsRequired`
- `providerCalled`
- `resultEnvelope`

`resultEnvelope` parses pushed refs and rejected hints from public-safe stdout/stderr. Provider failures are mapped to stable public-safe errors.

## Avoid

- Do not use `shell.commandExecution` for push.
- Do not expose a generic `git push ...` text command from the model.
- Do not expand runtime into `executor.git.pushLocalChanges`; keep runtime as the lower-level `runGit` port.
