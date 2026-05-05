---
description: Run a governed mouse operation sequence through runtime-owned cursor and pointer support.
argument-hint: '{"steps":[{"kind":"locate"},{"kind":"move","target":{"x":320,"y":240}},{"kind":"click"}],"purpose":"activate selected control"}'
---

# computeruse.mouseEmulation

## Use This Tool

Use `computeruse.mouseEmulation` when the model needs one governed sequence of primitive mouse operations: locate the cursor, move it, and click. It is the generic mouse-sequence primitive in `computeruseBase/mouseEmulation`; prefer narrower tools such as `computeruse.mouseClick`, `computeruse.mouseMove`, or `computeruse.cursorLocate` when only one action is needed.

## Call Shape

```ts
await handler.invoke({
  toolCallId: "tool-call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  executor,
  input: {
    purpose: "activate selected control",
    steps: [
      { kind: "locate", coordinateSpace: "screen" },
      { kind: "move", target: { x: 320, y: 240 }, coordinateSpace: "screen" },
      { kind: "click", button: "left", clickCount: 1 },
    ],
    context: {
      dryRun: true,
      requestedScopes: ["tool:computeruse:pointer"],
      allowedScopes: ["tool:computeruse:pointer"],
    },
  },
});
```

For real execution, the same call must use `context.dryRun: false`, an affirmative `context.guard`, and an executor that exposes both `BaseToolExecutorPort.computeruse.locateCursor` and `BaseToolExecutorPort.computeruse.pointerAction`.

## Required Inputs

- `purpose`: human-readable reason for the mouse sequence.
- `steps`: non-empty array of sequence steps.
- `context.runtimeId`: required for audit and runtime inspection. The handler injects it from `BaseToolInvokeRequest.runtimeId` when omitted from `input.context`.

Supported steps:

- `{ kind: "locate", coordinateSpace?, displayId? }`
- `{ kind: "move", target: { x, y }, coordinateSpace?, displayId?, windowId?, durationMs? }`
- `{ kind: "click", button?, clickCount?, at?, coordinateSpace?, displayId?, windowId? }`

## Optional Inputs

- `maxSteps`: maximum allowed step count. Defaults to `16`.
- `context.dryRun`: defaults to dry-run when omitted.
- `context.guard`: required for `dryRun:false`; accepts `accepted: true` or `allowed: true`.
- `context.contract` and `context.governance`: may reject the request before provider dispatch.
- `context.requestedScopes` and `context.allowedScopes`: optional scope intersection check.
- `metadata`: public-safe metadata merged into audit output.
- `preferredProvider`: one of `anthropic`, `openai`, `deepmind`, or `praxis-native`.

## Runtime Behavior

Storage owns the mouse-sequence contract, JSON validation, step limit, scope checks, dry-run envelope, guard checks, public-safe errors, and normalized result shape. Runtime owns real cursor reads and pointer events through:

- `BaseToolExecutorPort.computeruse.locateCursor`
- `BaseToolExecutorPort.computeruse.pointerAction`

When `context.dryRun !== false`, no provider is called. When `context.dryRun === false`, the tool rejects the request unless an affirmative guard exists. If the runtime executor is missing, the tool returns `PROVIDER_UNAVAILABLE`; it does not fall back to shell, browser automation, MCP, or hidden OS automation.

TAP/agent owns strategy: whether to use computer use, whether to prefer browser/MCP/provider-native control, and whether to route any observation to another tool family.

## Returns

Success returns a `BaseToolInvokeResult` output with:

- `kind: "agentCore.basicTool.computeruse.mouseEmulation"`
- `operation: "simulate-mouse-operations"`
- normalized `steps`
- `dispatch: "dry-run" | "runtime-computeruse"`
- `runtimeEntry.ports` naming `BaseToolExecutorPort.computeruse.locateCursor` and `BaseToolExecutorPort.computeruse.pointerAction`
- `sequenceEnvelope.stepResults` with one result per step

Errors are public-safe and include stable codes such as `MISSING_STEPS`, `INVALID_STEP`, `INVALID_TARGET`, `MISSING_RUNTIME_ID`, `MISSING_PURPOSE`, `SCOPE_DENIED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_FAILURE`.

## Example

```json
{
  "purpose": "move to the visible submit button and click it",
  "steps": [
    { "kind": "move", "target": { "x": 640, "y": 520 }, "coordinateSpace": "screen", "durationMs": 80 },
    { "kind": "click", "button": "left", "clickCount": 1 }
  ],
  "context": {
    "runtimeId": "runtime-1",
    "dryRun": false,
    "guard": { "accepted": true },
    "requestedScopes": ["tool:computeruse:pointer"],
    "allowedScopes": ["tool:computeruse:pointer"]
  }
}
```

## Avoid

- Do not use this tool as a browser automation strategy selector.
- Do not auto-route screenshots, cursor positions, or UI state to `omniBase`; upper layers decide that.
- Do not import OS automation packages, browser drivers, MCP clients, or provider SDK clients into this baseTool.
- Do not execute real pointer events without `dryRun:false` plus an affirmative runtime guard.
- Do not silently fall back to shell, browser-use, MCP, filesystem, or network capabilities when runtime pointer support is absent.
