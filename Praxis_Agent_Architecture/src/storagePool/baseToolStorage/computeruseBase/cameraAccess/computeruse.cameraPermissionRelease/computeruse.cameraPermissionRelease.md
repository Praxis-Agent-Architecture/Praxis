---
description: Release a camera permission lease through the runtime-owned computer-use permission port.
argument-hint: "{ target?: { leaseId?: string, permissionToken?: string, deviceId?: string, reason?: string }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cameraPermissionRelease

## Use This Tool

Use this tool when runtime/TAP has already decided that a camera permission lease should be released.

This is a low-level camera access capability. It is not a camera selector, capture tool, recording tool, OS permission UI implementation, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cameraPermissionRelease").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "camera-release-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      leaseId: "lease:camera:1",
      deviceId: "camera-1",
      reason: "camera workflow finished",
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

- `target.leaseId`, `target.permissionToken`, top-level `leaseId`, or top-level `permissionToken`: runtime camera permission lease to release.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.releasePermission` through `executor.computeruse`.

## Optional Inputs

- `target.deviceId` or top-level `deviceId`: runtime-specific camera id.
- `target.reason` or top-level `reason`: public-safe reason for lease release.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, lease id normalization, optional device/reason validation, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only release plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.releasePermission` with `resource: "camera"`, `leaseId`, optional `deviceId`, and runtime invocation metadata. If `executor.computeruse` or `releasePermission` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns OS permission state, device policy, lease revocation, persistent grant cleanup, platform adapters, and privacy boundaries. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, camera capture CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera packages, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cameraPermissionRelease`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target`: normalized `leaseId`, optional `deviceId`, and optional `reason`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.releasePermission`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.permissionEnvelope`: dry-run metadata, or real `releaseRequested`, `released`, and `leaseId`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_LEASE_ID`, `INVALID_LEASE_ID`, `INVALID_DEVICE_ID`, `INVALID_REASON`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraPermissionRelease");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "camera-release-1",
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
      leaseId: "lease:camera:1",
      reason: "camera workflow finished",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to request camera permission. Use `computeruse.cameraPermissionRequest`.
- Do not use this tool to select cameras, capture photos, or record video.
- Do not automatically call `omni.viewImage` or `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, camera, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
