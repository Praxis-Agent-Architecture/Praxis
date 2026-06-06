# SkillPlane Harness Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Praxis `skillPlane` harness/runtime component that renders a stable prefix-cached `skillIndex` after `toolDeclarations`, loads full skill bodies only through later dynamic context, and leaves a governed `skill -> candidate MCP+` promotion path.

**Architecture:** Add `skillIndex` as a PromptPack segment, then add a new `runtime.skillPlane` module parallel to `runtime.mcpPlane`. `modules.skill` compiles into `AgentManifest.harness.modules.skill`; runtime plans skill heads into a trusted `skillIndex` PromptPack material and keeps bodies out of prefix cache until selected.

**Tech Stack:** TypeScript, Node.js `node:test`, existing Praxis `runtimeAgentManifest`, PromptPack, `PraxisRuntimeKernel`, JSON stores under `.rax_workspace/skills`.

---

## Scope Decisions

- `skillIndex` is a prefix-cached PromptPack segment directly after `toolDeclarations`.
- `skillIndex` contains only compact heads/index cards, never full skill bodies.
- Selected bodies enter later dynamic context such as `retrievedContext`, `observations`, or tool result material.
- Runtime-persisted skills default to `.rax_workspace/skills`.
- Developer-declared skills can come from `.praxis/skills`, packages, or inline declarations.
- Skill write proposals can come from both model-authored proposals and runtime-authored summaries.
- Stable index updates require checkpoint/governance acceptance.
- Promotion advice targets `candidate-mcp-plus`; v1 must not auto-generate MCP+ servers or tools.

## File Map

- Modify `src/executionEngine/promptPack/promptDefiner.ts`: add `skillIndex` segment.
- Modify `src/executionEngine/promptPack/promptAssembler.ts`: make `skillIndex` static/cacheable-prefix.
- Create `src/runtimeImplementation/runtime.skillPlane/index.ts`: contracts, stores, renderer, promotion advice.
- Modify `src/runtimeImplementation/runtimeAgentManifest.ts`: compile `modules.skill` and add `runtime.skill`.
- Modify `src/agentCore/index.ts`: public exports and `praxis.skill`.
- Modify `src/runtimeImplementation/praxisRuntimeKernel.ts`: discover heads and inject skill index material.
- Add tests under `test/agentCore/...`.
- Update docs under `docs/design/...`.

## Task 1: PromptPack Segment

**Files:**
- Modify: `src/executionEngine/promptPack/promptDefiner.ts`
- Modify: `src/executionEngine/promptPack/promptAssembler.ts`
- Modify: `test/agentCore/agent_executionEngine/promptPack/promptDefiner.test.ts`
- Modify: `test/agentCore/agent_executionEngine/promptPack/promptAssembler.test.ts`

- [ ] **Step 1: Add failing segment order assertions**

In `promptDefiner.test.ts`, assert:

```ts
assert.deepEqual(PROMPT_PACK_SEGMENT_KINDS.slice(0, 5), [
  "stableSystemCore",
  "declaredRuntimeContext",
  "toolDeclarations",
  "skillIndex",
  "projectContext",
]);
assert.equal(PROMPT_PACK_PROVIDER_VISIBLE_SEGMENT_KINDS.includes("skillIndex"), true);
```

- [ ] **Step 2: Add `skillIndex` to segment kinds**

In `promptDefiner.ts`, change `PROMPT_PACK_SEGMENT_KINDS` to include:

```ts
"toolDeclarations",
"skillIndex",
"projectContext",
```

- [ ] **Step 3: Add failing cache-prefix assertion**

In `promptAssembler.test.ts`, assert:

```ts
assert.deepEqual(result.promptPack.cachePlan.cacheablePrefixSegmentKinds.slice(0, 5), [
  "stableSystemCore",
  "declaredRuntimeContext",
  "toolDeclarations",
  "skillIndex",
  "projectContext",
]);
```

- [ ] **Step 4: Mark `skillIndex` as static**

In `promptAssembler.ts`, include `skillIndex` in `segmentStability` static cases:

```ts
kind === "toolDeclarations" ||
kind === "skillIndex" ||
kind === "projectContext"
```

