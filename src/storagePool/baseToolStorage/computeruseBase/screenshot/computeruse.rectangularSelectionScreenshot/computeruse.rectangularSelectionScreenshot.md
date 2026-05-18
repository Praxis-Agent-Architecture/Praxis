---
description: Capture a specific rectangular selection screenshot through the runtime-owned computer-use port.
argument-hint: "{ purpose: string, target: { rect: { x: number, y: number, width: number, height: number, coordinateSpace?: 'screen'|'window'|'normalized' }, displayId?: string, outputFormat?: 'image/png'|'image/jpeg'|'image/webp' }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.rectangularSelectionScreenshot

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to request a rectangular selection screenshot artifact from the active computer-use surface.

This is a low-level computer-use capability. It is not a workflow strategy, browser controller, visual reasoning tool, media lowering tool, permission UX, or fallback engine.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.rectangularSelectionScreenshot").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "screen-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "inspect the visible app state",
    target: {
      rect: { x: 20, y: 40, width: 800, height: 600, coordinateSpace: "screen" },
      displayId: "primary-display",
      outputFormat: "image/png",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:screen"],
      allowedScopes: ["tool:computeruse:screen"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `purpose`: why this screenshot is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `target.rect` or top-level `rect`: rectangle coordinates with `x`, `y`, `width`, and `height`. Missing values are rejected with `MISSING_RECT`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.captureScreenshot` through `executor.computeruse`.

## Optional Inputs

- `target.displayId` or top-level `displayId`: defaults to `primary-display`.
- `target.coordinateSpace` or top-level `coordinateSpace`: `screen`, `window`, or `normalized`; defaults to `screen`.
- `target.outputFormat` or top-level `outputFormat`: `image/png`, `image/jpeg`, or `image/webp`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, region target normalization, output-format validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only capture plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.captureScreenshot` with `target: "region"` and a normalized `region` rectangle. If `executor.computeruse` or `captureScreenshot` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns screen access, permission prompts, privacy boundaries, platform adapters, bytes, artifact storage, and cleanup. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, portals, or media pipelines into hidden baseTool behavior.

Do not hide local shell, portal, screenshot CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.rectangularSelectionScreenshot`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.rect`, `output.target.displayId`, and `output.target.outputFormat`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.captureScreenshot`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.captureEnvelope`: dry-run metadata, or real `artifactId` and `mimeType`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `MISSING_RECT`, `INVALID_RECT`, `RECT_TOO_LARGE`, `INVALID_COORDINATE_SPACE`, `INVALID_OUTPUT_FORMAT`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.rectangularSelectionScreenshot");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "screen-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async captureScreenshot(request) {
        return {
          ok: true,
          output: {
            artifactId: "artifact:screenshot:1",
            mimeType: request.outputFormat ?? "image/png",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "inspect the visible app state",
    target: {
      rect: { x: 20, y: 40, width: 800, height: 600 },
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not automatically call `omni.viewImage`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not return screenshot bytes from storage. Runtime owns bytes and artifact storage.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, screenshot, browser, media, device, or model-provider dependencies inside `core.ts` or `bestPractice.ts`.
