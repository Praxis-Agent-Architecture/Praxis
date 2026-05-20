---
description: Stop a microphone recording session through governed runtime computer-use support.
argument-hint: '{ "purpose": "finish voice note", "target": { "recordingId": "recording:microphone:1" }, "context": { "dryRun": false, "guard": { "accepted": true } } }'
---

# computeruse.microphoneStopRecording

## Use This Tool

Use `computeruse.microphoneStopRecording` when the agent needs the runtime to stop a microphone recording session and return an audio artifact handle.

This is a bottom-layer computer-use primitive. It does not analyze the audio and does not route the artifact to `omniBase`. TAP/agent owns workflow strategy, user-facing approval, fallback, and post-processing.

## Call Shape

```ts
await microphoneStopRecordingHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: {
    purpose: "finish the narration capture",
    target: {
      recordingId: "recording:microphone:1",
      deviceId: "mic-usb-1",
      persistHint: "session://recordings/narration.webm",
      releaseDevice: true,
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:microphone-recording"],
      allowedScopes: ["tool:computeruse:microphone-recording"],
    },
  },
});
```

## Required Inputs

- `target.recordingId`: runtime recording session handle returned by `computeruse.microphoneStartRecording`.
- `purpose`: public-safe reason for stopping the recording.
- `context.runtimeId`: runtime correlation id. Handler invocation fills this from `BaseToolInvokeRequest.runtimeId` when the input context omits it.

## Optional Inputs

- `target.deviceId`: microphone id for audit and runtime cleanup.
- `target.persistHint`: runtime/artifact destination hint using `artifact://`, `session://`, `runtime://`, or `memory://`.
- `target.releaseDevice`: whether runtime should release or clean up the microphone lease when stopping. Defaults to `true`.
- `context.sessionId`, `context.invocationId`: correlation metadata.
- `context.requestedScopes`, `context.allowedScopes`: scope gate material.
- `context.guard`: affirmative real-execution approval for `dryRun:false`.
- `preferredProvider`: practice selector hint. It does not bypass runtime dependency checks.

## Runtime Behavior

- Dry-run is the default. Dry-run validates inputs and returns a stop plan without touching microphone state.
- Real execution requires `context.dryRun === false` and `context.guard.accepted === true || context.guard.allowed === true`.
- Real execution only calls `BaseToolExecutorPort.computeruse.stopRecording` with `resource: "microphone"`, the runtime `recordingId`, optional `storageTarget` from `target.persistHint`, and `purpose`.
- Missing runtime provider returns `PROVIDER_UNAVAILABLE`.
- Provider errors are mapped to `PROVIDER_FAILURE` without exposing raw runtime paths, codec names, command lines, driver names, or stack traces.
- The baseTool never imports audio libraries, opens device streams, shells out to `ffmpeg`, starts PipeWire/portal sessions, writes artifacts directly, releases OS permission itself, or calls `omniBase`.

## Returns

On success, the output includes:

- `kind: "agentCore.basicTool.computeruse.microphoneStopRecording"`.
- `dispatch`: `dry-run` or `runtime-computeruse`.
- `runtimeEntry.port: "BaseToolExecutorPort.computeruse.stopRecording"`.
- `recordingEnvelope.resource: "microphone"`.
- `recordingEnvelope.recordingId`.
- `recordingEnvelope.artifactId` and `mimeType` when runtime stops a real session.
- `providerCalled`, `permissionsRequired`, and `requiresTapApproval`.
- audit metadata showing selected practice and runtime invocation ids.

Public-safe failures include:

- `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`.
- `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `MISSING_RECORDING_ID`.
- `INVALID_RECORDING_ID`, `INVALID_DEVICE_ID`, `INVALID_PERSIST_HINT`, `INVALID_RELEASE_DEVICE`.
- `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `SCOPE_DENIED`.
- `PROVIDER_UNAVAILABLE`, `PROVIDER_FAILURE`.

## Example

```json
{
  "purpose": "finish voice memo",
  "target": {
    "recordingId": "recording:microphone:1",
    "deviceId": "mic-usb-1",
    "persistHint": "session://recordings/voice-memo.webm",
    "releaseDevice": true
  },
  "context": {
    "runtimeId": "runtime-1",
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Avoid

- Do not request or release microphone permission here. Use `computeruse.microphonePermissionRequest` or `computeruse.microphonePermissionRelease` when TAP chooses that path.
- Do not start recording here. Use `computeruse.microphoneStartRecording`.
- Do not analyze audio here. TAP/agent may later route the returned artifact to `omni.listenAudio`.
- Do not fallback to shell, browser automation, MCP, local audio APIs, `ffmpeg`, PipeWire, portal, or `omniBase` when the runtime stop-recording port is unavailable.
