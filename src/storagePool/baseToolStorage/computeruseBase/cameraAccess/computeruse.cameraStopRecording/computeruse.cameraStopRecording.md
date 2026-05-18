---
description: Stop a camera recording session through the runtime-owned computer-use media port.
argument-hint: "{ target?: { recordingId: string, purpose: string, storageTarget?: string }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cameraStopRecording

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to stop a camera recording session and return a governed video artifact reference.

This is a low-level camera recording finalization capability. It is not a permission request tool, device selection tool, start-recording tool, face recognition tool, omni routing step, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cameraStopRecording").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "camera-recording-stop-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      recordingId: "recording:camera:1",
      purpose: "finalize a governed camera verification clip",
      storageTarget: "session://recordings/camera-1.webm",
      retentionPolicy: "session-scoped",
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

- `target.recordingId`, `target.recordingRef`, top-level `recordingId`, or top-level `recordingRef`: runtime-owned camera recording session handle.
- `target.purpose` or top-level `purpose`: why the recording session is being stopped.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.stopRecording` through `executor.computeruse`.

## Optional Inputs

- `target.storageTarget` or top-level `storageTarget`: optional runtime storage destination. It must use `artifact://`, `session://`, `runtime://`, or `memory://`.
- `target.retentionPolicy` or top-level `retentionPolicy`: `ephemeral`, `session-only`, `session-scoped`, or `persistent`; defaults to `session-scoped`.
- `target.destinationHint`, `target.persistHint`, top-level `destinationHint`, or top-level `persistHint`: optional runtime metadata used when `storageTarget` is absent.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, recording id normalization, purpose/storage/retention validation, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only stop plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.stopRecording` with `resource: "camera"`, the normalized `recordingId`, optional `storageTarget`, optional `retentionPolicy`, `purpose`, and runtime invocation metadata. If `executor.computeruse` or `stopRecording` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns camera streams, recording session handles, codecs, final video artifact materialization, retention policy enforcement, platform adapters, cleanup, and privacy boundaries. TAP/agent owns when to call this tool and what to do with the returned artifact reference.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, camera CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera packages, filesystem writes, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cameraStopRecording`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target`: normalized camera stop-recording target.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.stopRecording`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.artifactEnvelope`: dry-run metadata, or real `stopRequested`, `stopped`, `artifactId`, `mimeType`, and optional storage metadata.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_RECORDING_ID`, `INVALID_RECORDING_ID`, `MISSING_PURPOSE`, `INVALID_PURPOSE`, `INVALID_STORAGE_TARGET`, `INVALID_RETENTION_POLICY`, `INVALID_DESTINATION_HINT`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraStopRecording");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "camera-recording-stop-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async stopRecording(request) {
        return {
          ok: true,
          output: {
            artifactId: "artifact:video:camera:1",
            mimeType: "video/webm",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    recordingId: "recording:camera:1",
    purpose: "finalize a governed camera verification clip",
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to request camera permission, select a camera, start a recording, capture a still photo, read a final video artifact, or run face recognition. Those are separate cameraAccess primitives and runtime/vision-provider concerns.
- Do not automatically call `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, camera, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
