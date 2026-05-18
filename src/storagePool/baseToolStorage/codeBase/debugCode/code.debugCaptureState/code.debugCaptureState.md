---
description: Capture debug state through runtime-owned debug support.
argument-hint: '{"target":{"kind":"debug-session","id":"debug-1"},"capture":{"includeVariables":true},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# code.debugCaptureState

## Use This Tool
Use `code.debugCaptureState` when the user asks for call stack, variables, breakpoint state, or the current debug现场.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("code.debugCaptureState").handler.invoke(...)`.

## Required Inputs
- `target`: debug-session, process, test-run, or workspace target with an id.

## Optional Inputs
- `capture`: stack, variables, breakpoints, and max variable count.
- `context.guard`: required for real capture.

## Runtime Behavior
Storage normalizes capture semantics and output. Runtime owns `BaseToolExecutorPort.debug.captureState` and live session handles.

## Returns
Returns stack frames, variables, breakpoint data, state, runtime entry, and truncation metadata.

## Example
```json
{"target":{"kind":"debug-session","id":"debug-1"},"capture":{"includeStack":true,"includeVariables":true,"maxVariables":20},"context":{"dryRun":false,"guard":{"allowed":true,"accepted":true}}}
```

## Avoid
- Do not expose raw variable dumps without truncation.
- Do not fake debug state in storage; live state belongs to runtime.
