---
description: Launch or attach a debug run through runtime-owned debug support.
argument-hint: '{"target":{"kind":"test","label":"unit","command":["npm","test"]},"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# code.debugRun

## Use This Tool
Use `code.debugRun` when the user asks to start, attach, or prepare a debug run.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("code.debugRun").handler.invoke(...)`.

## Required Inputs
- `target`: `program`, `test`, `attach`, or `workspace` target.

## Optional Inputs
- `breakpoints`, `environment`, `timeoutMs`, and `context.guard`.

## Runtime Behavior
Storage validates the debug launch contract. Runtime owns `BaseToolExecutorPort.debug.launch`, sessions, process handles, debugger adapters, and cleanup.

## Returns
Returns debug session id, launch state, accepted breakpoint count, event preview, runtime entry, and audit metadata.

## Example
```json
{"target":{"kind":"test","label":"unit tests","command":["npm","test"]},"breakpoints":[{"file":"src/app.ts","line":12}],"context":{"dryRun":false,"guard":{"allowed":true,"accepted":true}}}
```

## Avoid
- Do not keep debug session lifecycle in storage.
- Do not expose raw debugger or provider failures.
