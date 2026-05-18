---
description: Collect debug logs through runtime-owned debug support.
argument-hint: '{"sources":[{"kind":"debug-console","id":"session"}],"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# code.debugCollectLogs

## Use This Tool
Use `code.debugCollectLogs` when the user asks to inspect debug logs, process logs, test-run logs, or debug-console output.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("code.debugCollectLogs").handler.invoke(...)`.

## Required Inputs
- `sources`: log sources with `kind` and `id` or `path`.

## Optional Inputs
- `maxEntries`, `since`, `redaction`, and `context.guard`.

## Runtime Behavior
Storage owns source validation, redaction flags, truncation, and public-safe errors. Runtime owns `BaseToolExecutorPort.debug.collectLogs`.

## Returns
Returns normalized log entries plus runtime entry and truncation metadata.

## Example
```json
{"sources":[{"kind":"debug-console","id":"debug-1"}],"maxEntries":50,"context":{"dryRun":false,"guard":{"allowed":true,"accepted":true}}}
```

## Avoid
- Do not shell out to `tail` or `cat` logs when the debug log provider is available.
- Do not expose raw provider errors.
