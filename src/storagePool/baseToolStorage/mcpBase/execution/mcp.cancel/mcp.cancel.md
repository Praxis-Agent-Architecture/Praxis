---
description: Cancel a runtime-owned MCP tool execution through a governed BaseTool contract.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"executionId\":\"fs-mcp:execution:read_file\",\"reason\":\"user requested stop\",\"force\":false}}"
---

# mcp.cancel

## Use This Tool

Use `mcp.cancel` when a runtime-mounted MCP execution should be cancelled through a fixed BaseTool contract. The runtime owns the live execution id, cancellation handle, transport, and cleanup.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "executionId": "fs-mcp:execution:read_file",
    "reason": "user requested stop",
    "force": false
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "grantedPermissions": ["mcp:cancel"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.executionId`: runtime-owned execution id to cancel.

## Optional Inputs

- `target.reason`: public-safe reason string.
- `target.force`: boolean; when true it also requires `mcp:control`.
- `context.allowedServerIds`, `context.requestedScopes`, `context.allowedScopes`, and `context.grantedPermissions`: runtime governance facts.

## Runtime Behavior

Dry-run returns a planned cancel envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative runtime guard, and an injected `BaseToolExecutorPort.mcp.cancelExecution` provider. The baseTool never stores live handles or performs transport/session cleanup itself.

## Returns

Returns a normalized `cancelEnvelope` with `serverId`, `executionId`, `reason`, `force`, and planned or runtime cancellation state. Provider failures are mapped to public-safe `PROVIDER_REJECTED` errors.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.cancel");
await lookup.handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: { serverId: "fs-mcp", executionId: "fs-mcp:execution:read_file" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["mcp:cancel"] }
  },
  executor
});
```

## Avoid

- Do not create a hidden MCP client in this tool.
- Do not store live execution or cancellation handles in baseTool.
- Do not expose provider stack traces or private transport errors.
- Do not use `force:true` without `mcp:control`.
