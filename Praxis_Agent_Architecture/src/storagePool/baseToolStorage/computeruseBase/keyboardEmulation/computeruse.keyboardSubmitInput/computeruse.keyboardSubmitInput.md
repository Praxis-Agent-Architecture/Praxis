---
description: Submit the current governed input target through the runtime-owned computer-use keyboard action port.
argument-hint: "{ purpose: string, target: { submitKey?: 'Enter'|'NumpadEnter', targetHint?: string, repeat?: number }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.keyboardSubmitInput

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to submit the current governed input target with Enter or NumpadEnter.

This is a low-level computer-use keyboard capability. It is not a form policy engine, browser controller, text input tool, focus manager, workflow strategy, or fallback engine.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.keyboardSubmitInput").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "keyboard-submit-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "submit the focused input after text entry",
    target: {
      submitKey: "Enter",
      targetHint: "active text field",
      repeat: 1,
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      requestedScopes: ["tool:computeruse:keyboard"],
      allowedScopes: ["tool:computeruse:keyboard"],
    },
  },
  executor,
});
```

The handler injects `runtimeId`, `sessionId`, and `toolCallId` into runtime invocation metadata before dispatching to storage/core.

## Required Inputs

- `purpose`: why this submit action is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.keyboardAction` through `executor.computeruse`.

## Optional Inputs

- `target.submitKey` or top-level `submitKey`: `Enter` or `NumpadEnter`; defaults to `Enter`.
- `target.targetHint` or top-level `targetHint`: public-safe description of the intended focus target.
- `target.repeat` or top-level `repeat`: integer from `1` to `5`; defaults to `1`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, submit-key normalization, repeat limits, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only keyboard action plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.keyboardAction` with `action: "submit"` and `keys: [submitKey]`. If `repeat > 1`, storage/core repeats the provider call intentionally and returns all action ids. If `executor.computeruse` or `keyboardAction` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns focus boundaries, OS keyboard APIs, accessibility or portal backends, event emission, permission prompts, cancellation, and cleanup. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, portals, or OS automation libraries into hidden baseTool behavior.

Do not hide local shell, portal, browser automation, MCP, Playwright, Puppeteer, ydotool, xdotool, accessibility APIs, clipboard helpers, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.keyboardSubmitInput`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.submitKey`, `output.target.targetHint`, and `output.target.repeat`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.keyboardAction`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.actionEnvelope`: dry-run metadata, or real `actionIds` from runtime.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_TARGET`, `INVALID_CONTEXT`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `INVALID_SUBMIT_KEY`, `INVALID_TARGET_HINT`, `INVALID_REPEAT`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.keyboardSubmitInput");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "keyboard-submit-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async keyboardAction(request) {
        return {
          ok: true,
          output: {
            actionId: "keyboard-submit-action-1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "submit the focused input after text entry",
    target: {
      submitKey: "Enter",
      targetHint: "active text field",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
    },
  },
});
```

## Avoid

- Do not use this tool to type text. Use `computeruse.keyboardInputEmulation` for text input.
- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not automatically inspect screenshots or call `omniBase`; observation and analysis belong to TAP/agent or model-adapter layers.
- Do not emit keyboard events from storage. Runtime owns real keyboard side effects.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, browser, clipboard, media, device, model-provider, or OS automation dependencies inside `core.ts` or `bestPractice.ts`.
