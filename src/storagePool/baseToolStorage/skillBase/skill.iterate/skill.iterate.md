---
description: Iterate an existing skill package through patch-style runtime filesystem writes.
argument-hint: "{ target: { skillPath, changeIntent, operations }, context? }"
---

# skill.iterate

## Use This Tool
Modify an existing skill by replacing, appending, prepending, or replacing text in safe relative files.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("skill.iterate").handler.invoke(...)`.

## Required Inputs
- `target.skillPath`: existing skill root.
- `target.changeIntent`: reason for the iteration.
- `target.operations`: bounded file operations.

## Optional Inputs
- Operation `content`, `search`, and `replace`.
- `context.allowedRoots`, `context.grantedPermissions`, `context.guard`.

## Runtime Behavior
Storage owns operation semantics. Runtime only supplies `filesystem.readText` and `filesystem.writeText`.

## Returns
A patch envelope with affected files, applied files when real execution runs, and audit metadata.

## Example
Append a new rule to `SKILL.md` after previewing the dry-run envelope.

## Avoid
Do not infer edit semantics in runtime, mutate without guard, or allow traversal in relative paths.
