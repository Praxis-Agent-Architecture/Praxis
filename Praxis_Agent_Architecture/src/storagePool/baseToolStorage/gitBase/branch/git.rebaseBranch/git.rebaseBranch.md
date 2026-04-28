# git.rebaseBranch

Use `git.rebaseBranch` when an agent needs to rebase the current branch or a named branch onto a safe upstream ref.

## Runtime Contract

- Fixed action: `git rebase`.
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
    "upstreamRef": "main",
    "branchName": "feature/a",
    "ontoRef": "origin/main",
    "keepBase": false,
    "autosquash": true,
    "interactive": false
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

- Default rebase: `rebase <upstreamRef>`.
- Rebase a named branch: `rebase <upstreamRef> <branchName>`.
- Rebase onto another base: `rebase --onto <ontoRef> <upstreamRef> [branchName]`.
- Keep-base rebase: `rebase --keep-base <upstreamRef> [branchName]`.
- Autosquash rebase: `rebase --autosquash <upstreamRef> [branchName]`.
- Interactive rebase: `rebase --interactive <upstreamRef> [branchName]`.

Refs reject empty values, whitespace, NUL, leading dash, path traversal, `@{`, backslash, `//`, colon, and `.lock` suffix.

## Output

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, and a `resultEnvelope` with upstream/onto refs, branch name, option flags, line counts, completion status, and conflict/stopped hints.

## Avoid

- Do not use `shell.commandExecution` for rebase operations.
- Do not let the model choose arbitrary git subcommands.
- Do not use this tool for merge, cherry-pick, or reset.
- Do not auto-allow repository roots from model-provided arguments.
