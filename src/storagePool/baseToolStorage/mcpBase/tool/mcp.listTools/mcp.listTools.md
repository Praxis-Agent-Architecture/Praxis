---
description: List MCP tools from a runtime-owned MCP server.
argument-hint: "{ target: { serverId, namespace?, includeDisabled? }, context? }"
---

# mcp.listTools

## Use This Tool
Discover tool definitions exposed by a mounted MCP server.

## Call Shape
Call through `BaseToolHandler.invoke()` with `target.serverId` and optional `namespace`, `includeDisabled`, `cursor`, and `limit`.

## Required Inputs
- `target.serverId`

## Optional Inputs
- `target.namespace`
- `target.includeDisabled`
- `target.cursor`
- `target.limit`

## Runtime Behavior
Dry-run returns an empty preview and never calls runtime. Real dispatch requires `dryRun:false` plus an accepted guard, then calls `BaseToolExecutorPort.mcp.listTools`.

## Returns
Normalized tool definitions in `toolsPreview`, optional `nextCursor`, and provider metadata.

## Example
`{ "target": { "serverId": "fs-mcp" }, "context": { "dryRun": false, "guard": { "accepted": true } } }`

## Avoid
Do not create MCP clients, sessions, transports, or OAuth flows inside this baseTool.
