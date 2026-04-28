---
description: Request camera access through the runtime-owned computer-use permission port.
argument-hint: "{ purpose: string, target?: { targetApplication: string, deviceId?: string, mode?: 'session'|'single-capture'|'recording', requestedDurationMs?: number }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cameraPermissionRequest

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to request a camera permission lease from the active computer-use runtime.

This is a low-level camera access capability. It is not a photo capture tool, video recorder, face-recognition tool, omni routing step, OS permission UI implementation, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cameraPermissionRequest").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "camera-permission-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      targetApplication: "visual-capture",
      purpose: "capture a session-scoped camera photo",
      deviceId: "default-camera",
      mode: "single-capture",
      requestedDurationMs: 30000,
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:camera"],
      allowedScopes: ["tool:computeruse:camera"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `target.targetApplication` or top-level `targetApplication`: application or workflow surface that needs camera access.
- `target.purpose` or top-level `purpose`: why camera permission is requested.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.requestPermission` through `executor.computeruse`.

## Optional Inputs

- `target.deviceId` or top-level `deviceId`: runtime-specific camera id.
- `target.mode` or top-level `mode`: `session`, `single-capture`, or `recording`; defaults to `session`.
- `target.requestedDurationMs` or top-level `requestedDurationMs`: defaults to `60000`.
- `target.maxDurationMs` or top-level `maxDurationMs`: defaults to `600000`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, target normalization, duration validation, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only permission plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.requestPermission` with `resource: "camera"`, `purpose`, optional `deviceId`, and runtime invocation metadata. If `executor.computeruse` or `requestPermission` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns OS prompts, app/device allowlists, camera privacy boundaries, permission leases, persistent grants, revocation, platform adapters, and cleanup. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, camera capture CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera packages, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cameraPermissionRequest`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target`: normalized `targetApplication`, `purpose`, optional `deviceId`, `mode`, and `requestedDurationMs`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.requestPermission`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.permissionEnvelope`: dry-run metadata, or real `requested`, `granted`, and optional `leaseId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_TARGET_APPLICATION`, `MISSING_PURPOSE`, `INVALID_DEVICE_ID`, `INVALID_MODE`, `INVALID_DURATION`, `DURATION_LIMIT_EXCEEDED`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraPermissionRequest");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "camera-permission-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async requestPermission(request) {
        return {
          ok: true,
          output: {
            granted: true,
            leaseId: "lease:camera:1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    target: {
      targetApplication: "visual-capture",
      purpose: "capture a session-scoped camera photo",
      mode: "single-capture",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to capture photos or record video. It only requests camera permission; capture/recording belongs to camera capture tools and runtime media adapters.
- Do not automatically call `omni.viewImage` or `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, camera, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
