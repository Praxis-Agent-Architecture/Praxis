---
description: Select a camera device through the runtime-owned computer-use device port.
argument-hint: "{ target?: { deviceId: string, availableDevices?: Array<{ id: string }> }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cameraSelect

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to select which camera device should be active for later camera operations.

This is a low-level camera device capability. It is not a permission request tool, photo capture tool, recorder, face-recognition tool, omni routing step, OS settings UI, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cameraSelect").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "camera-select-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      deviceId: "camera-2",
      purpose: "prepare a session-scoped camera capture",
      availableDevices: [
        { id: "camera-1", label: "Integrated Camera", kind: "integrated" },
        { id: "camera-2", label: "USB Camera", kind: "usb" },
      ],
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

- `target.deviceId` or top-level `deviceId`: runtime-specific camera id to select.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.selectDevice` through `executor.computeruse`.

## Optional Inputs

- `target.availableDevices` or top-level `availableDevices`: optional runtime-provided candidate list. If present and non-empty, `deviceId` must be in the list.
- `target.purpose` or top-level `purpose`: audit-only reason for selecting the device.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, device id normalization, optional candidate-list validation, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only camera selection plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.selectDevice` with `resource: "camera"`, `deviceId`, and runtime invocation metadata. If `executor.computeruse` or `selectDevice` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns camera inventory, OS/device policy, active device selection, privacy cleanup, lease coupling, platform adapters, and any OS prompts that device selection may require. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, camera CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera packages, filesystem writes, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cameraSelect`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target`: normalized `deviceId`, optional `availableDevices`, and optional `purpose`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.selectDevice`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.selectionEnvelope`: dry-run metadata, or real `requested`, `selected`, and selected `deviceId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_CAMERA_DEVICE`, `INVALID_CAMERA_DEVICE`, `INVALID_AVAILABLE_DEVICES`, `CAMERA_DEVICE_NOT_AVAILABLE`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraSelect");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "camera-select-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async selectDevice(request) {
        return {
          ok: true,
          output: {
            selected: true,
            deviceId: request.deviceId,
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    deviceId: "camera-2",
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to request camera permission, capture photos, record video, or run face recognition. Those are separate cameraAccess primitives and runtime/vision-provider concerns.
- Do not automatically call `omni.viewImage` or `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, camera, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
