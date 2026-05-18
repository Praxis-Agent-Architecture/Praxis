---
description: Read a resource through a runtime-owned MCP server.
argument-hint: "{ target: { serverId, resourceUri, acceptMimeTypes?, maxBytes? }, context? }"
---

# mcp.readResource

## Use This Tool
Read the contents of a known MCP resource URI.

## Call Shape
Call through `BaseToolHandler.invoke()` with `target.serverId` and `target.resourceUri`.

## Required Inputs
- `target.serverId`
- `target.resourceUri`

## Optional Inputs
- `target.acceptMimeTypes`
- `target.maxBytes`

## Runtime Behavior
Dry-run returns an empty resource envelope. Real dispatch requires `dryRun:false` plus an accepted guard, then calls `BaseToolExecutorPort.mcp.readResource`.

## Returns
`resourceEnvelope.contents`, truncation status, source marker, and optional provider metadata.

## Example
`{ "target": { "serverId": "fs-mcp", "resourceUri": "file:///workspace/README.md" }, "context": { "dryRun": false, "guard": { "accepted": true } } }`

## Avoid
Do not open files or fetch network resources directly from this baseTool.
