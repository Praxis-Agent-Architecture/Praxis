---
description: Search local skill roots through runtime-owned ripgrep support.
argument-hint: "{ target: { query, registryRoot, skillId? }, context? }"
---

# skill.ripgrep

## Use This Tool
Search `SKILL.md`, `references/`, `scripts/`, `assets/`, and examples inside skill roots.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("skill.ripgrep").handler.invoke(...)`.

## Required Inputs
- `target.query`: text or regex query.
- `target.registryRoot`: allowed skill registry root.

## Optional Inputs
- `target.skillId`, `fileGlob`, `maxResults`, `literal`, `caseSensitive`, `includeHidden`, `multiline`, `contextLines`.

## Runtime Behavior
Storage owns query, path, result, and truncation semantics. Runtime only supplies `BaseToolExecutorPort.search.ripgrep`.

## Returns
Command preview, search root, matches, exit code, stderr, and audit metadata.

## Example
Search all local skills for `allowed-tools` without using shell.

## Avoid
Do not shell out to `rg` directly or search outside allowed skill roots.
