---
description: Request a runtime-owned MCP manager to remove a subscription handle.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"subscriptionId\":\"sub-1\"}}"
---

# mcp.unsubscribe

## Use This Tool

Use `mcp.unsubscribe` when the agent needs runtime to cancel an MCP subscription handle.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "subscriptionId": "sub-1",
    "reason": "caller stopped watching"
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Required Inputs

- `target.serverId`: configured MCP server id.
- `target.subscriptionId`: runtime subscription handle returned by `mcp.subscribe`.

## Optional Inputs

- `target.reason`: short public-safe cancellation reason.
- `context.allowedServerIds`, `requestedScopes`, `allowedScopes`, and `grantedPermissions`: runtime governance material.

## Runtime Behavior

Dry-run returns a planned unsubscribe envelope and never calls the provider. Real dispatch requires `dryRun:false` plus an accepted guard, then calls `BaseToolExecutorPort.mcp.unsubscribe`.

The runtime owns listener removal, subscription handle lookup, notification buffer cleanup, reconnect semantics, and any server-specific unsubscribe call.

## Returns

The result includes `unsubscribeEnvelope`, `providerCalled`, `executionBlocked`, `permissionsRequired`, accepted scopes, and runtime provider metadata when available.

## Example

```json
{
  "target": {
    "serverId": "fs-mcp",
    "subscriptionId": "sub-1"
  }
}
```

## Avoid

- Do not clean up hidden listeners or transport state in baseTool.
- Do not leak raw runtime unsubscribe errors.
- Do not dispatch live unsubscribe without runtime approval.
