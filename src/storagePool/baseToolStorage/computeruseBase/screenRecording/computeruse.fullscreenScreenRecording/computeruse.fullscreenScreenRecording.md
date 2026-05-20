---
description: Start a fullscreen screen recording session through the runtime-owned computer-use port.
argument-hint: "{ purpose: string, target?: { displayId?: string, maxDurationMs?: number, includeCursor?: boolean, includeAudio?: boolean, outputFormat?: 'video/webm'|'video/mp4'|'video/quicktime', destinationHint?: string }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.fullscreenScreenRecording

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to start recording the full active screen surface.

This is a low-level computer-use capability. It is not a video analysis tool, recording stop tool, storage promotion tool, browser controller, media transcoder, omni routing step, permission UX, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.fullscreenScreenRecording").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "record-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "record the visible app workflow",
    target: {
      displayId: "primary-display",
      maxDurationMs: 30000,
      includeCursor: true,
      includeAudio: false,
      outputFormat: "video/webm",
      destinationHint: "session://recordings/workflow.webm",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:screen-recording"],
      allowedScopes: ["tool:computeruse:screen-recording"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `purpose`: why this recording session is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.startRecording` through `executor.computeruse`.

## Optional Inputs

- `target.displayId` or top-level `displayId`: defaults to `primary-display`.
- `target.maxDurationMs` or top-level `maxDurationMs`: integer from 1 to 3600000; defaults to 30000.
- `target.includeCursor` or top-level `includeCursor`: defaults to `true`.
- `target.includeAudio` or top-level `includeAudio`: defaults to `false`.
- `target.outputFormat` or top-level `outputFormat`: `video/webm`, `video/mp4`, or `video/quicktime`; defaults to `video/webm`.
- `target.destinationHint` or top-level `destinationHint`: optional runtime artifact hint using `artifact://`, `session://`, `runtime://`, or `memory://`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, target normalization, duration/format/destination validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only recording plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.startRecording` with `resource: "screen"`, `target: "fullscreen"`, the normalized display and recording options, and runtime invocation metadata. If `executor.computeruse` or `startRecording` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns screen access, permission prompts, capture streams, OS portals, media codecs, session handles, artifact storage, privacy boundaries, timeout/cancel/cleanup, and platform adapters. The baseTool only declares the contract and normalizes the runtime session handle.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, portals, local recorders, or media pipelines into hidden baseTool behavior.

Do not hide local shell, portal, recording CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.fullscreenScreenRecording`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.displayId`, `output.target.maxDurationMs`, `output.target.includeCursor`, `output.target.includeAudio`, `output.target.outputFormat`, and optional `destinationHint`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.startRecording`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.recordingEnvelope`: dry-run metadata, or real `recordingId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `INVALID_DISPLAY_ID`, `INVALID_MAX_DURATION`, `INVALID_INCLUDE_CURSOR`, `INVALID_INCLUDE_AUDIO`, `INVALID_OUTPUT_FORMAT`, `INVALID_DESTINATION_HINT`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.fullscreenScreenRecording");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "record-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async startRecording(request) {
        return {
          ok: true,
          output: {
            recordingId: "recording:screen:1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "record the visible app workflow",
    target: {
      displayId: "primary-display",
      maxDurationMs: 30000,
      outputFormat: "video/webm",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to stop recording. A stop-recording primitive should consume the returned `recordingId`.
- Do not use this tool to store, transcode, analyze, or view the final video artifact. Runtime/TAP/omni layers own those later steps.
- Do not automatically call `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, recording, browser, media, device, or model-provider dependencies inside `core.ts` or `bestPractice.ts`.
