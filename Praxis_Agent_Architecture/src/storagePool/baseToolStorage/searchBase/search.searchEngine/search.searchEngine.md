---
description: Query a generic or custom search engine through the runtime.
argument-hint: '{"target":{"query":"Praxis agentCore","provider":"generic","maxResults":5},"context":{"dryRun":true}}'
---

# search.searchEngine

## Use This Tool

Use `search.searchEngine` for portable search-engine result collection through a runtime-owned backend. It is not provider-native model web search; use `search.nativeSearch` for that.

## Call Shape

```ts
searchEngineHandler.invoke({
  toolCallId: "search-engine-1",
  runtimeId: "runtime",
  sessionId: "session",
  executor,
  input: {
    target: {
      query: "Praxis agentCore",
      provider: "generic",
      maxResults: 5,
      safeSearch: true,
      locale: "en-US",
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      grantedPermissions: ["network:search"],
    },
  },
});
```

## Required Inputs

- `target.query`: non-empty search query.

## Optional Inputs

- `target.provider`: `generic`, `browser`, or `custom`; default is `generic`.
- `target.maxResults`: result cap from `1` to `50`.
- `target.recencyDays`: freshness hint.
- `target.safeSearch`: runtime hint; default is `true`.
- `target.locale`: locale hint.
- `context.allowedProviders`: governance allowlist.

## Runtime Behavior

Dry-run returns a request preview and never calls the provider.

Real execution requires `context.dryRun === false`, an affirmative guard, explicit `context.grantedPermissions`, and `BaseToolExecutorPort.network.search`. Runtime owns the actual search engine, network access, rate limits, and credentials.

## Returns

Returns normalized search `results` with titles, URLs, snippets, provider metadata, audit, and public-safe errors.

## Example

```ts
await planSearchEngineQuery({
  target: { query: "Praxis agentCore", maxResults: 3 },
  context: { dryRun: true },
});
```

## Avoid

- Do not use this for OpenAI/Anthropic/Gemini native web search; use `search.nativeSearch`.
- Do not fetch full pages here; use `search.fetch`.
- Do not synthesize final cited answers here; use `search.ground`.
