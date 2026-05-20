# code.format

Use `code.format` for formatter-backed edits through runtime LSP preview support.

## Call Shape

```json
{
  "workspaceRoot": "/workspace",
  "targetPath": "src/app.ts",
  "languageHint": "typescript",
  "range": { "startLine": 1, "endLine": 20 },
  "dryRun": false,
  "guard": { "allowed": true }
}
```

## Required Inputs

- `workspaceRoot`: scope anchor for edit auditing.
- `targetPath`: workspace-relative path.

## Optional Inputs

- `languageHint`: language id passed to runtime LSP support.
- `range`: positive 1-based line range.
- `options`: formatter options such as `tabSize` or `insertSpaces`.

## Runtime Behavior

- Storage reads current text, asks runtime `lsp.formatDocumentPreview` or `lsp.formatRangePreview` for edits, applies those edits, then writes final content.
- Storage owns the plan/output envelope and approval checks.
- Runtime owns formatter/LSP service contact only.

## Returns

The output reports before/after bytes, edit count, `bytesWritten`, `changed`, `applied`, and `dryRun`.

## Avoid

- Do not shell out to formatters.
- Do not silently write without guard acceptance.
