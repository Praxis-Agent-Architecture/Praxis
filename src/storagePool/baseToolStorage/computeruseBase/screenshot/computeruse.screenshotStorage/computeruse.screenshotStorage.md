---
description: Store or retain a screenshot artifact through the runtime-owned computer-use artifact store.
argument-hint: "{ purpose: string, target: { screenshotRef: string, storageTarget: 'artifact://...'|'session://...'|'runtime://...'|'memory://...', retentionPolicy?: 'ephemeral'|'session-only'|'session-scoped'|'persistent' }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.screenshotStorage

## Use This Tool

Use this tool when runtime/TAP has already decided that an existing screenshot artifact should be retained, promoted, or moved into a named runtime artifact scope.

This is a low-level computer-use artifact capability. It is not a screenshot capture tool, filesystem writer, image analysis tool, omni routing step, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.screenshotStorage").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "screen-store-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "retain the screenshot as evidence for this session",
    target: {
      screenshotRef: "artifact:screenshot:latest",
      storageTarget: "session://screenshots/latest.png",
      retentionPolicy: "session-scoped",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:screenshot-storage"],
      allowedScopes: ["tool:computeruse:screenshot-storage"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `purpose`: why this screenshot artifact must be stored. Empty strings are rejected with `MISSING_PURPOSE`.
- `target.screenshotRef` or top-level `screenshotRef`: reference to an existing runtime screenshot artifact. Missing values are rejected with `MISSING_SCREENSHOT_REF`.
- `target.storageTarget` or top-level `storageTarget`: destination reference using `artifact://`, `session://`, `runtime://`, or `memory://`. Local paths and arbitrary strings are rejected with `INVALID_STORAGE_TARGET`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.artifact.store` through `executor.artifact`.

## Optional Inputs

- `target.retentionPolicy` or top-level `retentionPolicy`: `ephemeral`, `session-only`, `session-scoped`, or `persistent`; defaults to `session-scoped`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, screenshot reference validation, destination-scheme validation, retention-policy validation, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only storage plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.artifact.store` with `artifactRef`, `artifactKind: "screenshot"`, `storageTarget`, `retentionPolicy`, `purpose`, and runtime invocation metadata. If `executor.artifact` or `store` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns screenshot bytes, artifact handles, retention enforcement, storage isolation, privacy boundaries, persistence, cleanup, and platform-specific artifact stores. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, local filesystem writes, portals, or media pipelines into hidden baseTool behavior.

Do not hide local shell, filesystem, screenshot CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.screenshotStorage`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.screenshotRef`, `output.target.storageTarget`, and `output.target.retentionPolicy`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.artifact.store`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.storageEnvelope`: dry-run metadata, or real `storedArtifactId`, `storageUri`, and `retentionPolicy`.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_TARGET`, `INVALID_CONTEXT`, `MISSING_RUNTIME_ID`, `MISSING_SCREENSHOT_REF`, `INVALID_SCREENSHOT_REF`, `MISSING_STORAGE_TARGET`, `INVALID_STORAGE_TARGET`, `INVALID_RETENTION_POLICY`, `MISSING_PURPOSE`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.screenshotStorage");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "screen-store-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    artifact: {
      async store(request) {
        return {
          ok: true,
          output: {
            artifactId: "artifact:screenshot:stored-1",
            storageUri: request.storageTarget,
            retentionPolicy: request.retentionPolicy,
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "retain the screenshot as evidence for this session",
    target: {
      screenshotRef: "artifact:screenshot:latest",
      storageTarget: "session://screenshots/latest.png",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to capture a new screenshot. Use a screenshot capture tool first, then store the returned artifact if TAP/agent chooses.
- Do not write local filesystem paths from storage. Runtime owns artifact storage and persistence.
- Do not automatically call `omni.viewImage`; artifact consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, screenshot, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
