# code.overwrite

Use `code.overwrite` for explicit whole-file writes where the caller supplies the complete final content. Always include `workspaceRoot` as the absolute current workspace root; it is the scope anchor used to audit whether `targetPath` is allowed.

## Call Shape

```json
{
  "workspaceRoot": "/workspace",
  "targetPath": "src/app.ts",
  "content": "export const value = 1;\n",
  "expectedExistingHash": "optional-sha256",
  "dryRun": false,
  "guard": { "allowed": true }
}
```

## Required Inputs

- `workspaceRoot`: absolute current workspace root and scope anchor for edit auditing.
- `targetPath`: workspace-relative path.
- `content`: complete file content.

## Optional Inputs

- `expectedExistingHash`: sha256 of the current file; storage reads current content and rejects mismatch.
- `maxBytes`: byte limit for the supplied content.

## Runtime Behavior

- Dry-run is the default.
- Real execution requires `dryRun: false` and explicit guard/governance acceptance.
- Runtime only supplies `filesystem.readText` for hash checks and `filesystem.writeText` for the final write.

## Returns

The output reports byte counts, hash-check metadata, `bytesWritten`, `applied`, and `dryRun`.

## Avoid

- Do not use shell redirection.
- Do not skip byte and hash checks when supplied.
