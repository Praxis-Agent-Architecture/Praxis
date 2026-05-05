---
description: Request a runtime-owned MCP manager to create a resource, event, or tool subscription.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"subjectType\":\"resource\",\"subject\":\"file:///workspace/README.md\"}}"
---

# mcp.subscribe

## Use This Tool

Use `mcp.subscribe` when the agent needs runtime to create a subscription against an already configured MCP server.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "connectionId": "fs-mcp:connection",
    "subjectType": "resource",
    "subject": "file:///workspace/README.md",
    "eventKinds": ["changed"],
    "replayPolicy": "latest"
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Required Inputs

- `target.serverId`: configured MCP server id.
- `target.subjectType`: `resource`, `event`, or `tool`.
- `target.subject`: resource URI, event topic, or tool name.

## Optional Inputs

- `target.connectionId`: runtime connection handle hint.
- `target.eventKinds`: notification kinds to request.
- `target.replayPolicy`: `none` or `latest`.
- `context.allowedServerIds`, `requestedScopes`, `allowedScopes`, and `grantedPermissions`: runtime governance material.

## Runtime Behavior

Dry-run returns a planned subscription envelope and never calls the provider. Real dispatch requires `dryRun:false` plus an accepted guard, then calls `BaseToolExecutorPort.mcp.subscribe`.

The runtime owns the MCP client, subscription id, notification listener, reconnect behavior, delivery buffers, cancellation, and cleanup.

## Returns

The result includes `subscriptionEnvelope`, `providerCalled`, `executionBlocked`, `permissionsRequired`, accepted scopes, and runtime provider metadata when available.

## Example

```json
{
  "target": {
    "serverId": "fs-mcp",
    "subjectType": "resource",
    "subject": "file:///workspace/README.md"
  }
}
```

## Avoid

- Do not create an MCP client, listener, timer, or event buffer in baseTool.
- Do not use this as a generic stream or native execute tool.
- Do not dispatch live subscriptions without runtime approval.
