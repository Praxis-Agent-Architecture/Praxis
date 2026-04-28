# code.modify

Use `code.modify` for bounded text replacement inside an existing file. The model supplies structured arguments; the tool must not ask shell to run `sed`, `perl`, or ad hoc redirection.

## Call Shape

```json
{
  "workspaceRoot": "/workspace",
  "targetPath": "src/app.ts",
  "searchText": "old",
  "replacementText": "new",
  "occurrence": "first",
  "maxReplacements": 1,
  "dryRun": false,
  "guard": { "allowed": true }
}
```

## Required Inputs

- `workspaceRoot`: scope anchor for edit auditing.
- `targetPath`: workspace-relative path. Absolute paths, `..`, and NUL bytes are rejected.
- `searchText`: non-empty bounded match text.
- `replacementText`: replacement text, including empty string when clearing the match.

## Runtime Behavior

- Dry-run is the default and returns a plan without touching the provider.
- Real execution requires `dryRun: false` plus an accepted `guard`, `contract`, or `governance` gate.
- Storage core reads raw content, applies `first` or `all` replacement semantics, enforces `maxReplacements`, then asks runtime `filesystem.writeText` to write final content.
- Provider failures are mapped to stable public-safe errors.

## Returns

The output reports `targetPath`, replacement count, before/after byte counts, `bytesWritten`, `applied`, `dryRun`, and `unsafeSideEffects: false`.

## Avoid

- Do not implement replacement semantics inside runtime.
- Do not shell out to text tools.
- Do not expose raw provider errors.
