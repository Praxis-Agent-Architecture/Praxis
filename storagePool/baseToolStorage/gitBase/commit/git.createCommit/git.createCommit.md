---
description: "Create a commit through fixed git commit semantics."
argument-hint: '{"target":{"repositoryPath":"/repo/project","commitMessage":"Ship it","includeAllTracked":true,"signoff":true},"context":{"dryRun":false,"guard":{"allowed":true,"accepted":true},"allowedRepositoryRoots":["/repo"],"grantedPermissions":["git:read","git:write","filesystem:read","filesystem:write"]}}'
---

# git.createCommit

## Use This Tool

Use `git.createCommit` to create a commit through fixed git commit semantics. It is a fixed-action gitBase tool exposed through the unified `BaseToolHandler.invoke()` surface. The model must call this narrow tool rather than `shell.commandExecution`, `git.execute`, or a made-up `gitBase.*` tool id.

Risk class: `history-mutation`. Runtime contact is owned by `BaseToolExecutorPort.git.runGit`; storage owns validation, fixed-action planning, result parsing, and public-safe errors.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "commitMessage": "Ship it",
    "includeAllTracked": true,
    "signoff": true
  },
  "context": {
    "dryRun": false,
    "guard": {
      "allowed": true,
      "accepted": true
    },
    "allowedRepositoryRoots": [
      "/repo"
    ],
    "grantedPermissions": [
      "git:read",
      "git:write",
      "filesystem:read",
      "filesystem:write"
    ]
  }
}
```

## Required Inputs

- `target.repositoryPath`.
- `target.commitMessage`.
- `context.dryRun`: use `false` only when the runtime/TAP layer has approved real execution.
- `context.guard`: real execution requires `allowed === true` or `accepted === true`.
- `context.allowedRepositoryRoots`: runtime-approved repository roots; never widen this from model-provided paths.

## Optional Inputs

- `target.includeAllTracked`.
- `target.allowEmpty`.
- `target.signoff`.
- `timeoutMs`.
- `context.grantedPermissions`: permission hints such as `git:read`, `git:write`, `filesystem:read`, `filesystem:write`, or `network:egress` according to the action.

## Runtime Behavior

Storage validates unknown JSON before reading nested fields, trims and validates refs or paths, checks repository scope and permissions, and then builds only the fixed action for this tool.

Allowed fixed argv or fixed action:

- `commit [--all] [--allow-empty] [--signoff] -m <commitMessage>`

If `context.dryRun !== false`, the tool returns a command plan and does not call a provider. If `context.dryRun === false`, storage requires an affirmative guard before dispatch. Missing runtime support returns `PROVIDER_UNAVAILABLE`; provider failures are mapped to public-safe errors such as `PROVIDER_REJECTED`. Runtime/TAP owns process execution, sandboxing, timeout, cancellation, host Git availability, and user-facing approval.

## Returns

Returns a normalized `BaseToolInvokeResult`. The public output includes `runtimeEntry`, `risk`, fixed `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, raw public-safe provider fields when executed, and a parsed `resultEnvelope`.

The result is safe for runtime inspection: no raw stack traces, hidden shell commands, credentials, or private provider internals should be exposed.

## Example

```json
{
  "tool": "git.createCommit",
  "arguments": {
    "target": {
      "repositoryPath": "/repo/project",
      "commitMessage": "Ship it",
      "includeAllTracked": true,
      "signoff": true
    },
    "context": {
      "dryRun": false,
      "guard": {
        "allowed": true,
        "accepted": true
      },
      "allowedRepositoryRoots": [
        "/repo"
      ],
      "grantedPermissions": [
        "git:read",
        "git:write",
        "filesystem:read",
        "filesystem:write"
      ]
    }
  }
}
```

## Avoid

- Do not expose or simulate a generic `git.execute`.
- Do not let the model provide arbitrary git subcommands or flags.
- Do not bypass `createBaseToolRegistry().lookupHandler("git.createCommit")` and `handler.invoke(...)` in integration tests.
- Do not call shell tools for this Git intent when the fixed-action gitBase tool exists.
- Do not auto-allow repository roots, destructive actions, network access, or history mutation from model text alone.
- Do not move approval, sandbox, or live process ownership into storage; runtime and TAP own those boundaries.
