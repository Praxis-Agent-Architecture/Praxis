---
description: Manage and activate local skills without plugin semantics.
argument-hint: "{ target: { action, registryRoot, skillId? }, context? }"
---

# skill.management

## Use This Tool
List, inspect, activate, load, enable, disable, install, link, or reload local skill packages.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("skill.management").handler.invoke(...)`.

## Required Inputs
- `target.action`: `list`, `inspect`, `activate`, `load`, `enable`, `disable`, `install`, `link`, or `reload`.
- `target.registryRoot`: local skill root.
- `target.skillId`: required except for `list` and `reload`.

## Optional Inputs
- `target.sourcePath`, `target.metadataPatch`.
- `context.allowedRoots`, `context.allowedSkillIds`, `context.guard`.

## Runtime Behavior
`activate/load` read full `SKILL.md` content and resource index. Write actions only write state records in v1 and require guard.

## Returns
A management envelope with affected skills, registry entries, skill content, and model instruction envelope when activated.

## Example
Use `action: "activate"` to return an `<activated_skill>` envelope for the selected `SKILL.md`.

## Avoid
Do not implement plugin marketplace behavior here. Do not load outside allowed roots or bypass runtime filesystem ports.
