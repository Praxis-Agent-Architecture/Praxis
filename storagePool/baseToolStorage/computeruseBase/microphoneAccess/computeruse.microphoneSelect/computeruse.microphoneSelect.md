---
description: Select a microphone device through governed runtime computer-use support.
argument-hint: '{ "target": { "deviceId": "mic-1", "targetApplication": "voice-capture" }, "context": { "dryRun": false, "guard": { "accepted": true } } }'
---

# computeruse.microphoneSelect

## Use This Tool

Use `computeruse.microphoneSelect` when the agent needs the runtime to make a specific microphone device the active microphone for a governed session or application target.

This is a bottom-layer computer-use primitive. It does not choose whether microphone selection is the best workflow. TAP/agent owns that strategy and may combine this tool with permission request/release, recording, `omniBase`, `mcpBase`, or `shellBase`.

## Call Shape

```ts
await microphoneSelectHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: {
    target: {
      deviceId: "mic-usb-1",
      targetApplication: "voice-capture",
      permissionLeaseId: "lease:microphone:1",
      selectionReason: "use external microphone for recording",
      availableDevices: [{ id: "mic-usb-1", label: "USB Microphone", kind: "usb" }],
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: ["tool:computeruse:microphone"],
    },
  },
});
```

## Required Inputs

- `target.deviceId`: bounded opaque microphone device id.
- `target.targetApplication`: app/session label that explains where runtime should apply the selection.
- `context.runtimeId`: runtime correlation id. Handler invocation fills this from `BaseToolInvokeRequest.runtimeId` when the input context omits it.

## Optional Inputs

- `target.permissionLeaseId`: runtime permission lease that authorizes microphone operations.
- `target.selectionReason`: public-safe reason for audit and runtime UI.
- `target.availableDevices`: optional runtime-provided inventory snapshot. If present, the selected `deviceId` must appear in this list.
- `context.sessionId`, `context.invocationId`: correlation metadata.
- `context.requestedScopes`, `context.allowedScopes`: scope gate material.
- `context.guard`: affirmative real-execution approval for `dryRun:false`.
- `preferredProvider`: practice selector hint. It does not bypass runtime dependency checks.

## Runtime Behavior

- Dry-run is the default. Dry-run validates the JSON boundary and returns a selection plan without touching microphone state.
- Real execution requires `context.dryRun === false` and `context.guard.accepted === true || context.guard.allowed === true`.
- Real execution only calls `BaseToolExecutorPort.computeruse.selectDevice`.
- Missing runtime provider returns `PROVIDER_UNAVAILABLE`.
- Provider errors are mapped to `PROVIDER_FAILURE` without exposing raw runtime paths, stack traces, driver names, or OS details.
- The baseTool never imports microphone libraries, opens device streams, triggers OS prompts, shells out, starts browser automation, or routes artifacts to another tool.

## Returns

On success, the output includes:

- `kind: "agentCore.basicTool.computeruse.microphoneSelect"`.
- `dispatch`: `dry-run` or `runtime-computeruse`.
- `runtimeEntry.port: "BaseToolExecutorPort.computeruse.selectDevice"`.
- `selectionEnvelope.resource: "microphone"`.
- `selectionEnvelope.deviceId` and optional `permissionLeaseId`.
- `providerCalled` and `requiresTapApproval`.
- audit metadata showing selected practice and runtime invocation ids.

Public-safe failures include:

- `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`.
- `MISSING_RUNTIME_ID`, `MISSING_MICROPHONE_DEVICE`, `MISSING_TARGET_APPLICATION`.
- `INVALID_MICROPHONE_DEVICE`, `INVALID_PERMISSION_LEASE`, `INVALID_SELECTION_REASON`.
- `MICROPHONE_DEVICE_NOT_AVAILABLE`.
- `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `SCOPE_DENIED`.
- `PROVIDER_UNAVAILABLE`, `PROVIDER_FAILURE`.

## Example

```json
{
  "target": {
    "deviceId": "mic-usb-1",
    "targetApplication": "voice-capture",
    "permissionLeaseId": "lease:microphone:1",
    "availableDevices": [
      { "id": "mic-usb-1", "label": "USB Microphone", "kind": "usb" }
    ]
  },
  "context": {
    "runtimeId": "runtime-1",
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Avoid

- Do not use this tool to request microphone permission. Use `computeruse.microphonePermissionRequest`.
- Do not use this tool to release microphone permission. Use `computeruse.microphonePermissionRelease`.
- Do not start or stop audio recording here. Recording belongs to recording tools and runtime session handles.
- Do not fallback to shell, browser automation, MCP, local device APIs, or `omniBase` when `BaseToolExecutorPort.computeruse.selectDevice` is unavailable.
- Do not encode TAP strategy such as "pick MCP first" or "analyze audio next" in this baseTool.
