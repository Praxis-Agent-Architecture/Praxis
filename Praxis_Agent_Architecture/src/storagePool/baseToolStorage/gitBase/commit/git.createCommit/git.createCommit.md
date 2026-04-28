# git.createCommit

Use `git.createCommit` when an agent needs to create a commit through a fixed Git action.

## Runtime Contract

- Fixed action: `git commit`.
- Runtime entry: `BaseToolExecutorPort.git.runGit`.
- No generic `git.execute` surface is exposed.
- `dryRun !== false` returns the command plan and never calls the provider.
- `dryRun:false` requires an affirmative runtime guard before provider dispatch.
- The runtime receives only `{ repositoryPath, args, timeoutMs }` after storage has validated and assembled argv.

## Input Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "commitMessage": "Add agentCore git primitive",
    "includeAllTracked": true,
    "allowEmpty": false,
    "signoff": true
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

- Create commit: `commit [--all] [--allow-empty] [--signoff] -m <commitMessage>`.

The commit message rejects empty values and NUL bytes. Storage owns all argv construction; the model cannot append arbitrary commit flags.

## Output

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, and a `resultEnvelope` with commit message, commit hash, branch name, subject, files changed, and commit-created status when Git output can be parsed.

## Avoid

- Do not use `shell.commandExecution` for commit creation.
- Do not let the model choose arbitrary git subcommands or flags.
- Do not use this tool for amend, cherry-pick, revert, reset, merge, rebase, push, or tag operations.
- Do not auto-allow repository roots from model-provided arguments.
