---
description: Analyze an existing camera frame reference for faces through the runtime-owned computer-use vision port.
argument-hint: "{ target?: { frameRef: string, mode?: 'detect-faces'|'verify-consented-face'|'identify-consented-face', maxFaces?: number }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.cameraFaceRecognition

## Use This Tool

Use this tool when runtime/TAP has already produced a camera frame reference and the next primitive action is to ask a governed runtime vision provider to detect or consent-gated match faces in that frame.

This is a low-level camera frame analysis capability. It is not a camera capture tool, camera storage tool, identity-policy system, omni routing step, browser controller, or fallback strategy.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.cameraFaceRecognition").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "camera-face-analysis-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: {
      frameRef: "artifact:camera-frame:1",
      mode: "detect-faces",
      maxFaces: 8,
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

- `target.frameRef`, `target.cameraFrameRef`, or matching top-level aliases: runtime-owned camera frame artifact reference.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.analyzeCameraFrame` through `executor.computeruse`.
- For `verify-consented-face` or `identify-consented-face`, `subjectConsent.allowed === true || subjectConsent.accepted === true` is required before provider dispatch.

## Optional Inputs

- `target.mode` or top-level `mode`: `detect-faces`, `verify-consented-face`, or `identify-consented-face`; defaults to `detect-faces`.
- `target.maxFaces` or top-level `maxFaces`: defaults to `16` and must be between `1` and `64`.
- `target.deviceId` or top-level `deviceId`: optional runtime camera id metadata.
- `target.subjectRef` or top-level `subjectRef`: optional runtime subject reference used only for consent-gated identity modes.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, frame reference normalization, mode and face-limit validation, subject-consent checks, scope checks, dry-run planning, guard checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only analysis plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.analyzeCameraFrame` with the normalized `frameRef`, mode, device id, max face count, optional subject reference, subject-consent metadata, and runtime invocation metadata. If `executor.computeruse` or `analyzeCameraFrame` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns camera bytes, frame material, model/provider clients, biometric matching, privacy policy, and any face-template storage or retention. This baseTool never stores biometric data and reports `biometricDataStored: false`.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, media codecs, OS APIs, omni, or provider SDKs into hidden baseTool behavior.

Do not hide local shell, portal, camera CLI, browser automation, MCP, Playwright, Puppeteer, ffmpeg, PipeWire, OS automation, camera packages, filesystem writes, or provider SDK dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.cameraFaceRecognition`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target`: normalized face-analysis target.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.analyzeCameraFrame`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.biometricConsentRequired`: true for identity modes.
- `output.biometricDataStored`: always `false`.
- `output.recognitionEnvelope`: dry-run metadata, or real `faceCount`, face entries, and identity-resolution status.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_FRAME_REF`, `INVALID_FRAME_REF`, `INVALID_CAMERA_DEVICE`, `INVALID_MODE`, `INVALID_FACE_LIMIT`, `INVALID_SUBJECT_REF`, `BIOMETRIC_CONSENT_REQUIRED`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.cameraFaceRecognition");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "camera-face-analysis-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async analyzeCameraFrame(request) {
        return {
          ok: true,
          output: {
            faceCount: 1,
            faces: [{ faceId: "face-1", confidence: 0.98 }],
            metadata: { adapter: "fake-vision-runtime" },
          },
        };
      },
    },
  },
  input: {
    frameRef: "artifact:camera-frame:1",
    mode: "detect-faces",
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to capture a camera frame, store camera content, request camera permission, select a camera, or start/stop recording. Those are separate cameraAccess primitives.
- Do not use identity modes without explicit subject consent and runtime/TAP approval.
- Do not store biometric templates or face embeddings in this baseTool. Runtime/TAP owns biometric storage policy if a product ever supports it.
- Do not automatically call `omni.viewImage`; image consumption belongs to TAP/agent or model-adapter layers.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, camera, browser, media, device, model-provider, or filesystem dependencies inside `core.ts` or `bestPractice.ts`.
