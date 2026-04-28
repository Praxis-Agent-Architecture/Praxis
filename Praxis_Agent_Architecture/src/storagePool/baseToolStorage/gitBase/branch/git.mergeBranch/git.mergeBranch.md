# git.mergeBranch

Use `git.mergeBranch` when an agent needs to merge one safe source branch into the current branch.

## Runtime Contract

- Fixed action: `git merge`.
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
    "sourceBranch": "feature/a",
    "mode": "no-ff",
    "commitMessage": "Merge feature/a",
    "noCommit": false,
    "allowUnrelatedHistories": false
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

- Default merge: `merge <sourceBranch>`.
- Fast-forward only: `merge --ff-only <sourceBranch>`.
- No fast-forward: `merge --no-ff [-m message] <sourceBranch>`.
- Squash merge: `merge --squash <sourceBranch>`.
- Preview merge without commit: `merge --no-commit <sourceBranch>`.

Branch refs reject empty values, whitespace, NUL, leading dash, path traversal, `@{`, backslash, `//`, colon, and `.lock` suffix.

## Output

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, and a `resultEnvelope` with merge mode, fast-forward/conflict hints, line counts, and whether a merge commit may have been created.

## Avoid

- Do not use `shell.commandExecution` for merge operations.
- Do not let the model choose arbitrary git subcommands.
- Do not use this tool for rebase, cherry-pick, or reset.
- Do not auto-allow repository roots from model-provided arguments.
