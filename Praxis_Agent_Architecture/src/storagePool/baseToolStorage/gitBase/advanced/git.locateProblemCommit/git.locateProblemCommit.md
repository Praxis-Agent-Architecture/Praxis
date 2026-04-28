# git.locateProblemCommit

`git.locateProblemCommit` inspects likely problem-commit candidates through a fixed read-only `git rev-list --bisect-all` action. It is a fine-grained gitBase primitive, not a generic `git.execute` or shell verification runner.

## Use This Tool

Use this tool when the model needs to narrow a known-good to known-bad Git range into bisect candidates while keeping real process execution in the runtime.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "knownGoodRef": "v1.0.0",
    "knownBadRef": "HEAD",
    "verificationCommand": "npm test",
    "maxSteps": 64
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "filesystem:read"]
  }
}
```

## Runtime Behavior

- Storage builds the only allowed argv.
- Runtime executes through `BaseToolExecutorPort.git.runGit`.
- `dryRun !== false` returns a plan and never calls the provider.
- `dryRun:false` requires an affirmative runtime guard.
- Missing runtime provider returns `PROVIDER_UNAVAILABLE`.
- Provider failures are mapped to public-safe provider errors.
- `verificationCommand` is metadata only. The baseTool never runs it.

## Fixed Argv

- `rev-list --bisect-all <knownGoodRef>..<knownBadRef>`

## Returns

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `verificationCommandExecuted:false`, and `resultEnvelope`.

`resultEnvelope` parses candidate commits from `git rev-list --bisect-all` output and reports `bestCandidate`, `candidateCount`, and whether a candidate was located.

## Avoid

- Do not use `shell.commandExecution` to run the verification command.
- Do not run `git bisect start`, `git bisect run`, or mutate bisect state inside this baseTool.
- Do not let the model supply arbitrary Git subcommands or flags.
- Do not add a high-level `executor.git.locateProblemCommit`; runtime stays at `BaseToolExecutorPort.git.runGit`.
