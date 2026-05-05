---
description: Click the pointer through the runtime-owned computer-use pointer action port.
argument-hint: "{ purpose: string, target?: { button?: 'left'|'right'|'middle'|'back'|'forward', clickCount?: 1|2|3, at?: { x: number, y: number }, coordinateSpace?: 'screen'|'window'|'normalized', displayId?: string, windowId?: string }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.mouseClick

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive computer-use action is a pointer click.

This is a low-level pointer action capability. It is not a workflow strategy, browser controller, accessibility-tree action, visual reasoning tool, shell fallback, MCP fallback, or permission UX.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.mouseClick").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "mouse-click-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "activate the selected button in the visible app",
    target: {
      button: "left",
      clickCount: 1,
      at: { x: 320, y: 240 },
      coordinateSpace: "screen",
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

- `purpose`: why this click is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.pointerAction` through `executor.computeruse`.

## Optional Inputs

- `target.button` or top-level `button`: `left`, `right`, `middle`, `back`, or `forward`; defaults to `left`.
- `target.clickCount` or top-level `clickCount`: integer from 1 to 3; defaults to 1.
- `target.at` or top-level `at`: finite non-negative `{ x, y }`. If omitted, runtime clicks at the current cursor.
- `target.coordinateSpace` or top-level `coordinateSpace`: `screen`, `window`, or `normalized`; defaults to `screen`.
- `target.displayId` / `target.windowId`: optional runtime target hints.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, pointer target normalization, coordinate validation, button/click-count validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only click plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.pointerAction` with `action: "click"`, normalized target metadata, and runtime invocation metadata. If `executor.computeruse` or `pointerAction` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns OS pointer events, app focus, platform adapters, permission prompts, session handles, coordinate translation, and cleanup. The baseTool only declares the click contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, accessibility APIs, portals, or OS automation libraries into hidden baseTool behavior.

Do not hide local shell, browser automation, MCP, Playwright, Puppeteer, xdotool, ydotool, AppleScript, portals, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.mouseClick`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.button`, `output.target.clickCount`, `output.target.at`, and `output.target.usesCurrentCursor`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.pointerAction`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.actionEnvelope`: dry-run metadata, or real `actionId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_TARGET`, `INVALID_CONTEXT`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `INVALID_BUTTON`, `INVALID_CLICK_COUNT`, `INVALID_COORDINATE_SPACE`, `INVALID_POINT`, `INVALID_DISPLAY_ID`, `INVALID_WINDOW_ID`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.mouseClick");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "mouse-click-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async pointerAction(request) {
        return {
          ok: true,
          output: {
            actionId: "action:pointer:click:1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "activate the selected button in the visible app",
    target: {
      at: { x: 320, y: 240 },
      button: "left",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to decide whether clicking is the right workflow. TAP/agent owns that composition.
- Do not automatically call screenshot or omni tools before or after the click.
- Do not use this tool as a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, browser, MCP, accessibility, portal, OS automation, or model-provider dependencies inside `core.ts` or `bestPractice.ts`.
- Do not perform real pointer actions without `dryRun:false` plus an affirmative runtime guard.
