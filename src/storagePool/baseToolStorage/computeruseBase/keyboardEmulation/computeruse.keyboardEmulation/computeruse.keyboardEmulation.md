---
description: Emit a governed generic keyboard action sequence through the runtime-owned computer-use keyboard port.
argument-hint: "{ purpose, actions: [{ kind: 'key-press'|'text'|'shortcut', ... }], context? }"
---

# computeruse.keyboardEmulation

## Use This Tool

Use `computeruse.keyboardEmulation` when the model needs a primitive keyboard sequence against the current governed focus target: single key presses, bounded text entry, or keyboard shortcuts.

This baseTool is only the capability carrier. TAP/agent decides whether a workflow should use this primitive, a more specific keyboard tool, shell, MCP, browser-specific control, or omni analysis.

## Call Shape

Invoke through `BaseToolHandler.invoke` or the registry handler for `computeruse.keyboardEmulation`.

```json
{
  "purpose": "focus the command palette and type a command",
  "target": {
    "targetHint": "focused editor window",
    "actions": [
      { "kind": "shortcut", "keys": ["Control", "Shift", "P"] },
      { "kind": "text", "text": "Format Document" },
      { "kind": "key-press", "key": "Enter", "repeat": 1 }
    ]
  },
  "context": {
    "runtimeId": "runtime-1",
    "dryRun": true
  }
}
```

Top-level `actions` and `targetHint` are accepted for compatibility, but the canonical shape is `target.actions` and `target.targetHint`.

## Required Inputs

- `purpose`: public-safe reason for the keyboard sequence.
- `target.actions` or `actions`: one to sixty-four keyboard actions.
- `context.runtimeId`: injected by the handler from `BaseToolInvokeRequest.runtimeId` when absent.

## Optional Inputs

- `target.targetHint` or `targetHint`: public-safe focus hint. Runtime owns the real focus boundary.
- `context.dryRun`: defaults to preview mode.
- `context.guard`: required with `accepted: true` or `allowed: true` for `dryRun:false`.
- `context.contract` and `context.governance`: runtime-supplied rejection evidence. Explicit `accepted:false` or `allowed:false` blocks execution before any provider call.
- `context.requestedScopes` and `context.allowedScopes`: scope evidence.
- `metadata`: public-safe audit metadata.

## Runtime Behavior

Dry-run validates JSON and returns a metadata-only action envelope. It never calls the provider.

Contract and governance denials are checked before real execution. Real execution then requires `dryRun:false` plus an affirmative guard. The storage implementation expands `key-press.repeat` into individual single-key dispatches, then sends each normalized runtime action to `BaseToolExecutorPort.computeruse.keyboardAction` through `dependencies.ts`.

Runtime owns focus resolution, OS automation backend, keyboard event emission, permission prompts, cancellation, and cleanup. TAP/agent owns that composition and any fallback choice.

## Returns

Success returns:

- `kind: "agentCore.basicTool.computeruse.keyboardEmulation"`
- normalized action summaries, with text represented as character and byte counts
- `runtimeEntry.port: "BaseToolExecutorPort.computeruse.keyboardAction"`
- dry-run or runtime dispatch metadata
- runtime action ids for real execution; repeated key presses produce one action id per emitted press

Errors are public-safe and include `INVALID_REQUEST`, `INVALID_CONTEXT`, `INVALID_TARGET`, `INVALID_TARGET_HINT`, `MISSING_PURPOSE`, `MISSING_RUNTIME_ID`, `MISSING_ACTIONS`, `INVALID_ACTIONS`, `INVALID_ACTION`, `TOO_MANY_ACTIONS`, `SCOPE_DENIED`, `CONTRACT_REJECTED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("computeruse.keyboardEmulation");
if (lookup.ok) {
  const result = await lookup.handler.invoke({
    toolCallId: "keyboard-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    executor,
    input: {
      purpose: "submit the active form with a shortcut",
      actions: [
        { kind: "shortcut", keys: ["Control", "Enter"] }
      ],
      context: { dryRun: false, guard: { accepted: true } }
    }
  });
}
```

## Avoid

- Do not hide local shell, browser automation, MCP, network, filesystem, or OS automation fallback inside this baseTool.
- Do not call `omniBase` automatically after a keyboard action.
- Do not decide whether browser-use, shell, MCP, or structured app control is a better strategy here.
- Do not expose provider stack traces, private paths, raw focus state, or unredacted text material in public errors.
- Do not use this tool for long-running keyboard sessions; runtime/TAP must own session handles.
