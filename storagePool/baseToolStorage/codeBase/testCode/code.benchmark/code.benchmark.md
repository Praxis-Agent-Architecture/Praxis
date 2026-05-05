---
description: Run a fixed benchmark target through governed runtime process support.
argument-hint: '{"workspaceRoot":"...","benchmarkTarget":"...","command":["node","bench.js"],"iterations":3,"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# code.benchmark

## Use This Tool
Use `code.benchmark` when the user asks to measure performance or run a bounded benchmark target.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("code.benchmark").handler.invoke(...)`.

## Required Inputs
- `workspaceRoot`: working directory for the runtime process.
- `benchmarkTarget`: benchmark file, script, or named target.

## Optional Inputs
- `command`: fixed command array selected by the runtime/lab adapter.
- `iterations`: measured iterations, capped by storage core.
- `warmup`: warmup runs excluded from the summary.
- `metric`: normally `duration-ms`.
- `context.dryRun` and `context.guard`: real execution requires `dryRun:false` and approval.

## Runtime Behavior
Storage owns iteration count, summary math, truncation, and public-safe errors. Runtime owns `BaseToolExecutorPort.process.run`.

## Returns
Returns run-level status, duration summary, stdout/stderr previews, runtime entry, and truncation metadata.

## Example
```json
{
  "workspaceRoot": "/workspace/project",
  "benchmarkTarget": "scripts/bench.js",
  "command": ["node", "scripts/bench.js"],
  "iterations": 3,
  "context": { "dryRun": false, "guard": { "allowed": true, "accepted": true } }
}
```

## Avoid
- Do not use shell loops for benchmarks when this tool is available.
- Do not run unbounded iterations.
- Do not expose raw runtime/provider failures.
