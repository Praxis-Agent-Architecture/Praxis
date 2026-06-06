# SkillPlane Harness Component Draft

## Decision

Praxis should add a standalone `skillPlane` harness/runtime component for skills that are not bound to MCP servers or tool entries.

The first goal is not to create another tool family. The goal is to let an agent carry a compact, governed, searchable skill index in PromptPack, then load full skill bodies only when the current task needs them.

Plain-language version: many useful skills are work habits, domain experience, failure corrections, and operating procedures. They do not deserve a tool schema yet. They still deserve a first-class place in the harness.

## Why This Exists

MCP+ already proves a useful pattern:

```text
compact skill index
  -> read full skill note only when relevant
  -> write/update skill after a reusable workflow
  -> later promote stable workflows into tighter runtime capabilities
```

That pattern should not stay trapped inside MCP. MCP+ needs wrapper control tools because ordinary MCP hosts only see MCP tool declarations. Praxis owns PromptPack, runtime state, storage, and harness modules, so it can model the skill layer directly.

The standalone skill component covers cases where:

- the skill is a working method or experience summary;
- there is no corresponding tool entry;
- creating a tool would be premature or too rigid;
- the skill is cross-tool, cross-MCP, or entirely non-tool;
- the model should know that a workflow exists without paying for the full body every turn.

## PromptPack Placement

Praxis PromptPack currently uses:

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

`skillPlane` should introduce a new provider-visible segment after `toolDeclarations`:

```text
stableSystemCore
declaredRuntimeContext
toolDeclarations
skillIndex
projectContext
sessionSummary
recentConversation
memoryContext
retrievedContext
observations
userTurn
assistantScratchpadPlan
```

Reasoning:

- `toolDeclarations` tells the model what it can call.
- `skillIndex` tells the model what it can know how to do.
- `projectContext` and later sections remain task/project/session material.

This keeps skill guidance near capability selection without pretending every skill is a callable capability.

`skillIndex` should be cacheable-prefix by default when it contains developer-declared or accepted project skills. This segment should contain only compact heads and index cards, not full skill bodies.

This placement is intentional even though it sits in the prefix-cached area. The model only receives a stable index there. To use a skill deeply, the runtime or model still has to load the body through later calls or retrieval. Those results naturally land in later unstable segments such as `retrievedContext`, `observations`, or tool result material.

V1 should not add a separate `skillBody` segment. Full bodies should enter later dynamic context after selection. Session-local pending skills can either enter `sessionSummary`/`observations` first or become stable `skillIndex` material only after an explicit checkpoint.

## Data Model

### Skill Head

`SkillHead` is the stable, compact index card.

```ts
type SkillHead = {
  skillId: string;
  title: string;
  summary: string;
  scope?: "agent" | "project" | "workspace" | "user" | "session";
  whenToUse?: string;
  why?: string;
  keywords?: readonly string[];
  pitfallsPreview?: readonly string[];
  bodyRef?: string;
  promotedFrom?: readonly string[];
  promotionState?: "experience" | "skill" | "candidate-mcp-plus" | "mcp-plus" | "tool";
};
```

### Skill Body

`SkillBody` is loaded on demand.

```ts
type SkillBody = {
  skillId: string;
  title: string;
  summary: string;
  whenToUse?: string;
  prerequisites?: readonly string[];
  do?: readonly string[];
  avoid?: readonly string[];
  pitfalls?: readonly string[];
  verification?: readonly string[];
  examples?: readonly string[];
  promotionSignals?: readonly string[];
  updatedAt: string;
};
```

The head is for selection. The body is for execution guidance.

## Harness Surface

Developer-facing v1 can be small:

```ts
praxis.skill.module({
  sources: [
    praxis.skill.directory(".praxis/skills"),
    praxis.skill.package("@org/agent-skills"),
  ],
  indexPolicy: {
    maxHeads: 40,
    includeScopes: ["agent", "project", "workspace"],
  },
  bodyLoadPolicy: {
    mode: "on-demand",
    maxBodiesPerTurn: 3,
  },
  lifecycle: {
    allowWrite: true,
    checkpointWrites: true,
    promotion: "suggest",
  },
});
```

In `HarnessSpec`, this should enter through `modules.skill`, parallel to `modules.mcp`, not through `tools`.

## Confirmed V1 Defaults

- Runtime-persisted skills default to `.rax_workspace/skills`.
- Developer-declared skills can come from `.praxis/skills` or packages.
- Skill write proposals can come from both model-authored proposals and runtime-authored summaries.
- No proposed skill becomes stable `skillIndex` material until checkpoint/governance accepts it.
- Promotion advice initially targets `candidate-mcp-plus`.
- The data model may keep `candidate-tool` or `candidate-baseTool` as future states, but v1 must not auto-generate tools.

