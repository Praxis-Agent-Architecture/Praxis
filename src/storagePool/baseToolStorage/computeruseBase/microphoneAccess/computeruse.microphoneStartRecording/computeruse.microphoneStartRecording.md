---
description: Start a microphone recording session through governed runtime computer-use support.
argument-hint: '{ "purpose": "record voice note", "target": { "deviceId": "mic-usb-1", "maxDurationMs": 30000 }, "context": { "dryRun": false, "guard": { "accepted": true } } }'
---

# computeruse.microphoneStartRecording

## Use This Tool

Use `computeruse.microphoneStartRecording` when the agent needs the runtime to start a microphone recording session and return a recording session handle.

This is a bottom-layer computer-use primitive. It does not decide whether recording is the right workflow, does not analyze the audio, and does not route the future recording artifact to `omniBase`. TAP/agent owns that strategy.

## Call Shape

```ts
await microphoneStartRecordingHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: {
    purpose: "record the user supplied narration",
    target: {
      deviceId: "mic-usb-1",
      permissionLeaseId: "lease:microphone:1",
      recordingLabel: "narration",
      maxDurationMs: 30000,
      sampleRateHz: 48000,
      channelCount: 1,
      outputFormat: "audio/webm",
      destinationHint: "session://recordings/narration.webm",
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

- `purpose`: public-safe reason for starting microphone recording.
- `context.runtimeId`: runtime correlation id. Handler invocation fills this from `BaseToolInvokeRequest.runtimeId` when the input context omits it.

## Optional Inputs

- `target.deviceId`: microphone id. Defaults to `default-microphone`.
- `target.permissionLeaseId`: runtime permission lease created by `computeruse.microphonePermissionRequest`.
- `target.recordingLabel`: public-safe label for runtime UI and audit.
- `target.maxDurationMs`: recording limit from 1 to 3600000 ms.
- `target.sampleRateHz`: integer from 8000 to 192000.
- `target.channelCount`: integer from 1 to 8.
- `target.outputFormat`: `audio/wav`, `audio/webm`, or `audio/mpeg`.
- `target.destinationHint`: optional runtime/artifact destination hint using `artifact://`, `session://`, `runtime://`, or `memory://`.
- `context.allowedDeviceIds`: optional runtime-provided device allowlist.
- `context.guard`: affirmative real-execution approval for `dryRun:false`.

## Runtime Behavior

- Dry-run is the default. Dry-run validates inputs and returns a recording plan without touching microphone state.
- Real execution requires `context.dryRun === false` and `context.guard.accepted === true || context.guard.allowed === true`.
- Real execution only calls `BaseToolExecutorPort.computeruse.startRecording` with `resource: "microphone"`.
- Missing runtime provider returns `PROVIDER_UNAVAILABLE`.
- Provider errors are mapped to `PROVIDER_FAILURE` without exposing raw runtime paths, codec names, command lines, driver names, or stack traces.
- The baseTool never imports audio libraries, opens device streams, shells out to `ffmpeg`, starts PipeWire/portal sessions, stores artifacts directly, or calls `omniBase`.

## Returns

On success, the output includes:

- `kind: "agentCore.basicTool.computeruse.microphoneStartRecording"`.
- `dispatch`: `dry-run` or `runtime-computeruse`.
- `runtimeEntry.port: "BaseToolExecutorPort.computeruse.startRecording"`.
- `recordingEnvelope.resource: "microphone"`.
- `recordingEnvelope.recordingId` when runtime starts a real session.
- `providerCalled`, `permissionsRequired`, and `requiresTapApproval`.
- `permissionsRequired` includes `artifact:write` when `target.destinationHint` asks runtime to bind the recording to an artifact/session destination.
- audit metadata showing selected practice and runtime invocation ids.

Public-safe failures include:

- `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`.
- `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`.
- `INVALID_DEVICE_ID`, `DEVICE_SCOPE_REJECTED`, `INVALID_PERMISSION_LEASE`.
- `INVALID_RECORDING_LABEL`, `INVALID_DESTINATION_HINT`, `INVALID_MAX_DURATION`.
- `INVALID_AUDIO_FORMAT`, `INVALID_OUTPUT_FORMAT`.
- `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `SCOPE_DENIED`.
- `PROVIDER_UNAVAILABLE`, `PROVIDER_FAILURE`.

## Example

```json
{
  "purpose": "record a short voice memo",
  "target": {
    "deviceId": "mic-usb-1",
    "permissionLeaseId": "lease:microphone:1",
    "maxDurationMs": 30000,
    "outputFormat": "audio/webm"
  },
  "context": {
    "runtimeId": "runtime-1",
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Avoid

- Do not request microphone permission here. Use `computeruse.microphonePermissionRequest`.
- Do not select a microphone device here. Use `computeruse.microphoneSelect`.
- Do not stop recording here. Use `computeruse.microphoneStopRecording`.
- Do not analyze audio here. TAP/agent may later route the stopped recording artifact to `omni.listenAudio`.
- Do not fallback to shell, browser automation, MCP, local audio APIs, `ffmpeg`, PipeWire, portal, or `omniBase` when the runtime start-recording port is unavailable.
