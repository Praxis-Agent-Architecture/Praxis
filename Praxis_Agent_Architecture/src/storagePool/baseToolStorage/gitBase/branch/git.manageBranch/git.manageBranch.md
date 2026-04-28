# git.manageBranch

Use `git.manageBranch` when an agent needs to list branches, create a branch, delete a branch, rename a branch, or set a branch upstream through fixed Git actions.

## Runtime Contract

- Fixed action: `git branch`.
- Runtime entry: `BaseToolExecutorPort.git.runGit`.
- No generic `git.execute` surface is exposed.
- `dryRun !== false` returns the command plan and never calls the provider.
- `dryRun:false` for create, delete, rename, or set-upstream requires an affirmative runtime guard.
- The runtime receives only `{ repositoryPath, args, timeoutMs }` after storage has validated and assembled argv.

## Input Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "rename",
    "branchName": "feature/old",
    "newBranchName": "feature/new",
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

- List branches: `branch --list`.
- Create branch: `branch [--force] <branchName> [startPoint]`.
- Delete branch: `branch -d <branchName>` or `branch -D <branchName>` when `force:true`.
- Rename branch: `branch -m <branchName> <newBranchName>` or `branch -M ...` when `force:true`.
- Set upstream: `branch --set-upstream-to <upstream> <branchName>`.

Refs reject empty values, whitespace, NUL, leading dash, path traversal, `@{`, backslash, `//`, colon, and `.lock` suffix.

## Output

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, and a `resultEnvelope` with action, branch name, parsed branch list/current branch, operation hint, and create/delete/rename/upstream status.

## Avoid

- Do not use `shell.commandExecution` for branch operations.
- Do not let the model choose arbitrary git subcommands.
- Do not use this tool for switch, checkout, merge, rebase, commit, or push.
- Do not auto-allow repository roots from model-provided arguments.