## Runtime Surface

The runtime-owned shape should be:

```text
runtime.skillPlane
  SkillSourceRegistry
  SkillIndexPlanner
  SkillStore
  SkillBodyLoader
  SkillLifecycleController
  SkillPromotionAdvisor
```

Responsibilities:

- discover declared and stored skill heads;
- render the `skillIndex` PromptPack segment;
- load selected full bodies into later dynamic context such as `retrievedContext` or `observations`;
- record skill usage and outcomes;
- accept or reject proposed skill writes through governance;
- identify promotion candidates from repeated successful workflows.

Non-responsibilities:

- executing tools;
- owning MCP transport;
- replacing MP/RAG;
- turning every workflow into a tool automatically;
- storing unreviewed model output as stable project truth without policy.

## Lifecycle

The intended ladder is:

```text
work observation
  -> experience summary
  -> skill
  -> candidate MCP+
  -> MCP+ or dedicated tool
```

### Observation To Experience

Runtime sees repeated or high-value work patterns from:

- successful multi-step tasks;
- failures that required correction;
- user-approved operating habits;
- repeated manual instructions;
- recurring project-specific procedures.

These remain observations until summarized.

### Experience To Skill

A summary becomes a skill when it has:

- a clear `whenToUse`;
- an actionable body;
- at least one pitfall or validation step;
- a stable enough scope;
- no unresolved safety or authority conflict.

### Skill To MCP+

A skill becomes a candidate for MCP+ when it shows:

- stable inputs;
- stable tool or server calls;
- repeatable output shape;
- measurable efficiency gain;
- low ambiguity after repeated use;
- clear failure handling.

This is the key upgrade path: prompt engineering helps the model notice that repeated guidance should become a higher-level callable capability.

## Relationship To Existing Surfaces

### MCP+

MCP+ keeps its role as the standard-MCP-compatible exposure layer. It may consume skill heads from `skillPlane`, but MCP+ no longer defines the general skill ontology.

For MCP+ servers, `skillPlane` can project relevant heads into the MCP+ block. For non-MCP skills, the same head format renders into the standalone `skillIndex` segment.

### `skill.load`

`skill.load` remains a baseTool for reading an explicit skill by name or path. It is not the lifecycle plane.

`skillPlane` may call or wrap `skill.load` internally later, but the public semantics should stay separate:

- `skill.load`: retrieve a named skill.
- `skillPlane`: govern skill discovery, indexing, loading, writing, and promotion.

### Memory Plane

Memory stores broad durable knowledge. `skillPlane` stores operational guidance. A memory can mention that a skill exists; a skill body should tell the model how to act.

### PromptPack

PromptPack owns placement and cache semantics. `skillPlane` supplies materials; it does not lower provider payloads directly.

## Implementation Phases

### Phase 1: Contract And Prompt Segment

- Add `skillIndex` to PromptPack segment kinds after `toolDeclarations`.
- Define `SkillHead`, `SkillBody`, `SkillStore`, and `SkillPlaneModuleSpec`.
- Add an in-memory store and a file-backed store.
- Add a renderer that creates a trusted `skillIndex` PromptPack material.
- Add inspection output showing mounted skill heads and body refs.

### Phase 2: Harness Module

- Add `praxis.skill.module(...)` authoring helpers.
- Compile `modules.skill` into `AgentManifest.harness.modules.skill`.
- Add runtime requirements such as `runtime.skill`.
- Provide a minimal fullstack example that mounts two standalone skills without MCP.

### Phase 3: Runtime Loading

- Load skill heads at session checkpoint.
- Render `skillIndex` before project context.
- Load selected skill bodies on demand into later dynamic context.
- Keep unselected skill bodies out of the prompt.

### Phase 4: Lifecycle And Promotion

- Add skill write proposal shape.
- Add governance for accepted project/user/session writes.
- Record usage counters and outcomes.
- Generate promotion advice when a skill looks like a better MCP+ or tool candidate.

## Acceptance Checks

- An agent with no tools can still expose a skill index.
- A skill head appears after `toolDeclarations` and before `projectContext`.
- Full skill bodies are absent until selected.
- `skill.load` still works independently.
- MCP+ server-bound skills can be projected through the same head/body model.
- Session-local skill writes do not become stable project truth without checkpoint/governance.
- Repeated successful skill use can produce a promotion suggestion without auto-creating a tool.

## Open Questions

1. Should runtime write proposals be model-authored, runtime-authored, or both?
2. What is the default stable store path: `.rax_workspace/skills`, `.praxis/skills`, or reuse the existing project memory area?
3. Should promotion advice initially target MCP+ only, or support both MCP+ and baseTool generation candidates?
