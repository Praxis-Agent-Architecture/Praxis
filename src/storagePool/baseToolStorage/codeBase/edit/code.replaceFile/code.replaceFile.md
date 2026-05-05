# code.replaceFile

Use `code.replaceFile` when the intent is to replace an entire target file with `newContent`. It is similar to `code.overwrite`, but keeps the historical replace-file contract and `expectedCurrentHash` naming.

## Call Shape

```json
{
  "targetPath": "src/app.ts",
  "newContent": "export const value = 2;\n",
  "expectedCurrentHash": "optional-sha256",
  "dryRun": false,
  "guard": { "allowed": true }
}
```

## Required Inputs

- `targetPath`: workspace-relative path.
- `newContent`: complete replacement content.

## Runtime Behavior

- Storage validates path/scope, optional hash, approval, and output shape.
- Runtime supplies only `filesystem.readText` and `filesystem.writeText`.
- Provider exceptions become stable `PROVIDER_FAILURE` errors.

## Returns

The output reports `targetPath`, `contentBytes`, optional current hash metadata, `bytesWritten`, `changed`, `applied`, and `dryRun`.

## Avoid

- Do not keep a second high-level runtime `code.replaceFile` implementation.
- Do not expose raw provider messages.