- [ ] **Step 5: Verify**

Run:

```bash
node --import tsx --test \
  test/agentCore/agent_executionEngine/promptPack/promptDefiner.test.ts \
  test/agentCore/agent_executionEngine/promptPack/promptAssembler.test.ts
```

Expected: PASS.

## Task 2: Runtime SkillPlane Contracts

**Files:**
- Create: `src/runtimeImplementation/runtime.skillPlane/index.ts`
- Create: `test/agentCore/agent_runtimeImplementation/runtime.skillPlane/skillPlane.test.ts`

- [ ] **Step 1: Add tests for module helper, stores, renderer, and promotion advice**

Create tests that cover:

```ts
skill.module({ sources: [skill.inline([...])] }).kind === "praxis.skill.module";
createInMemorySkillPlaneStore().write(...);
createFileSkillPlaneStore(root).write(...);
renderSkillIndexMaterial(heads).promptSegmentKind === "skillIndex";
adviseSkillPromotion(...).target === "candidate-mcp-plus";
adviseSkillPromotion(...).autoGenerateTool === false;
```

- [ ] **Step 2: Implement core types**

Create `runtime.skillPlane/index.ts` with:

```ts
export type SkillPlaneScope = "agent" | "project" | "workspace" | "user" | "session";
export type SkillPlanePromotionState = "experience" | "skill" | "candidate-mcp-plus" | "mcp-plus" | "tool";

export type SkillHead = {
  skillId: string;
  title: string;
  summary: string;
  scope?: SkillPlaneScope;
  whenToUse?: string;
  why?: string;
  keywords?: readonly string[];
  pitfallsPreview?: readonly string[];
  bodyRef?: string;
  promotedFrom?: readonly string[];
  promotionState?: SkillPlanePromotionState;
};

export type SkillBody = SkillHead & {
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

- [ ] **Step 3: Implement module helper**

Export:

```ts
export const skill = {
  directory(path: string, input: { scope?: SkillPlaneScope } = {}) { return { kind: "directory", path, scope: input.scope } as const; },
  package(packageName: string, input: { scope?: SkillPlaneScope } = {}) { return { kind: "package", packageName, scope: input.scope } as const; },
  inline(heads: readonly SkillHead[]) { return { kind: "inline", heads } as const; },
  module(input: { sources: readonly SkillSourceSpec[]; indexPolicy?: Partial<SkillPlaneIndexPolicy>; bodyLoadPolicy?: Partial<SkillPlaneBodyLoadPolicy>; lifecycle?: Partial<SkillPlaneLifecyclePolicy>; metadata?: Readonly<Record<string, unknown>> }): SkillPlaneModuleSpec { ... },
};
```

Defaults:

```ts
indexPolicy: { maxHeads: 40, includeScopes: ["agent", "project", "workspace"] }
bodyLoadPolicy: { mode: "on-demand", maxBodiesPerTurn: 3 }
lifecycle: { allowWrite: true, checkpointWrites: true, promotion: "suggest" }
```

- [ ] **Step 4: Implement stores**

Add:

```ts
export type SkillPlaneStore = {
  listHeads(query: { scopes?: readonly SkillPlaneScope[] }): Promise<readonly SkillHead[]>;
  readBody(skillId: string): Promise<SkillBody | undefined>;
  write(body: SkillBody): Promise<SkillBody>;
};
```

`createInMemorySkillPlaneStore` uses a `Map<string, SkillBody>`.

`createFileSkillPlaneStore(rootDir)` persists one JSON file per skill under `rootDir`.

- [ ] **Step 5: Implement renderer**

`renderSkillIndexMaterial(heads)` returns a `PromptPackMaterialDraft`:

```ts
{
  id: "runtime:skill-plane:index",
  kind: "runtime",
  text: "...compact index...",
  source: "runtime.skillPlane.index",
  sourceCategory: "declared-built-in",
  trusted: true,
  promptSegmentKind: "skillIndex",
  metadata: { promptSegmentKind: "skillIndex", generatedBy: "runtime.skillPlane" }
}
```

- [ ] **Step 6: Implement promotion advice**

Add `createSkillWriteProposal(...)` and `adviseSkillPromotion(...)`. Advice returns:

```ts
{ target: "candidate-mcp-plus", autoGenerateTool: false }
```

- [ ] **Step 7: Verify**

Run:

```bash
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.skillPlane/skillPlane.test.ts
```

Expected: PASS.

## Task 3: Manifest Compile Support

**Files:**
- Modify: `src/runtimeImplementation/runtimeAgentManifest.ts`
- Modify: `test/agentCore/agent_runtimeImplementation/runtimeAgentManifest.test.ts`

- [ ] **Step 1: Add failing compile test**

Create `SkillPlaneAgent` with:

```ts
harness = harness({
  modules: {
    skill: skill.module({
      sources: [skill.inline([{ skillId: "repo-review", title: "Repo Review", summary: "Review repo changes.", scope: "project" }])],
    }),
  },
  loop: loop.standard(),
});
```

Assert:

```ts
assert.equal(typeof result.manifest.harness.modules.skill, "object");
assert.equal(result.manifest.harness.runtimeRequirements.includes("runtime.skill"), true);
```

- [ ] **Step 2: Implement manifest wiring**

Import:

```ts
import { runtimeRequirementsForSkillModule, skillPlaneModuleFrom } from "./runtime.skillPlane/index.js";
```

Add:

```ts
...runtimeRequirementsForSkillModule(skillPlaneModuleFrom({ modules: input.modules })),
```

beside the MCP runtime requirement merge.

- [ ] **Step 3: Verify**

Run:

```bash
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtimeAgentManifest.test.ts
```

Expected: PASS.

## Task 4: Public API Export

**Files:**
- Modify: `src/agentCore/index.ts`
- Modify: `test/agentCore/agentCorePublicApi.test.ts`

- [ ] **Step 1: Add failing public API assertions**

Assert:

```ts
const module = praxis.skill.module({ sources: [] });
assert.equal(module.kind, "praxis.skill.module");
assert.equal(packagePraxis.skill.module({ sources: [] }).version, "praxis.skill.v1");
```

- [ ] **Step 2: Export skill helpers and types**

In `agentCore/index.ts`, import and export:

```ts
skill,
type SkillBody,
type SkillHead,
type SkillPlaneModuleSpec,
type SkillPlaneScope,
type SkillPlaneStore,
```

Also include `skill` on the public `praxis` object.

- [ ] **Step 3: Verify**

Run:

```bash
node --import tsx --test test/agentCore/agentCorePublicApi.test.ts
```

Expected: PASS.

## Task 5: Runtime PromptPack Injection

**Files:**
- Modify: `src/runtimeImplementation/praxisRuntimeKernel.ts`
- Modify: `test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`

- [ ] **Step 1: Add failing runtime prompt smoke**

Create an agent with `modules.skill` and an inline `repo-review` skill. Run `PraxisRuntimeKernel.runManifest(...)` with a fake final-answer model caller. Assert the prepared prompt includes a material with:

```ts
material.promptSegmentKind === "skillIndex"
material.id === "runtime:skill-plane:index"
```

Use the existing prompt debug shape in `praxisRuntimeKernel.test.ts`; if no direct prompt object is exposed, assert through the nearest existing debug/turn record that already inspects PromptPack material.

- [ ] **Step 2: Add kernel option**

Extend `PraxisRuntimeKernelOptions`:

```ts
skillPlane?: {
  store?: SkillPlaneStore;
};
```

- [ ] **Step 3: Create default store**

In `runManifest`, default to:

```ts
const skillPlaneStore = options.skillPlane?.store
  ?? createFileSkillPlaneStore(path.join(toolWorkspaceRoot, ".rax_workspace", "skills"));
