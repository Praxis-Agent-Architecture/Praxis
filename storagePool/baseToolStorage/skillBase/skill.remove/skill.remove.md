---
description: Disable, unlink, or purge a local skill package through runtime-owned filesystem operations.
argument-hint: "{ target: { skillId, registryRoot, mode }, context? }"
---

# skill.remove

## Use This Tool
Remove a skill by disabling it, unlinking its root, or purging its directory.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("skill.remove").handler.invoke(...)`.

## Required Inputs
- `target.skillId`: safe skill identifier.
- `target.registryRoot`: allowed skill root.

## Optional Inputs
- `target.mode`: `disable`, `unlink`, or `purge`.
- `target.reason`, `context.guard`, `context.grantedPermissions`.

## Runtime Behavior
Dry-run returns a removal plan. Real execution requires guard and uses `filesystem.writeText` or `filesystem.deletePath`.

## Returns
The planned path, skill root, mode, and deletion result when executed.

## Example
Disable a skill by writing a runtime-owned state record instead of deleting the directory.

## Avoid
Do not delete without `dryRun:false` plus guard. Do not treat plugin uninstall as part of this tool.
