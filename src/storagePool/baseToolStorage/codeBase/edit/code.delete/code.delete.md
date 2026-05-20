# code.delete

Use `code.delete` for scoped deletion of a file, directory, or line range.

## Call Shape

```json
{
  "workspaceRoot": "/workspace",
  "targetPath": "src/app.ts",
  "deleteKind": "code-range",
  "range": { "startLine": 10, "endLine": 12 },
  "dryRun": false,
  "guard": { "allowed": true }
}
```

## Required Inputs

- `workspaceRoot`: scope anchor for edit auditing.
- `targetPath`: workspace-relative path.
- `deleteKind`: `file`, `directory`, or `code-range`.

## Runtime Behavior

- `file` and `directory` call runtime `filesystem.deletePath`.
- `code-range` reads raw text, deletes positive 1-based line ranges in storage core, then writes final text.
- Real execution requires `dryRun: false` plus explicit guard/governance acceptance.

## Returns

The output reports delete kind, range, `deleted`, `deletedLines`, `bytesWritten`, `applied`, and `dryRun`.

## Avoid

- Do not use shell `rm`.
- Do not make runtime decide what a line range means.
