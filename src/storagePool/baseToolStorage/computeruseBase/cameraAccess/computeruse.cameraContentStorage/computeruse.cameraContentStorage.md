---
description: Store or retain an existing camera content artifact through the runtime-owned artifact store.
argument-hint: "{ target?: { contentRef: string, storageTarget: string, contentKind?: 'camera-photo'|'camera-frame'|'camera-recording'|'generic' }, purpose: string, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cameraContentStorage

## Use This Tool

Use this tool when runtime/TAP has already produced a camera photo, frame, or recording artifact reference and the next primitive action is to retain, promote, or store that reference.

This is a low-level camera artifact storage capability. It is not a camera permission tool, camera capture tool, recording tool, face recognition tool, omni routing step, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cameraContentStorage").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "camera-content-storage-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      contentRef: "artifact:camera-photo:1",
      contentKind: "camera-photo",
      storageTarget: "session://camera/photo-1.png",
      retentionPolicy: "session-scoped",
    },
    purpose: "retain camera photo evidence for the current session",
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

- `target.contentRef`, `target.cameraContentRef`, `target.artifactRef`, or matching top-level aliases: runtime-owned camera content artifact reference.
- `target.storageTarget` or top-level `storageTarget`: runtime storage destination. It must use `artifact://`, `session://`, `runtime://`, or `memory://`.
- `purpose`: why this camera content should be retained.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.artifact.store` through `executor.artifact`.

## Optional Inputs

- `target.contentKind` or top-level `contentKind`: `camera-photo`, `camera-frame`, `camera-recording`, or `generic`; defaults to `camera-photo`.
- `target.retentionPolicy` or top-level `retentionPolicy`: `ephemeral`, `session-only`, `session-scoped`, or `persistent`; defaults to `session-scoped`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, content reference normalization, storage target and retention validation, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only storage plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.artifact.store` with the normalized `contentRef`, mapped artifact kind, `storageTarget`, `retentionPolicy`, `purpose`, and runtime invocation metadata. If `executor.artifact` or `artifact.store` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns camera bytes, photo/video material, artifact retention, privacy boundaries, storage cleanup, and any real filesystem/cloud/object-store write. TAP/agent owns when to call this tool and what to do with the returned artifact reference.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, camera CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera packages, filesystem writes, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cameraContentStorage`.
- `output.dispatch`: `dry-run` or `runtime-artifact`.
- `output.target`: normalized camera content storage target.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.artifact.store`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.storageEnvelope`: dry-run metadata, or real `stored`, `storedArtifactId`, and optional `storageUri`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_CONTENT_REF`, `INVALID_CONTENT_REF`, `INVALID_CONTENT_KIND`, `MISSING_STORAGE_TARGET`, `INVALID_STORAGE_TARGET`, `INVALID_RETENTION_POLICY`, `MISSING_PURPOSE`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraContentStorage");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "camera-content-storage-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    artifact: {
      async store(request) {
        return {
          ok: true,
          output: {
            artifactId: "artifact:camera-photo:stored",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: { adapter: "fake-artifact-store" },
          },
        };
      },
    },
  },
  input: {
    contentRef: "artifact:camera-photo:1",
    storageTarget: "session://camera/photo-1.png",
    purpose: "retain camera photo evidence for the current session",
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to request camera permission, select a camera, capture a photo, start or stop a recording, read camera bytes, or run face recognition. Those are separate cameraAccess primitives and runtime/vision-provider concerns.
- Do not automatically call `omni.viewImage` or `omni.viewVideo`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, camera, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
