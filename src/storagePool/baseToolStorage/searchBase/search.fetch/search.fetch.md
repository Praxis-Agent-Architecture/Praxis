---
description: Fetch targeted HTTP/HTTPS content through a governed runtime provider.
argument-hint: '{"target":{"url":"https://example.com","maxBytes":4096},"context":{"dryRun":true}}'
---

# search.fetch

## Use This Tool

Use `search.fetch` when the model already has a concrete URL and needs bounded page or remote content. It is not broad discovery search and it is not final citation synthesis.

## Call Shape

```ts
searchFetchHandler.invoke({
  toolCallId: "fetch-1",
  runtimeId: "runtime",
  sessionId: "session",
  executor,
  input: {
    target: {
      url: "https://example.com/post",
      method: "GET",
      expectedContentType: "text/html",
      maxBytes: 4096,
    },
    context: {
      dryRun: false,
      guard: { accepted: true },
      grantedPermissions: ["network:read", "search:fetch"],
    },
  },
});
```

## Required Inputs

- `target.url`: absolute `http` or `https` URL.

## Optional Inputs

- `target.method`: `GET` or `HEAD`; default is `GET`.
- `target.expectedContentType`: media type guard such as `text/html`.
- `target.maxBytes`: maximum returned body preview size.
- `target.timeoutMs`: runtime timeout hint.
- `context.grantedPermissions`: required for real execution; must include `network:read` and `search:fetch`.
- `context.allowedDomains`: optional domain allowlist for both the initial URL and runtime-reported final URL.
- `context.guard` or `context.networkAccess`: required for real execution.

## Runtime Behavior

Dry-run mode previews the fetch request and never calls the provider.

Real execution requires `context.dryRun === false`, an affirmative guard, explicit `context.grantedPermissions`, and `BaseToolExecutorPort.network.fetch`. Runtime owns transport, SSRF policy, credentials, timeout, redirects, and cleanup. When `allowedDomains` is supplied, the baseTool also validates the provider-returned `finalUrl` so redirects cannot leave the allowed domain set silently.

## Returns

Returns `agentCore.basicTool.search.fetch` with normalized target, dispatch mode, headers, status, body preview, byte count, truncation state, and audit metadata.

## Example

```ts
await planSearchFetch({
  target: { url: "https://example.com/docs", maxBytes: 2048 },
  context: { dryRun: true },
});
```

## Avoid

- Do not use this tool for broad web discovery; use `search.nativeSearch` or `search.searchEngine`.
- Do not synthesize final grounded answers here; use `search.ground`.
- Do not create hidden fetch clients or SDK clients inside the baseTool.
