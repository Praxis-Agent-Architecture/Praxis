---
description: Ground a factual claim against evidence through a governed runtime provider.
argument-hint: '{"target":{"claim":"...","evidence":[{"url":"https://example.com","excerpt":"..."}]},"context":{"dryRun":true}}'
---

# search.ground

## Use This Tool

Use `search.ground` when the model has a claim and evidence, and needs a normalized grounded answer with sources and citations. It can consume outputs from `search.nativeSearch`, `search.searchEngine`, or `search.fetch`.

## Call Shape

```ts
searchGroundHandler.invoke({
  toolCallId: "ground-1",
  runtimeId: "runtime",
  sessionId: "session",
  executor,
  input: {
    target: {
      claim: "Praxis search.nativeSearch is provider-native web search.",
      evidence: [{ url: "https://example.com", excerpt: "..." }],
      mode: "balanced",
      citations: "required",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      grantedPermissions: ["search:read", "grounding:audit"],
    },
  },
});
```

## Required Inputs

- `target.claim`: factual claim or answer draft to ground.
- `target.evidence`: at least one evidence item with URL, title, or excerpt.

## Optional Inputs

- `target.mode`: `strict`, `balanced`, or `exploratory`.
- `target.minimumEvidenceCount`: minimum evidence count required.
- `target.provider` / `target.model`: runtime grounding route hints.
- `target.citations`: `required`, `preferred`, or `off`.

## Runtime Behavior

Dry-run returns an evidence ledger and requires-review status.

Real execution requires `context.dryRun === false`, an affirmative guard, explicit `context.grantedPermissions`, and `BaseToolExecutorPort.network.ground`. Runtime owns provider-native grounding, Raxode websearch adapters, model calls, network access, and credentials.

## Returns

Returns grounded status, confidence, answer text, citations, sources, evidence ledger, provider metadata, audit, and public-safe errors.

## Example

```ts
await planSearchGround({
  target: {
    claim: "A test claim",
    evidence: [{ excerpt: "source excerpt" }],
  },
  context: { dryRun: true },
});
```

## Avoid

- Do not use this for broad discovery; use `search.nativeSearch` or `search.searchEngine`.
- Do not fetch page bodies here; use `search.fetch`.
- Do not hide model/provider calls in the baseTool; route real grounding through runtime.
