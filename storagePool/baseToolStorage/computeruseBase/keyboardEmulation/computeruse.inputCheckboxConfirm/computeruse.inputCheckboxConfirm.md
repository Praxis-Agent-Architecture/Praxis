---
description: Confirm a governed checkbox state through the runtime-owned computer-use keyboard port.
argument-hint: "{ purpose, target: { label|selectorHint, expectedState?, currentState?, confirmationKey? }, context? }"
---

# computeruse.inputCheckboxConfirm

## Use This Tool

Use `computeruse.inputCheckboxConfirm` when the model needs the primitive keyboard action for confirming a focused checkbox-like input target.

This baseTool only carries the capability. TAP/agent decides whether the workflow should use structured app control, browser-use, MCP, shell, a pointer action, observation tools, or this keyboard primitive.

## Call Shape

Invoke through `BaseToolHandler.invoke` or the registry handler for `computeruse.inputCheckboxConfirm`.

```json
{
  "purpose": "confirm the user accepted the terms checkbox",
  "target": {
    "label": "I agree",
    "expectedState": "checked",
    "currentState": "unchecked",
    "confirmationKey": "space"
  },
  "context": {
    "runtimeId": "runtime-1",
    "dryRun": true
  }
}
```

Top-level `label`, `selectorHint`, `expectedState`, `currentState`, and `confirmationKey` are accepted for compatibility, but the canonical shape is `target.*`.

## Required Inputs

- `purpose`: public-safe reason for confirming the checkbox state.
- `target.label` or `target.selectorHint`: public-safe target hint. Runtime owns the real focus boundary.
- `context.runtimeId`: injected by the handler from `BaseToolInvokeRequest.runtimeId` when absent.

## Optional Inputs

- `target.expectedState`: `checked` or `unchecked`, defaults to `checked`.
- `target.currentState`: `checked` or `unchecked`; when it already equals `expectedState`, real execution is a no-op.
- `target.confirmationKey`: `space` or `enter`, defaults to `space`.
- `context.dryRun`: defaults to preview mode.
- `context.guard`: required with `accepted: true` or `allowed: true` for side-effecting `dryRun:false`.
- `context.requestedScopes` and `context.allowedScopes`: scope evidence.
- `metadata`: public-safe audit metadata.

## Runtime Behavior

Dry-run validates JSON and returns a metadata-only action envelope. It never calls the provider.

Real execution requires `dryRun:false` plus an affirmative guard. If the supplied `currentState` already equals `expectedState`, the tool returns an already-confirmed envelope without pressing a key. Otherwise, `dependencies.ts` dispatches a single `confirm` action to `BaseToolExecutorPort.computeruse.keyboardAction`.

Runtime owns focus resolution, checkbox target resolution, OS automation backend, keyboard event emission, permission prompts, cancellation, and cleanup. TAP/agent owns that composition and any fallback choice.

## Returns

Success returns:

- `kind: "agentCore.basicTool.computeruse.inputCheckboxConfirm"`
- normalized label or selector hint
- expected/current state, confirmation key, key sequence, and `wouldToggle`
- `runtimeEntry.port: "BaseToolExecutorPort.computeruse.keyboardAction"`
- dry-run, already-confirmed, or runtime dispatch metadata
- runtime action id for real key dispatch

Errors are public-safe and include `INVALID_REQUEST`, `INVALID_CONTEXT`, `MISSING_PURPOSE`, `MISSING_RUNTIME_ID`, `MISSING_TARGET`, `INVALID_TARGET`, `INVALID_STATE`, `INVALID_CONFIRMATION_KEY`, `SCOPE_DENIED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.inputCheckboxConfirm");
if (lookup.ok) {
  const result = await lookup.handler.invoke({
    toolCallId: "checkbox-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "confirm the agreement checkbox",
      target: {
        label: "I agree",
        expectedState: "checked",
        currentState: "unchecked",
        confirmationKey: "space"
      },
      context: { dryRun: false, guard: { accepted: true } }
    }
  });
}
```

## Avoid

- Do not hide local shell, browser automation, MCP, network, filesystem, or OS automation fallback inside this baseTool.
- Do not call `omniBase` automatically after checkbox confirmation.
- Do not decide whether browser-use, shell, MCP, pointer action, or structured app control is a better strategy here.
- Do not press a key when `currentState` is known to already match `expectedState`.
- Do not expose provider stack traces, private paths, raw focus state, or raw system errors.
