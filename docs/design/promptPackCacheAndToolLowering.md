# PromptPack Cache And Tool Lowering

## Decision

Praxis PromptPack v1 uses one fixed semantic order:

```text
stableSystemCore
declaredRuntimeContext
toolDeclarations
projectContext
sessionSummary
recentConversation
memoryContext
retrievedContext
observations
userTurn
assistantScratchpadPlan
```

Provider adapters must not reorder these sections. Lowering may map the sections into provider-supported instructions, messages, tools, cache blocks, or text envelopes, but the Praxis semantic order remains the source of truth.

## Section Semantics

- `stableSystemCore`: Praxis fixed system constraints, agent identity, behavior rules, and core context that provider adapters must not rewrite.
- `declaredRuntimeContext`: AgentManifest, HarnessSpec, runtime mode, permissions, sandbox, and governance declarations.
- `toolDeclarations`: ToolSpec, baseTool, TAP package, official tools, custom tools, and tool policy visible to the model.
- `projectContext`: project structure, repository summaries, file indexes, dependency maps, and development environment context.
- `sessionSummary`: current-session compression, phase decisions, and unfinished work. It replaces older raw history after compact; stable system/runtime/project facts are rebuilt from canonical sources instead of summarized here.
- `recentConversation`: the small raw attention window that survives after summary. It carries the latest user/assistant/runtime messages needed for local continuity, not the full transcript.
- `memoryContext`: application/runtime injected memory references or current-session summaries only; it is not a background memory index. MP-retrieved memory truth belongs in `retrievedContext`.
- `retrievedContext`: RAG, MP, search, and file-read results fetched for this turn.
- `observations`: tool results, runtime events, errors, stdout/stderr, previous assistant visible output, and action traces. Each record must keep source and authority metadata.
- `userTurn`: the current user request. It is high priority but cannot override safety or runtime declarations.
- `assistantScratchpadPlan`: internal tree-shaped decision plan. It is not provider-visible by default.

## Cache Plan

`PromptPackCachePlan` uses a PromptPack section as the smallest v1 cache unit. It does not split by TAP package, file, memory item, or individual material.

Cache priority is:

```text
context-quality -> cost -> latency
```

Stable and semi-stable sections may be provider-cache candidates. Dynamic sections such as recent conversation, retrieved context, observations, user turn, and assistant scratchpad are not stable provider cache prefixes.

## Turn-Boundary Compact

PromptPack compact is a boundary action, not an in-action interruption. Praxis lets the current model/tool action finish, assembles the next PromptPack estimate at the turn or tool-loop boundary, and triggers compact only when that estimate reaches the configured threshold. The default threshold is `0.95`.

The compact executor rewrites old raw conversation into `sessionSummary`, rewrites the surviving attention set into `recentConversation`, and then the next turn resumes from:

```text
stable rebuilt facts + sessionSummary + recentConversation + current dynamic context
```

It must not build `old raw history + summary`; that doubles stale context and wastes budget.

## Tool And Commercial Boundary

All official TAP packages, user custom packages, and enterprise private packages enter the same ToolSpec/`toolDeclarations` lane. The model sees tool ability and invocation constraints.

Commercial packaging, license state, sale unit, enterprise entitlement, and plugin marketplace controls belong to runtime/package governance and must not be injected into PromptPack.

## Lowering Policy

`runtime.modelAdapter.promptLoweringRuntime` returns provider-neutral lowered envelopes. It does not create final OpenAI, Claude, Gemini, or other provider payloads.

Lowering failures are classified as:

- `fail closed`: safety, permission, and tool semantics cannot be preserved.
- `best effort`: cache, formatting, and provider feature gaps.

`assistantScratchpadPlan` stays hidden unless the request explicitly asks for `json-tool-plan` fallback. In that fallback mode, the internal tree can become a visible JSON tool plan candidate.
