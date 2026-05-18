---
description: Summarize skills into budgeted model-visible metadata.
argument-hint: "{ target: { skillId, sourceExcerpts?, skillPath? }, context? }"
---

# skill.summarize

## Use This Tool
Create compact model-visible skill summaries before `skill.management` activates or loads the full skill.

## Call Shape
Call through `createBaseToolRegistry().lookupHandler("skill.summarize").handler.invoke(...)`.

## Required Inputs
- `target.skillId`: skill identifier.

## Optional Inputs
- `target.skillPath`, `sourceExcerpts`, `maxBullets`, `metadataBudgetCharacters`, `title`, `description`.

## Runtime Behavior
Pure extractive summary when excerpts are provided. With `dryRun:false` and `skillPath`, runtime may supply `filesystem.readText`.

## Returns
Model-visible line, summary, bullets, source count, truncation flag, and audit metadata.

## Example
Summarize a `SKILL.md` frontmatter and first sections into one metadata line plus bullets.

## Avoid
Do not load every reference eagerly. Use `skill.management activate/load` for full instruction content.