```

- [ ] **Step 4: Discover skill heads**

Add helper:

```ts
async function discoverRuntimeSkillIndexMaterials(input: {
  manifest: AgentManifest;
  store: SkillPlaneStore;
}): Promise<readonly PromptPackMaterialDraft[]> {
  const module = skillPlaneModuleFrom(input.manifest.harness);
  if (module === undefined) return [];
  const heads = await input.store.listHeads({ scopes: module.indexPolicy.includeScopes });
  return [renderSkillIndexMaterial(heads.slice(0, module.indexPolicy.maxHeads))];
}
```

Inline source heads from `module.sources` must be available even before any file store content exists.

- [ ] **Step 5: Inject after tool declarations**

Add `skillIndexMaterials` to `buildPromptPackAndLower` and `assemblePromptContextMaterials` inputs. Insert it immediately after `toolDeclarationPreludeMaterials` so the assembled PromptPack order is:

```text
toolDeclarations
skillIndex
projectContext
```

- [ ] **Step 6: Verify**

Run:

```bash
node --import tsx --test test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts
```

Expected: PASS.

## Task 6: Fullstack Example

**Files:**
- Modify: `examples/fullstack/agents/repoInspector/harness/repoInspectorHarness.ts`
- Modify: `examples/fullstack/tests/repoInspector.compile.test.ts`

- [ ] **Step 1: Add compile assertions**

Assert:

```ts
assert.equal(compiled.manifest.harness.runtimeRequirements.includes("runtime.skill"), true);
assert.equal(typeof compiled.manifest.harness.modules.skill, "object");
```

- [ ] **Step 2: Mount two inline skills**

In `createRepoInspectorHarness`, add `modules.skill`:

```ts
modules: {
  skill: praxis.skill.module({
    sources: [praxis.skill.inline([
      {
        skillId: "repo-review.findings-first",
        title: "Findings First Review",
        summary: "Lead with actionable findings and put summaries after risks.",
        scope: "project",
        whenToUse: "Code review and regression-risk tasks",
        pitfallsPreview: ["Do not bury test gaps in a summary."],
      },
      {
        skillId: "repo-inspection.anchor-current-target",
        title: "Anchor Current Target",
        summary: "Restate the current repository/path/task before inspecting or editing.",
        scope: "project",
        whenToUse: "Long context or task-switching sessions",
        pitfallsPreview: ["Do not continue a previous repository by inertia."],
      },
    ])],
  }),
},
```

If `modules` already exists, merge rather than replace.

- [ ] **Step 3: Verify example compile**

Run:

```bash
node --import tsx --test examples/fullstack/tests/repoInspector.compile.test.ts
```

Expected: PASS.

## Task 7: Docs And Final Verification

**Files:**
- Modify: `docs/design/promptPackCacheAndToolLowering.md`
- Modify: `docs/design/promptPackCore123Draft.md`
- Keep: `docs/design/skillPlaneHarnessComponent.md`

- [ ] **Step 1: Update PromptPack order docs**

Add `skillIndex` after `toolDeclarations` and document:

```md
- `skillIndex`: compact stable skill heads and index cards. It tells the model what reusable working methods are available, while full bodies enter later dynamic context after selection.
```

- [ ] **Step 2: Update Core 1-2-3 draft**

Add:

```md
`skillIndex` follows `toolDeclarations` in the full PromptPack order. It is not part of the first three layers, but it is capability-adjacent and prefix-cacheable because it contains compact heads only.
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
node --import tsx --test \
  test/agentCore/agent_executionEngine/promptPack/promptDefiner.test.ts \
  test/agentCore/agent_executionEngine/promptPack/promptAssembler.test.ts \
  test/agentCore/agent_runtimeImplementation/runtime.skillPlane/skillPlane.test.ts \
  test/agentCore/agent_runtimeImplementation/runtimeAgentManifest.test.ts \
  test/agentCore/agentCorePublicApi.test.ts \
  examples/fullstack/tests/repoInspector.compile.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run broad verification**

Run:

```bash
npm run typecheck
npm run test:agentCore
npm run build
npm run pack:dry-run
git diff --check
```

Expected: all pass. If `npm run test:agentCore` is too slow during iterative development, run it before final handoff at minimum.

## Self-Review Notes

- Spec coverage: PromptPack placement, stable index-only prefix, `.rax_workspace/skills`, model/runtime proposal sources, checkpoint/governance, and `candidate-mcp-plus` are covered.
- No automatic tool generation: covered by promotion advice contract.
- MCP+ relationship: v1 can project shared heads later, but this plan does not mutate MCP+ behavior.
- Risk: kernel prompt debug surface may require adapting the runtime test to the currently exposed PromptPack record.
