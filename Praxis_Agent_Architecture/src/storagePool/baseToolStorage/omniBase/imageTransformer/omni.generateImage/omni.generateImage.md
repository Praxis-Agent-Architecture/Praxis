---
description: prepare an image generation request for provider-backed runtime execution.
argument-hint: "{ target: { prompt, outputPath | outputRef, targetFormat?, size? }, context?: { dryRun?, guard? } }"
---

# omni.generateImage

## Use This Tool

Use `omni.generateImage` when an agent needs to prepare an image generation request for provider-backed runtime execution. This baseTool is a contract and handler surface; it does not read media bytes, run codecs, upload files, poll jobs, choose a provider model, or lower provider-specific request bodies.

## Call Shape

```ts
{
  target: {
    prompt: string;
    outputPath?: string;
    outputRef?: string;
    targetFormat?: string;
    maxBytes?: number;
    durationSeconds?: number;
  },
  context?: {
    dryRun?: boolean;
    guard?: { accepted?: boolean; allowed?: boolean; reason?: string };
    allowedInputRoots?: string[];
    allowedOutputRoots?: string[];
    grantedPermissions?: string[];
    requestedScopes?: string[];
    allowedScopes?: string[];
    contract?: { accepted?: boolean; allowed?: boolean; reason?: string };
    governance?: { accepted?: boolean; allowed?: boolean; reason?: string };
  }
}
```

## Required Inputs

Provide `target.prompt`, plus `target.outputPath` or `target.outputRef`.

## Optional Inputs

- `target.targetFormat`: requested output format or MIME-style runtime hint.
- `target.durationSeconds`: runtime duration hint for audio/video generation when relevant.
- `context.allowedInputRoots` and `context.allowedOutputRoots`: optional path-scope fences for runtime-owned material references.
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
    target: { prompt: "A clean product mockup on a white desk.", outputPath: "/workspace/output/mockup.png", targetFormat: "png" },
    context: {
      dryRun: false,
      guard: { accepted: true, allowed: true },
      grantedPermissions: ["provider:invoke", "omni:image:generate", "omni:image:write"]
    }
  },
  executor
});
```

## Avoid

Do not use this tool to read files directly, encode base64, run ffmpeg, load Transformers.js, upload media, choose `/v1/responses` versus Gemini/Claude endpoints, or auto-orchestrate another `omni.*`, `shell.*`, or `code.*` tool. Those behaviors belong to runtime/modelAdapter or agent orchestration.
