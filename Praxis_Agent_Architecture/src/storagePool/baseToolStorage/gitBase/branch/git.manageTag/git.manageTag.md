# git.manageTag

Use `git.manageTag` when an agent needs to list tags, create a lightweight tag, create an annotated tag, or delete a tag through fixed Git actions.

## Runtime Contract

- Fixed action: `git tag`.
- Runtime entry: `BaseToolExecutorPort.git.runGit`.
- No generic `git.execute` surface is exposed.
- `dryRun !== false` returns the command plan and never calls the provider.
- `dryRun:false` for create, annotate, or delete requires an affirmative runtime guard.
- The runtime receives only `{ repositoryPath, args, timeoutMs }` after storage has validated and assembled argv.

## Input Shape

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "action": "annotate",
    "tagName": "v1.0.0",
    "targetRef": "HEAD",
    "message": "release v1.0.0",
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

- List tags: `tag --list`.
- Create lightweight tag: `tag [--force] <tagName> <targetRef|HEAD>`.
- Create annotated tag: `tag -a [--force] <tagName> <targetRef|HEAD> -m <message>`.
- Delete tag: `tag -d <tagName>`.

Refs reject empty values, whitespace, NUL, leading dash, path traversal, `@{`, backslash, `//`, colon, and `.lock` suffix.

## Output

The output includes `runtimeEntry`, `risk`, `gitArgs`, `commandPreview`, `providerCalled`, `executionBlocked`, and a `resultEnvelope` with action, tag name, parsed listed tags, operation hint, and create/delete status.

## Avoid

- Do not use `shell.commandExecution` for tag operations.
- Do not let the model choose arbitrary git subcommands.
- Do not use this tool for branch, merge, rebase, commit, or push.
- Do not auto-allow repository roots from model-provided arguments.
