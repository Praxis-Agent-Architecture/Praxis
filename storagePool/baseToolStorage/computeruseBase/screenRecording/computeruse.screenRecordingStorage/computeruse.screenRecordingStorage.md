---
description: Finalize and store a runtime-owned screen recording session as a video artifact.
argument-hint: "{ purpose: string, target: { recordingRef: string, storageTarget: string, retentionPolicy?: 'ephemeral'|'session-only'|'session-scoped'|'persistent' }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.screenRecordingStorage

## Use This Tool

Use this tool when runtime/TAP has already decided that an existing screen recording session should be finalized and retained as a video artifact.

This is a low-level computer-use capability. It is not a recording start tool, video analysis tool, media transcoder, browser controller, omni routing step, permission UX, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.screenRecordingStorage").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "store-recording-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "retain the recorded UI workflow for review",
    target: {
      recordingRef: "recording:screen:1",
      storageTarget: "session://recordings/record-1.webm",
      retentionPolicy: "session-scoped",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:screen-recording-storage"],
      allowedScopes: ["tool:computeruse:screen-recording-storage"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `purpose`: why the finalized recording artifact is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `target.recordingRef` or top-level `recordingRef`: runtime recording session handle returned by a start-recording tool.
- `target.storageTarget` or top-level `storageTarget`: runtime storage destination using `artifact://`, `session://`, `runtime://`, or `memory://`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.stopRecording` through `executor.computeruse`.

## Optional Inputs

- `target.retentionPolicy` or top-level `retentionPolicy`: `ephemeral`, `session-only`, `session-scoped`, or `persistent`; defaults to `session-scoped`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, recording handle and storage target normalization, retention-policy validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only storage plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.stopRecording` with `resource: "screen"`, the normalized `recordingRef`, `storageTarget`, `retentionPolicy`, purpose, and runtime invocation metadata. `storageTarget`, `retentionPolicy`, and returned `storageUri` are first-class runtime fields, not hidden metadata semantics. If `executor.computeruse` or `stopRecording` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns recording session handles, finalization, video bytes, artifact storage, retention policy, privacy boundaries, timeout/cancel/cleanup, media codecs, OS portals, and platform adapters. The baseTool only declares the contract and normalizes the artifact envelope.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, portals, local recorders, or media pipelines into hidden baseTool behavior.

Do not hide local shell, portal, recording CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.screenRecordingStorage`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.recordingRef`, `output.target.storageTarget`, and `output.target.retentionPolicy`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.stopRecording`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.storageEnvelope`: dry-run metadata, or real `artifactId`, `mimeType`, and optional `storageUri`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `MISSING_RECORDING_REF`, `INVALID_RECORDING_REF`, `MISSING_STORAGE_TARGET`, `INVALID_STORAGE_TARGET`, `INVALID_RETENTION_POLICY`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.screenRecordingStorage");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "store-recording-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async stopRecording(request) {
        return {
          ok: true,
          output: {
            artifactId: "artifact:video:1",
            mimeType: "video/webm",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "retain the recorded UI workflow for review",
    target: {
      recordingRef: "recording:screen:1",
      storageTarget: "session://recordings/record-1.webm",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to start recording. Use the fullscreen/window/region start tools first.
- Do not use this tool to analyze, transcode, compress, subtitle, or view the final video artifact. Runtime/TAP/omni layers own those later steps.
- Do not automatically call `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, recording, browser, media, device, or model-provider dependencies inside `core.ts` or `bestPractice.ts`.
