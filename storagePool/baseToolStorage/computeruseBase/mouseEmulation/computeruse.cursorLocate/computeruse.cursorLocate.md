---
description: Locate the current cursor through the runtime-owned computer-use cursor observation port.
argument-hint: "{ purpose: string, target?: { coordinateSpace?: 'screen'|'window'|'normalized', displayId?: string }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cursorLocate

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive computer-use step is observing the current cursor position.

This is a low-level cursor observation capability. It is not a workflow strategy, browser controller, accessibility-tree query, visual reasoning tool, shell fallback, MCP fallback, or permission UX.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cursorLocate").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "cursor-locate-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "record the current cursor position before a guarded click",
    target: {
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

- `purpose`: why the cursor observation is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For live observation, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For live observation, runtime must provide `BaseToolExecutorPort.computeruse.locateCursor` through `executor.computeruse`.

## Optional Inputs

- `target.coordinateSpace` or top-level `coordinateSpace`: `screen`, `window`, or `normalized`; defaults to `screen`.
- `target.displayId` or top-level `displayId`: optional runtime target hint.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, target normalization, coordinate-space validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, cursor-position validation, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only cursor observation plan and never calls a provider.

Live observation dispatches only through `BaseToolExecutorPort.computeruse.locateCursor` with normalized target metadata and runtime invocation metadata. If `executor.computeruse` or `locateCursor` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns cursor state reads, app focus, platform adapters, permission/privacy policy, coordinate translation, session handles, and cleanup. The baseTool only declares the cursor observation contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, accessibility APIs, portals, or OS automation libraries into hidden baseTool behavior.

Do not hide local shell, browser automation, MCP, Playwright, Puppeteer, xdotool, ydotool, AppleScript, portals, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cursorLocate`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.coordinateSpace` and optional `output.target.displayId`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.locateCursor`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.observationEnvelope`: dry-run metadata, or live cursor observation metadata.
- `output.position`: normalized cursor position when live observation succeeds.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_TARGET`, `INVALID_CONTEXT`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `INVALID_COORDINATE_SPACE`, `INVALID_DISPLAY_ID`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_FAILURE`, and `INVALID_CURSOR_POSITION`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cursorLocate");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "cursor-locate-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async locateCursor(request) {
        return {
          ok: true,
          output: {
            x: 320,
            y: 240,
            coordinateSpace: request.coordinateSpace ?? "screen",
          },
          metadata: { adapter: "fake-computeruse" },
        };
      },
    },
  },
  input: {
    purpose: "record the current cursor position before a guarded click",
    target: { coordinateSpace: "screen" },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to decide whether cursor observation is the right workflow. TAP/agent owns that composition.
- Do not automatically call screenshot or omni tools before or after cursor observation.
- Do not use this tool as a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, browser, MCP, accessibility, portal, OS automation, or model-provider dependencies inside `core.ts` or `bestPractice.ts`.
- Do not perform live cursor observation without `dryRun:false` plus an affirmative runtime guard.
