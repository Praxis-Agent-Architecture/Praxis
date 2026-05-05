---
description: prepare an image reference for runtime-owned multimodal handling.
argument-hint: "{ target: { imagePath | imageRef, detail?, mediaType?, maxBytes? }, context?: { dryRun?, guard? } }"
---

# omni.viewImage

## Use This Tool

Use `omni.viewImage` when an agent needs to prepare an image reference for runtime-owned multimodal handling. This baseTool is a contract and handler surface; it does not read media bytes, run codecs, upload files, poll jobs, choose a provider model, or lower provider-specific request bodies.

## Call Shape

```ts
{
  target: {
    imagePath?: string;
    imageRef?: string;
    mediaType?: string;
    detail?: "low" | "high" | "original";
    maxBytes?: number;
  },
  context?: {
    dryRun?: boolean;
    guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
    allowedImageRoots?: string[];
    grantedPermissions?: string[];
    requestedScopes?: string[];
    allowedScopes?: string[];
    contract?: { accepted?: boolean; allowed?: boolean; reason?: string };
    governance?: { accepted?: boolean; allowed?: boolean; reason?: string };
  }
}
```

## Required Inputs

Provide either `target.imagePath` or `target.imageRef`.

## Optional Inputs

- `target.detail`: `low`, `high`, or `original` image fidelity hint.
- `target.mediaType`: image MIME hint such as `image/png` or `image/jpeg`.
- `target.maxBytes`: runtime compression budget hint.
- `context.allowedImageRoots`: optional path-scope fence for `target.imagePath`.
- `context.dryRun`: defaults to true and only plans the operation.
- `context.guard`: must include `accepted:true` or `allowed:true` for live dispatch.
- `context.grantedPermissions`, `requestedScopes`, and `allowedScopes`: runtime governance metadata.
- `context.auditMetadata`: public audit fields injected into the runtime request.

## Runtime Behavior

- Dry-run is the default. It validates the target and governance metadata, returns the planned runtime entry, and never calls a provider.
- For `dryRun:false`, the handler requires an affirmative guard and an injected runtime provider through `BaseToolExecutorPort.omni.transformMedia`.
- Runtime/modelAdapter owns media bytes, artifact references, uploads, provider endpoint compatibility, codec/package loading, job polling, and provider body lowering.
- Missing runtime provider returns `PROVIDER_UNAVAILABLE`; runtime/provider rejection returns `PROVIDER_REJECTED` with a public-safe message.
- Agent strategy stays above this tool. The agent may decide to combine this with subtitle generation, frame extraction, model switching, shell/code helpers, or user confirmation after runtime feedback.

## Returns

The public result includes `dispatch`, `providerCalled`, `runtimeEntry`, `operationEnvelope` or `viewEnvelope`, dependency profile, provider practice metadata, provider metadata when available, and public-safe events. It does not return suggested next tools or provider-specific request bodies.

## Example

```ts
await handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: { imagePath: "/workspace/media/source.png", mediaType: "image/png", detail: "high" },
    context: {
      dryRun: false,
      guard: { accepted: true, allowed: true },
      grantedPermissions: ["filesystem:read", "omni:image:view"]
    }
  },
  executor
});
```

## Avoid

Do not use this tool to read files directly, encode base64, run ffmpeg, load Transformers.js, upload media, choose `/v1/responses` versus Gemini/Claude endpoints, or auto-orchestrate another `omni.*`, `shell.*`, or `code.*` tool. Those behaviors belong to runtime/modelAdapter or agent orchestration.
