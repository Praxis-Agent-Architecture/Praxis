---
description: Inspect or update repository ignore rules through runtime filesystem IO.
argument-hint: "{target:{repositoryPath,action,ignoreFilePath?,rules?},context:{dryRun?,guard?,allowedRepositoryRoots?,grantedPermissions?}}"
---

# git.manageIgnoreRules

## Use This Tool

Use `git.manageIgnoreRules` when an agent needs to inspect, add, remove, or replace entries in a repository ignore file such as `.gitignore`.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "add",
    "ignoreFilePath": ".gitignore",
    "rules": ["dist/", "coverage/"]
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "filesystem:read", "filesystem:write"]
  }
}
```

## Required Inputs

- `target.repositoryPath`: repository root.
- `target.action`: `inspect`, `add`, `remove`, or `replace`.
- `target.rules`: required for `add`, `remove`, and `replace`.

## Optional Inputs

- `target.ignoreFilePath`: defaults to `.gitignore`.
- `timeoutMs`: runtime timeout hint.

## Runtime Behavior

Storage owns rule normalization and patch semantics. Runtime owns actual file IO through `BaseToolExecutorPort.filesystem.readText/writeText`.

`dryRun !== false` only returns the patch plan. `dryRun:false` requires an affirmative guard before any provider call.

## Returns

The result includes `runtimeEntry`, `risk`, `operationPlan`, `filePath`, `providerCalled`, and a `resultEnvelope` with rule counts, added rules, removed rules, unchanged rules, and bytes written when a write happens.

## Example

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "remove",
    "rules": ["dist/"]
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "filesystem:read", "filesystem:write"]
  }
}
```

## Avoid

- Do not use shell redirection or `sed -i` for ignore-file edits.
- Do not expose arbitrary Git commands.
- Do not allow absolute ignore-file paths or `..` traversal.
