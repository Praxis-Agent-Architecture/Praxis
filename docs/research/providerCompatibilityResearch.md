# Provider Compatibility Research

## Purpose

This document fixes the current Praxis provider research baseline for OpenAI, Claude, and Gemini. It separates official API facts from implementation observations so future provider lowering work does not mix provider-specific behavior into PromptPack.

## Current Baseline

- OpenAI, Claude, and Gemini must all lower from the same Praxis PromptPack and ToolSpec abstractions.
- Provider-specific best paths are allowed below `runtime.modelAdapter`, but they must preserve Praxis tool semantics and PromptPack section order.
- If a provider cannot preserve safety, permission, or tool semantics, lowering must fail closed.
- If a provider lacks cache, formatting, or optional feature support, lowering may continue best effort with a degraded record.

## Tool Declaration Notes

- Praxis treats official TAP packages, user custom packages, enterprise private packages, baseTools, and custom tools as ToolSpec-compatible declarations.
- Provider adapters may map ToolSpec to native tool/function declarations where supported.
- If native custom tools are rejected by a provider, Praxis may later test JSON tool plan fallback. That fallback is not implemented as default behavior in this research pass.

## Cache Notes

- Praxis cache planning is provider-neutral and section-based.
- Claude-style explicit cache controls, Gemini explicit/implicit context caching, and OpenAI implicit or endpoint-specific cache behavior should all be represented through `PromptPackCachePlan` first.
- Cache support differences are best-effort lowering issues, not PromptPack definition failures.

## Payload Notes

- PromptPack is not a provider payload.
- `promptLoweringRuntime` creates a provider-neutral lowered envelope.
- Actual provider payloads belong under the model adapter actual invocation layer.

## Evidence Policy

Official provider documentation should be cited in future updates when a provider behavior is added to this matrix.

Non-official CLI traces, local captures, third-party parsers, and blog posts can be used as implementation observations, but they must be labeled non-official and kept below the official API baseline.
