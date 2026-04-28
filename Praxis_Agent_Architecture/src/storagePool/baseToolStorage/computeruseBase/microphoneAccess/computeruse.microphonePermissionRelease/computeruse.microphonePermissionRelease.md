---
description: Release a microphone permission lease through the runtime-owned computer-use permission port.
argument-hint: "{ target?: { permissionLeaseId: string, targetApplication: string, deviceId?: string, releaseReason?: string }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.microphonePermissionRelease

## Use This Tool

Use this tool when runtime/TAP has already decided that an existing microphone permission lease should be released.

This is a low-level microphone access lifecycle capability. It is not an audio recorder, transcription tool, omni routing step, OS permission UI implementation, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.microphonePermissionRelease").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "mic-release-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      permissionLeaseId: "lease:microphone:1",
      targetApplication: "voice-capture",
      deviceId: "default-microphone",
      releaseReason: "capture-complete",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:microphone"],
      allowedScopes: ["tool:computeruse:microphone"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `target.permissionLeaseId` or top-level `permissionLeaseId`: runtime lease returned by the permission request tool.
- `target.targetApplication` or top-level `targetApplication`: application or workflow surface whose lease is being released.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.releasePermission` through `executor.computeruse`.

## Optional Inputs

- `target.deviceId` or top-level `deviceId`: runtime-specific microphone id.
- `target.releaseReason` or top-level `releaseReason`: public-safe reason for releasing the permission lease.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, lease id validation, target normalization, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only release plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.releasePermission` with `resource: "microphone"`, the permission lease id, optional `deviceId`, and runtime invocation metadata. If `executor.computeruse` or `releasePermission` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns OS prompts, app/device allowlists, microphone privacy boundaries, permission leases, revocation, platform adapters, and cleanup. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, audio capture CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera/microphone packages, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.microphonePermissionRelease`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target`: normalized `permissionLeaseId`, `targetApplication`, optional `deviceId`, and `releaseReason`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.releasePermission`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.releaseEnvelope`: dry-run metadata, or real `requested`, `released`, and `leaseId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_PERMISSION_LEASE`, `INVALID_PERMISSION_LEASE`, `MISSING_TARGET_APPLICATION`, `INVALID_DEVICE_ID`, `INVALID_RELEASE_REASON`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.microphonePermissionRelease");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "mic-release-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async releasePermission(request) {
        return {
          ok: true,
          output: {
            released: true,
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    target: {
      permissionLeaseId: "lease:microphone:1",
      targetApplication: "voice-capture",
      releaseReason: "capture-complete",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to request microphone permission. Use `computeruse.microphonePermissionRequest` first.
- Do not use this tool to record or stop audio. It only releases a permission lease.
- Do not automatically call `omni.listenAudio`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, audio, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
