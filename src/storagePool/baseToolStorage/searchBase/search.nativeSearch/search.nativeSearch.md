---
description: Run official provider-native web search through a governed runtime provider.
argument-hint: '{"target":{"provider":"openai","query":"latest OpenAI web search docs","maxResults":5},"context":{"dryRun":true}}'
---

# search.nativeSearch

## Use This Tool

Use `search.nativeSearch` when the model needs the official web search surface built into a model provider: OpenAI Responses web search, Anthropic Messages web search, or Gemini Google Search grounding. This is not local file search and not a generic search-engine adapter.

## Call Shape

```ts
nativeSearchHandler.invoke({
  toolCallId: "search-1",
  runtimeId: "runtime",
  sessionId: "session",
  executor,
  input: {
    target: {
      provider: "openai",
      query: "latest OpenAI Responses web_search citation format",
      model: "gpt-5.4",
      maxResults: 5,
      allowedDomains: ["openai.com"],
      searchContextSize: "medium",
      citations: "required",
    },
    context: {
      dryRun: true,
      allowedProviders: ["openai", "anthropic", "deepmind"],
      grantedPermissions: ["network:search", "search:native"],
    },
  },
});
```

## Required Inputs

- `target.provider`: `openai`, `anthropic`, or `deepmind`.
- `target.query`: non-empty web search query.

## Optional Inputs

- `target.model`: provider model hint.
- `target.maxResults`: normalized result cap, from `1` to `50`; default is `10`.
- `target.recencyDays` / `target.freshness`: freshness constraints when the provider supports them.
- `target.allowedDomains`: domain allowlist for provider-native search where supported.
- `target.searchContextSize`: `low`, `medium`, or `high` context budget hint.
- `target.userLocation`: coarse user location hint for localized search.
- `target.citations`: `required`, `preferred`, or `off`.
- `context.allowedProviders`: governance allowlist for providers.
- `context.grantedPermissions`: required for real execution; must include `network:search` and `search:native`.
- `context.guard`: required for real execution when `context.dryRun === false`.
- `preferredProvider`: provider practice evidence preference; execution still uses runtime support.

## Runtime Behavior

Dry-run mode builds a provider-native web search plan and never calls a provider.

Real execution requires `context.dryRun === false`, an affirmative `context.guard.accepted === true` or `context.guard.allowed === true`, explicit `context.grantedPermissions`, and an injected `BaseToolExecutorPort.network.nativeWebSearch` provider. The baseTool never creates SDK clients, never stores provider secrets, and never owns network lifecycle.

Provider practice files record official behavior:

- OpenAI: Responses API `tools: [{ type: "web_search" }]`, `web_search_call`, and citation annotations.
- Anthropic: Messages API server tool `web_search_20260209` style invocation.
- DeepMind: Gemini `google_search` grounding and URL context metadata.

## Returns

On success, returns `agentCore.basicTool.search.nativeSearch` with:

- normalized `target`
- `requestPreview`
- `dispatch`
- `resultEnvelope.answer`
- `resultEnvelope.sources`
- `resultEnvelope.citations`
- `resultEnvelope.providerMetadata`

On failure, returns a public-safe error such as `MISSING_PROVIDER`, `MISSING_QUERY`, `PROVIDER_NOT_ALLOWED`, `PERMISSION_DENIED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, `PROVIDER_REJECTED`, or `PROVIDER_RESULT_INVALID`.

## Example

```ts
await planNativeSearch({
  target: {
    provider: "anthropic",
    query: "Claude web search server tool citations",
    maxResults: 3,
    allowedDomains: ["anthropic.com"],
    citations: "preferred",
  },
  context: {
    dryRun: true,
    allowedProviders: ["anthropic"],
    grantedPermissions: ["network:search", "search:native"],
  },
});
```

## Avoid

- Do not use this tool for local filesystem search.
- Do not use this tool for a generic custom search engine backend; that belongs to `search.searchEngine`.
- Do not fetch full page contents here; that belongs to `search.fetch`.
- Do not do evidence synthesis or final grounding orchestration here; that belongs to `search.ground`.
- Do not call a provider when dry-run is active.
- Do not run real network search without an affirmative guard.
- Do not create hidden SDK clients or provider-specific network code inside this baseTool.
