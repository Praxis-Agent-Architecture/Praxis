---
description: Move the pointer through the runtime-owned computer-use pointer action port.
argument-hint: "{ purpose: string, target: { x: number, y: number, coordinateSpace?: 'screen'|'window'|'normalized', durationMs?: number, displayId?: string, windowId?: string }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.mouseMove

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive computer-use action is moving the pointer to a specific coordinate.

This is a low-level pointer movement capability. It is not a workflow strategy, browser controller, accessibility-tree action, visual reasoning tool, shell fallback, MCP fallback, or permission UX.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.mouseMove").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "mouse-move-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "move the pointer over the visible submit button",
    target: {
      x: 320,
      y: 240,
      coordinateSpace: "screen",
      durationMs: 120,
      displayId: "primary-display",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: ["tool:computeruse:pointer"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `purpose`: why this movement is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `target.x` and `target.y`, or top-level `x` and `y`: finite non-negative coordinates. Missing values are rejected with `MISSING_TARGET`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.pointerAction` through `executor.computeruse`.

## Optional Inputs

- `target.coordinateSpace` or top-level `coordinateSpace`: `screen`, `window`, or `normalized`; defaults to `screen`.
- `target.durationMs` or top-level `durationMs`: integer from 0 to 10000; defaults to 0.
- `target.displayId` / `target.windowId`: optional runtime target hints.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, pointer target normalization, coordinate validation, duration validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only movement plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.pointerAction` with `action: "move"`, normalized target metadata, and runtime invocation metadata. If `executor.computeruse` or `pointerAction` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns OS pointer events, app focus, platform adapters, permission prompts, session handles, coordinate translation, movement interpolation, and cleanup. The baseTool only declares the movement contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, accessibility APIs, portals, or OS automation libraries into hidden baseTool behavior.

Do not hide local shell, browser automation, MCP, Playwright, Puppeteer, xdotool, ydotool, AppleScript, portals, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.mouseMove`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.x`, `output.target.y`, `output.target.coordinateSpace`, and `output.target.durationMs`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.pointerAction`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.actionEnvelope`: dry-run metadata, or real `actionId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_TARGET`, `INVALID_CONTEXT`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `MISSING_TARGET`, `INVALID_DURATION`, `INVALID_COORDINATE_SPACE`, `INVALID_DISPLAY_ID`, `INVALID_WINDOW_ID`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.mouseMove");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "mouse-move-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async pointerAction(request) {
        return {
          ok: true,
          output: {
            actionId: "action:pointer:move:1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "move the pointer over the visible submit button",
    target: {
      x: 320,
      y: 240,
      durationMs: 120,
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to decide whether pointer movement is the right workflow. TAP/agent owns that composition.
- Do not automatically call screenshot or omni tools before or after the movement.
- Do not use this tool as a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, browser, MCP, accessibility, portal, OS automation, or model-provider dependencies inside `core.ts` or `bestPractice.ts`.
- Do not perform real pointer movement without `dryRun:false` plus an affirmative runtime guard.
