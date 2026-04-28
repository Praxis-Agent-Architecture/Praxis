---
description: Start a camera recording session through the runtime-owned computer-use media port.
argument-hint: "{ target?: { cameraId: string, purpose: string, outputFormat?: 'video/webm'|'video/mp4'|'video/quicktime', includeAudio?: boolean }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cameraStartRecording

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to start a camera recording session and return a governed recording handle.

This is a low-level camera recording session capability. It is not a permission request tool, device selection tool, stop-recording tool, final video artifact reader, omni routing step, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cameraStartRecording").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "camera-recording-start-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      cameraId: "default-camera",
      purpose: "record a governed camera verification clip",
      outputFormat: "video/webm",
      includeAudio: false,
      maxDurationMs: 30000,
      permissionLeaseId: "lease:camera:1",
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

- `target.cameraId` or top-level `cameraId`: runtime-specific camera id.
- `target.purpose` or top-level `purpose`: why the recording session is being started.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.startRecording` through `executor.computeruse`.

## Optional Inputs

- `target.deviceId`: accepted as a compatibility alias for `target.cameraId`.
- `target.outputFormat` or top-level `outputFormat`: `video/webm`, `video/mp4`, or `video/quicktime`; defaults to `video/webm`.
- `target.includeAudio` or top-level `includeAudio`: defaults to `false`. Runtime owns any microphone permission implications.
- `target.maxDurationMs` or top-level `maxDurationMs`: defaults to `60000` and must be no greater than `3600000`.
- `target.recordingLabel` / `target.destinationHint`: optional runtime metadata only.
- `target.permissionLeaseId`, `target.leaseId`, top-level `permissionLeaseId`, or top-level `leaseId`: optional runtime permission lease metadata.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, camera id normalization, purpose/output format/duration validation, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only recording start plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.startRecording` with `resource: "camera"`, normalized target metadata, `outputFormat`, and runtime invocation metadata. If `executor.computeruse` or `startRecording` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns camera streams, audio coupling, codecs, recording session handles, permission lease enforcement, platform adapters, cleanup, and eventual artifact creation. `computeruse.cameraStopRecording` is responsible for turning a session handle into an artifact when the upper layer asks for that primitive.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, camera CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera packages, filesystem writes, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cameraStartRecording`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target`: normalized camera recording target.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.startRecording`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.recordingEnvelope`: dry-run metadata, or real `startRequested`, `started`, and `recordingId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_CAMERA_ID`, `MISSING_PURPOSE`, `INVALID_CAMERA_ID`, `INVALID_PURPOSE`, `INVALID_OUTPUT_FORMAT`, `INVALID_MAX_DURATION`, `INVALID_INCLUDE_AUDIO`, `INVALID_RECORDING_LABEL`, `INVALID_DESTINATION_HINT`, `INVALID_PERMISSION_LEASE`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraStartRecording");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "camera-recording-start-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async startRecording(request) {
        return {
          ok: true,
          output: {
            recordingId: "recording:camera:1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    cameraId: "default-camera",
    purpose: "record a governed camera verification clip",
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to request camera permission, select a camera, stop a recording, read a final video artifact, or run face recognition. Those are separate cameraAccess primitives and runtime/vision-provider concerns.
- Do not automatically call `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, camera, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
