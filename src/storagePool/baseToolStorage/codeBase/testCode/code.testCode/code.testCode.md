---
description: Run a fixed code test target through governed runtime process support.
argument-hint: '{"workspaceRoot":"...","testTarget":"...","command":["npm","test","--","..."],"context":{"dryRun":false,"guard":{"allowed":true}}}'
---

# code.testCode

## Use This Tool
Use `code.testCode` when the user asks to run a project test, a single test file, or a named test target. Prefer this tool over shell when the intent is testing.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("code.testCode").handler.invoke(...)` with a `BaseToolInvokeRequest`.

## Required Inputs
- `workspaceRoot`: workspace directory for the runtime process.
- `testTarget`: file, directory, package script, or test pattern.

## Optional Inputs
- `command`: fixed command array selected by the runtime/lab adapter, for example `["npm","test","--","test/a.test.ts"]`.
- `testFramework`: label such as `node:test`, `vitest`, or `jest`.
- `updateSnapshots`: true only when snapshot writes are intentionally approved.
- `timeoutMs`: bounded runtime timeout.
- `context.dryRun` and `context.guard`: real execution requires `dryRun:false` and an affirmative guard.

## Runtime Behavior
Storage validates the test contract, scope, guard, timeout, and output shape. Runtime owns `BaseToolExecutorPort.process.run`, process spawning, timeout, cleanup, and host details.

## Returns
Returns a stable output envelope with `status`, `exitCode`, `stdoutPreview`, `stderrPreview`, `runtimeEntry`, `risk`, `providerCalled`, and truncation metadata.

## Example
```json
{
  "workspaceRoot": "/workspace/project",
  "testTarget": "test/unit/example.test.ts",
  "command": ["node", "--test", "test/unit/example.test.ts"],
  "testFramework": "node:test",
  "context": { "dryRun": false, "guard": { "allowed": true, "accepted": true } }
}
```

## Avoid
- Do not use this as a generic shell command runner.
- Do not run real tests without an affirmative runtime guard.
- Do not expose raw provider errors; public failures must stay stable and safe.
