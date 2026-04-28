# git.checkoutTarget

Use `git.checkoutTarget` when an agent needs to check out a safe ref, optionally detaching HEAD or creating a new branch from that ref.

## Runtime Contract

- Fixed action: `git checkout`.
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
    "targetRef": "origin/main",
    "newBranchName": "work/main",
    "detach": false,
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

## Fixed Argv

- Check out a ref: `checkout <targetRef>`.
- Create branch from ref: `checkout -b <newBranchName> <targetRef>`.
- Detached checkout: `checkout --detach <targetRef>`.
- Force checkout: `checkout --force <targetRef>`.

Refs reject empty values, whitespace, NUL, leading dash, path traversal, `@{`, backslash, `//`, colon, and `.lock` suffix.

## Output

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, and a `resultEnvelope` with the target ref, branch creation flag, line counts, and a public-safe checkout hint.

## Avoid

- Do not use `shell.commandExecution` for checkout.
- Do not let the model choose arbitrary git subcommands.
- Do not use this tool for path restore; use `git.restoreWorkingTree` for file restoration.
- Do not auto-allow repository roots from model-provided arguments.
