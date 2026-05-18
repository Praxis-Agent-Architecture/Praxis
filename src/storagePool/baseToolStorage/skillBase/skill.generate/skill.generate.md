---
description: Generate a local skill package through runtime-owned filesystem writes.
argument-hint: "{ target: { skillName, purpose, destinationRoot, files? }, context? }"
---

# skill.generate

## Use This Tool
Create a `SKILL.md` package and optional `scripts/`, `references/`, `assets/`, `examples/`, or metadata files.

## Call Shape
Call `createBaseToolRegistry().lookupHandler("skill.generate").handler.invoke(...)` with a `BaseToolInvokeRequest`.

## Required Inputs
- `target.skillName`: safe lowercase skill directory name.
- `target.purpose`: why this skill exists.
- `target.destinationRoot`: allowed skill root.

## Optional Inputs
- `target.description`, `target.tags`, `target.files`.
- `context.allowedRoots`, `context.grantedPermissions`, `context.guard`.

## Runtime Behavior
Dry-run returns a write plan. Real execution requires `dryRun:false`, an affirmative guard, and runtime `filesystem.writeText`.

## Returns
An envelope with target files, skill directory, runtime entry, permission requirements, audit, and write status.

## Example
Generate `repo-auditor/SKILL.md` under `/workspace/.agents/skills` with `filesystem.writeText`.

## Avoid
Do not shell out, install plugins, bypass guard approval, or write outside allowed skill roots.
