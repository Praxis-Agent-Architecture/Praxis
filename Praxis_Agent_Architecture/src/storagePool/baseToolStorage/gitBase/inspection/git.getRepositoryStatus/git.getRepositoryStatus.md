---
description: Read branch and working tree status through the runtime-owned git executor.
argument-hint: "{ target: { repositoryPath: string, porcelainVersion?: 'v1' | 'v2' }, context?: { dryRun?: boolean, guard?: object } }"
---

# git.getRepositoryStatus

## Use This Tool

Use this tool to inspect a Git repository's branch and working tree status. It is read-only and should be preferred over shelling out to `git status` from a model-facing workflow.

This tool is a narrow Git primitive, not a generic Git command runner. The runtime owns process execution, while this storage implementation owns the status-read contract, argv shape, parser, and public result envelope.

## Call Shape

```ts
{
  target: {
    repositoryPath: "/repo/project",
    includeBranch: true,
    includeUntracked: true,
    porcelainVersion: "v1"
  },
  timeoutMs: 30000,
  context: {
    runtimeId: "runtime-1",
    invocationId: "git-status-1",
    dryRun: true,
    guard: { allowed: true }
  }
}
```

## Required Inputs

- `target.repositoryPath`: repository working tree path passed to the runtime git executor.

## Optional Inputs

- `target.includeBranch`: retained for caller compatibility; the runtime command still includes `--branch` so parsing stays stable.
- `target.includeUntracked`: include untracked files; defaults to `true`.
- `target.porcelainVersion`: `v1` or `v2`; defaults to `v1`.
- `timeoutMs`: runtime git execution timeout.
- `context.guard`: required for `dryRun: false`.
- `preferredProvider`: only biases practice metadata; it does not bypass runtime execution.

## Risk Granularity

- `category`: `read-only-inspection`.
- `riskLevel`: `normal`.
- `mutatesRepository`: `false`.
- `mutatesWorkingTree`: `false`.
- `spawnsProcess`: `true`, through the runtime-owned Git executor.
- `requiresTapApproval`: `true`; TAP owns user-facing approval and product policy.

## Runtime Behavior

- Dry-run mode returns the exact `git status` command plan and does not call a provider.
- Real execution requires `context.dryRun === false` and an affirmative guard.
- Real execution calls only `BaseToolExecutorPort.git.runGit({ repositoryPath, args, timeoutMs })`.
- The only subcommand this tool may produce is `status`.
- The only argv shape is `["status", "--porcelain=v1|v2", "--branch"]`, plus `--untracked-files=no` when `includeUntracked === false`.
- Missing runtime git support returns `PROVIDER_UNAVAILABLE`.
- Provider failures return a public-safe `PROVIDER_REJECTED` error.
- Approval, repository sandbox policy, process spawning, timeout enforcement, cancellation, and host binary ownership remain runtime/TAP responsibilities.

## Returns

Returns:

- `output.runtimeEntry`: the real runtime entry, currently `BaseToolExecutorPort.git.runGit`.
- `output.risk`: the risk classification for upper-layer policy.
- `output.gitArgs` and `output.commandPreview`: the fixed Git argv and human-readable command preview.
- `output.resultEnvelope`: branch, upstream, ahead/behind counts when available, and working tree entries with index and working-tree status codes.
- `metadata.audit` when invoked through `gitGetRepositoryStatusHandler`.

## Example

```ts
await handler.invoke({
  toolCallId: "status-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: { repositoryPath: "/repo/project", porcelainVersion: "v2" },
    context: { dryRun: false, guard: { allowed: true } }
  },
  executor
});
```

## Avoid

- Do not use this tool for staging, committing, resetting, or cleaning files.
- Do not use this tool as a generic `git.execute`.
- Do not bypass the runtime git executor with hidden local process execution.
- Do not treat `dryRun: false` as approval without an affirmative guard.
- Do not move repository mutation policy into this baseTool; mutation tools need their own narrow contracts and risk categories.
