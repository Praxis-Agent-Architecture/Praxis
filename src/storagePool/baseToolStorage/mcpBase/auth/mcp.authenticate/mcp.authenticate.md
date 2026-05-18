---
description: Request runtime-owned MCP authentication using a credential reference.
argument-hint: '{"target":{"serverId":"fs-mcp","authStrategy":"oauth","credentialRef":"secret://mcp/fs/oauth","requestedScopes":["resources:read"]},"context":{"dryRun":false}}'
---

# mcp.authenticate

## Use This Tool

Use `mcp.authenticate` when an MCP server needs an authentication or token refresh request through the runtime-owned MCP client.

## Call Shape

Call through `BaseToolHandler.invoke()` with:

```json
{
  "target": {
    "serverId": "fs-mcp",
    "authStrategy": "oauth",
    "credentialRef": "secret://mcp/fs/oauth",
    "requestedScopes": ["resources:read"]
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.authStrategy`: `oauth`, `api-key`, `bearer-token`, or `custom`.
- `target.credentialRef`: reference to runtime-managed credential material. Raw secrets are not accepted.

## Optional Inputs

- `target.requestedScopes`: scopes requested from the runtime MCP auth manager.
- `context.allowedServerIds`, `context.allowedScopes`, `context.grantedPermissions`: scope and permission guard material.

## Runtime Behavior

Dry-run returns a planned auth envelope and never calls the provider. Real dispatch requires `context.dryRun === false`, an accepted guard, and a runtime provider backed by `BaseToolExecutorPort.mcp.authenticate`.

## Returns

Returns a normalized auth envelope with planned/authenticated state, `tokenIssued`, `credentialMaterialAccepted: false`, and provider metadata when runtime was called.

## Example

```json
{
  "target": {
    "serverId": "fs-mcp",
    "authStrategy": "oauth",
    "credentialRef": "secret://mcp/fs/oauth"
  }
}
```

## Avoid

- Do not pass raw API keys or bearer tokens.
- Do not create an MCP client or OAuth flow in the baseTool.
- Do not use this as a generic authorization or policy decision tool; use `mcp.authorize`.
