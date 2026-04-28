---
description: Type text through the runtime-owned computer-use keyboard action port.
argument-hint: "{ purpose: string, target: { text: string, inputMode?: 'text'|'paste', targetHint?: string, maxTextLength?: number }, context?: { dryRun?: boolean, guard?: { accepted?: boolean, allowed?: boolean } } }"
---

# computeruse.keyboardInputEmulation

## Use This Tool

Use this tool when runtime/TAP has already decided that the next primitive action is to type text into the current governed keyboard focus target.

This is a low-level computer-use keyboard capability. It is not a workflow strategy, text generation tool, browser controller, form automation policy, focus manager, clipboard manager, or fallback engine.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("computeruse.keyboardInputEmulation").handler.invoke(...)` with a full `BaseToolInvokeRequest` envelope:

```ts
await handler.invoke({
  toolCallId: "keyboard-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    purpose: "enter the requested value into the focused field",
    target: {
      text: "hello from Praxis",
      inputMode: "text",
      targetHint: "active text field",
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

- `purpose`: why this text input is needed. Empty strings are rejected with `MISSING_PURPOSE`.
- `target.text` or top-level `text`: text to type. Empty strings, whitespace-only strings, NUL-containing strings, and over-limit strings are rejected.
- `runtimeId`: required for audit and runtime correlation. The handler path may inject it from `BaseToolInvokeRequest.runtimeId` into `context.runtimeId`.
- For real execution, `context.dryRun` must be `false` and `context.guard.allowed === true || context.guard.accepted === true`.
- For real execution, runtime must provide `BaseToolExecutorPort.computeruse.keyboardAction` through `executor.computeruse`.

## Optional Inputs

- `target.inputMode` or top-level `inputMode`: `text` or `paste`; defaults to `text`. The runtime port still receives the primitive `type` action.
- `target.targetHint` or top-level `targetHint`: public-safe description of the intended focus target.
- `target.maxTextLength` or top-level `maxTextLength`: bounded per-call text limit; defaults to `4096`.
- `context.invocationId`: defaults to `toolCallId` when invoked through the handler.
- `context.sessionId`: defaults to `BaseToolInvokeRequest.sessionId` when invoked through the handler.
- `context.dryRun`: defaults to `true`.
- `context.requestedScopes` and `context.allowedScopes`: optional scope check. Requested scopes not present in allowed scopes return `SCOPE_DENIED`.
- `preferredProvider`: only selects practice metadata. It does not bypass runtime execution.

## Runtime Behavior

`core.ts` owns unknown-JSON validation, text/inputMode/targetHint normalization, text-length limits, dry-run planning, guard checks, scope checks, provider-missing behavior, provider-failure mapping, and the public result envelope.

Dry-run is the default. Dry-run returns a metadata-only keyboard action plan and never calls a provider.

Real execution dispatches only through `BaseToolExecutorPort.computeruse.keyboardAction` with `action: "type"` and the normalized text. If `executor.computeruse` or `keyboardAction` is absent, the tool returns `PROVIDER_UNAVAILABLE`.

Runtime owns focus boundaries, OS keyboard APIs, accessibility or portal backends, input method behavior, clipboard use when supported, event emission, permission prompts, cancellation, and cleanup. The baseTool only declares the contract and normalizes the runtime result.

Provider practice files are evidence and optional provider factories. They may describe Claude/Codex/Gemini lessons, but they do not turn browser-use, shell commands, clipboard tools, portals, or OS automation libraries into hidden baseTool behavior.

Do not hide local shell, portal, browser automation, MCP, Playwright, Puppeteer, ydotool, xdotool, accessibility APIs, clipboard helpers, or OS automation dependencies inside this baseTool. Those belong in runtime adapters or TAP orchestration.

## Returns

- `output.kind`: `agentCore.basicTool.computeruse.keyboardInputEmulation`.
- `output.dispatch`: `dry-run` or `runtime-computeruse`.
- `output.target.inputMode`, `output.target.targetHint`, `output.target.textCharacters`, and `output.target.textBytes`.
- `output.providerCalled`: whether the runtime port was invoked.
- `output.runtimeEntry.port`: `BaseToolExecutorPort.computeruse.keyboardAction`.
- `output.runtimeEntry.baseToolOwnsTapStrategy`: always `false`.
- `output.actionEnvelope`: dry-run metadata, or real `actionId` from runtime.
- `output.providerMetadata`: public-safe metadata returned by runtime.
- `metadata.audit`: invocation, practice, runtime, and dependency metadata added by the handler adapter.

Stable public errors include `INVALID_REQUEST`, `INVALID_TARGET`, `INVALID_CONTEXT`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `MISSING_TEXT`, `INVALID_TEXT`, `INVALID_INPUT_MODE`, `INVALID_TARGET_HINT`, `INVALID_TEXT_LIMIT`, `TEXT_LIMIT_EXCEEDED`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.keyboardInputEmulation");
if (!lookup.ok) throw new Error("handler missing");

const result = await lookup.handler.invoke({
  toolCallId: "keyboard-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor: {
    computeruse: {
      async keyboardAction(request) {
        return {
          ok: true,
          output: {
            actionId: "keyboard-action-1",
            metadata: { adapter: "fake-computeruse" },
          },
        };
      },
    },
  },
  input: {
    purpose: "enter the requested value into the focused field",
    target: {
      text: "hello from Praxis",
      inputMode: "text",
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

- Do not use this tool to choose workflow strategy, fallback to MCP, or decide whether a browser-specific interface exists. TAP/agent owns that composition.
- Do not automatically inspect screenshots or call `omniBase`; observation and analysis belong to TAP/agent or model-adapter layers.
- Do not emit keyboard events from storage. Runtime owns real keyboard side effects.
- Do not use this tool for shortcuts or submit/confirm actions; those belong to narrower keyboard tools.
- Do not make `computeruseBase` a browser-use wrapper. Browser use is a TAP/MCP/runtime composition concern, not this tool's semantics.
- Do not hide local shell, portal, browser, clipboard, media, device, model-provider, or OS automation dependencies inside `core.ts` or `bestPractice.ts`.
