---
description: Governed shell process termination baseTool implementation.
argument-hint: "{ target: {...}, context: { runtimeId, dryRun, guard } }"
---

# shell.processTermination

## Use This Tool

Use `shell.processTermination` when the runtime needs a stable shell process-control primitive. The baseTool defines the JSON shape, dry-run envelope, public-safe errors, audit events, and provider dispatch boundary.

## Call Shape

```ts
await executeShellProcessTermination({
  target: { command: "printf ok" },
  context: { runtimeId: "runtime-1", invocationId: "tool-call-1", dryRun: true }
});
```

## Required Inputs

- `target`: tool-specific process target.
- `context.runtimeId`: required for real execution audit.

## Optional Inputs

- `context.dryRun`: anything except `false` returns the dry-run plan.
- `context.guard.allowed` or `context.guard.accepted`: required when `dryRun: false`.
- `preferredProvider`: selects Anthropic, OpenAI, DeepMind, or Praxis-native practice order.

## Runtime Behavior

Dry-run never calls a provider. Real execution requires an affirmative runtime guard and an injected or host runtime provider. Runtime/TAP owns approval, sandbox, sudo policy, session ownership, process lifecycle, background/detached handles, termination decisions, and output streams; this baseTool only validates JSON input, shapes a normalized provider request, dispatches to the runtime provider, and accepts only explicit non-planned plain JSON runtime envelopes.

## Returns

Returns a public-safe `ShellToolResult` with `output`, `audit`, and `events` on success, or a classified error such as `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, or `PROVIDER_REJECTED`.

## Example

```ts
const result = await executeShellProcessTermination({
  target: { command: "pwd" },
  context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
  provider: async () => ({ resultEnvelope: { pid: 1234 } })
});
```

## Avoid

- Do not perform hidden local shell/process work inside the baseTool.
- Do not treat `dryRun: false` as approval.
- Do not leak internal provider errors without mapping them to public-safe error codes.
- Do not return Node child process objects or raw process handles; return only runtime-owned envelopes or stable handle IDs.
