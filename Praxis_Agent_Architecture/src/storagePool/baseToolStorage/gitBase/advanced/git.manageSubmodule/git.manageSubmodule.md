# git.manageSubmodule

`git.manageSubmodule` manages Git submodules through fixed `git submodule` actions. It is a fine-grained gitBase primitive, not a generic `git.execute` surface.

## Use This Tool

Use this tool to inspect, add, update, sync, or deinitialize submodules while keeping the real Git process in runtime.

## Call Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "add",
    "submodulePath": "vendor/toolkit",
    "remoteUrl": "https://example.test/toolkit.git",
    "branch": "main",
    "recursive": true
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "allowedRepositoryRoots": ["/repo"],
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write", "network:egress"]
  }
}
```

## Runtime Behavior

- Storage builds the only allowed argv.
- Runtime executes through `BaseToolExecutorPort.git.runGit`.
- `dryRun !== false` returns a plan and never calls the provider.
- Mutating actions require an affirmative guard for `dryRun:false`.
- `add` and `update` may use network and require `network:egress`.
- Provider failures are mapped to public-safe provider errors.

## Fixed Argv

- `status`: `submodule status [--recursive] [-- <submodulePath>]`
- `add`: `submodule add [-b <branch>] <remoteUrl> <submodulePath>`
- `update`: `submodule update --init [--recursive] [-- <submodulePath>]`
- `sync`: `submodule sync [--recursive] [-- <submodulePath>]`
- `deinit`: `submodule deinit -- <submodulePath>`

## Returns

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `mayUseNetwork`, and `resultEnvelope`.

For `status`, `resultEnvelope.entries` parses status lines into stable entries.

## Avoid

- Do not use `shell.commandExecution` for submodule operations.
- Do not let the model supply arbitrary Git subcommands or flags.
- Do not add a high-level `executor.git.manageSubmodule`; runtime stays at `BaseToolExecutorPort.git.runGit`.
