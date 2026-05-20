---
description: Governed long-lived service/process launch with runtime-owned health verification.
argument-hint: "{ target: { command, verification | probe }, context: { runtimeId, dryRun, guard } }"
---

# shell.serviceStartAndVerify

## Use This Tool

Use `shell.serviceStartAndVerify` when a long-lived service, process, daemon, dev server, local worker, or GUI helper must be launched and verified before the agent reports it as usable. This is generic lifecycle capability, not a Web-only tool.

## Call Shape

```ts
await executeShellServiceStartAndVerify({
  target: {
    command: "npm run dev",
    verification: { kind: "http", url: "http://127.0.0.1:3000/" }
  },
  context: { runtimeId: "runtime-1", invocationId: "tool-call-1", dryRun: true, approval: { accepted: true } }
});
```

## Required Inputs

- `target.command`: service launch command.
- `target.verification` or `target.probe`: verification contract. Supported kinds/types are `process`, `tcp`, `http`, `log`, and `command`.
- `context.runtimeId`: required for real execution audit.

## Optional Inputs

- `target.serviceId`: runtime-owned stable service handle.
- `target.launchMode`: `background` by default; use `detached` for services that should outlive the agent session.
- `target.workingDirectory`, `target.shell`, `target.restartPolicy`, `target.outputBufferLimitBytes`, `target.captureOutput`.
- Probe fields such as `expectedStatus`, `expectedText`, `pattern`, `port`, `timeoutMs`, `intervalMs`, and `maxAttempts`.
- `context.dryRun`: anything except `false` returns the dry-run plan.
- `context.guard.allowed` or `context.guard.accepted`: required when `dryRun: false`.
- `context.approval.accepted`: required because service launches may be long-lived.
- `preferredProvider`: selects Anthropic, OpenAI, DeepMind, or Praxis-native practice order.

## Runtime Behavior

Dry-run never calls a provider. Real execution requires an affirmative runtime guard and an injected or host runtime provider. Runtime/TAP owns approval, sandbox, process lifecycle, service handles, process/tcp/http/log/command probes, verification attempts, cleanup, registry writes, and output artifacts; this baseTool only validates JSON input, shapes a normalized provider request, dispatches to the runtime provider, and accepts only explicit non-planned plain JSON runtime envelopes.

## Returns

Returns a public-safe `ShellToolResult` with `output`, `audit`, and `events` on success, or a classified error such as `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, or `PROVIDER_REJECTED`. Successful envelopes include `status`, `health`, `statusSnapshot`, stdout/stderr artifact refs, and registry refs so UI/runtime can distinguish `spawned`, `alive`, `healthy`, `unverified`, `exited`, and `failed`.

## Example

```ts
const result = await executeShellServiceStartAndVerify({
  target: {
    command: "npm run dev",
    serviceId: "dev-server",
    verification: { kind: "http", url: "http://127.0.0.1:3000/", expectedStatus: 200 }
  },
  context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true }, approval: { accepted: true } },
  provider: async () => ({
    resultEnvelope: {
      serviceHandle: "dev-server",
      status: "healthy",
      health: { verified: true, healthy: true, status: "healthy" },
      statusSnapshot: { status: "healthy", alive: true }
    }
  })
});
```

## Avoid

- Do not report a service/process/daemon as usable from `shell.backgroundExecution`, `shell.detachedExecution`, or process spawn alone.
- Do not treat `spawned` or `alive` as `healthy`; only a passing probe makes the service healthy.
- Do not perform hidden local shell/process work inside the baseTool.
- Do not treat `dryRun: false` as approval.
- Do not leak internal provider errors without mapping them to public-safe error codes.
- Do not return Node child process objects or raw process handles; return only runtime-owned envelopes or stable handle IDs.
