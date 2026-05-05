---
description: Confirm a checkbox state through the runtime-owned computer-use pointer action port.
argument-hint: "{ purpose: string, target: { label?: string, selectorHint?: string, point?: { x: number, y: number }, expectedState?: 'checked'|'unchecked', currentState?: 'checked'|'unchecked', coordinateSpace?: 'screen'|'window'|'normalized', clickMode?: 'single-click'|'double-click' }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.checkboxConfirm

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive computer-use action is confirming a checkbox into a requested state.

This is a low-level checkbox confirmation capability. It is not a workflow strategy, browser controller, accessibility-tree action, visual reasoning tool, shell fallback, MCP fallback, or permission UX.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.checkboxConfirm").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "checkbox-confirm-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "confirm the visible I agree checkbox is checked",
    target: {
      label: "I agree",
      point: { x: 120, y: 240 },
      expectedState: "checked",
      currentState: "unchecked",
      coordinateSpace: "screen",
      clickMode: "single-click",
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

- `purpose`: why this checkbox confirmation is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- A target locator: at least one of `target.label`, `target.selectorHint`, or `target.point`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.pointerAction` through `executor.computeruse`.

## Optional Inputs

- `target.expectedState`: `checked` or `unchecked`; defaults to `checked`.
- `target.currentState`: optional observed state used to expose whether a toggle is expected.
- `target.coordinateSpace` or top-level `coordinateSpace`: `screen`, `window`, or `normalized`; defaults to `screen`.
- `target.clickMode` or top-level `clickMode`: `single-click` or `double-click`; defaults to `single-click`.
- `target.displayId` / `target.windowId`: optional runtime target hints.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, target normalization, checkbox state validation, click-mode validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only checkbox confirmation plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.pointerAction` with `action: "confirm"`, normalized target metadata, and runtime invocation metadata. If `executor.computeruse` or `pointerAction` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns target resolution, OS pointer events, app focus, platform adapters, permission prompts, session handles, coordinate translation, state confirmation, and cleanup. The baseTool only declares the checkbox confirmation contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, accessibility APIs, portals, or OS automation libraries into hidden baseTool behavior.

Do not hide local shell, browser automation, MCP, Playwright, Puppeteer, xdotool, ydotool, AppleScript, portals, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.checkboxConfirm`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.expectedState`, optional `currentState`, and locator hints.
- `output.target.wouldToggle`: whether the known current state differs from the requested state.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.pointerAction`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.actionEnvelope`: dry-run metadata, or real `actionId`.
- `output.finalState`: public-safe final state when returned by runtime.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_TARGET`, `INVALID_CONTEXT`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `MISSING_TARGET`, `INVALID_POINT`, `INVALID_STATE`, `INVALID_CLICK_MODE`, `INVALID_COORDINATE_SPACE`, `INVALID_DISPLAY_ID`, `INVALID_WINDOW_ID`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.checkboxConfirm");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "checkbox-confirm-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async pointerAction(request) {
        return {
          ok: true,
          output: {
            actionId: "action:pointer:confirm:1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "confirm the visible I agree checkbox is checked",
    target: {
      label: "I agree",
      point: { x: 120, y: 240 },
      expectedState: "checked",
      currentState: "unchecked",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to decide whether checkbox confirmation is the right workflow. TAP/agent owns that composition.
- Do not automatically call screenshot, cursor locate, mouse click, or omni tools before or after the confirmation.
- Do not use this tool as a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, browser, MCP, accessibility, portal, OS automation, or model-provider dependencies inside `core.ts` or `bestPractice.ts`.
- Do not perform real checkbox confirmation without `dryRun:false` plus an affirmative runtime guard.
