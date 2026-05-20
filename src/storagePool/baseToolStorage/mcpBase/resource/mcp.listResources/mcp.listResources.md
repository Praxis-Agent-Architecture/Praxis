---
description: List MCP resources from a runtime-owned MCP server.
argument-hint: "{ target: { serverId, uriPrefix?, cursor?, limit? }, context? }"
---

# mcp.listResources

## Use This Tool
Discover resource URIs exposed by a mounted MCP server.

## Call Shape
Call through `BaseToolHandler.invoke()` with `target.serverId` and optional `uriPrefix`, `cursor`, and `limit`.

## Required Inputs
- `target.serverId`

## Optional Inputs
- `target.uriPrefix`
- `target.cursor`
- `target.limit`

## Runtime Behavior
Dry-run returns an empty resource envelope. Real dispatch requires `dryRun:false` plus an accepted guard, then calls `BaseToolExecutorPort.mcp.listResources`.

## Returns
`resourceEnvelope.resources`, optional `nextCursor`, `exhausted`, and provider metadata.

## Example
`{ "target": { "serverId": "fs-mcp", "uriPrefix": "file:///workspace/" }, "context": { "dryRun": false, "guard": { "accepted": true } } }`

## Avoid
Do not infer resource contents or create an MCP client in this baseTool.
