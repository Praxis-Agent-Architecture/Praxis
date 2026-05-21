# agent_modelAdapter rewrite baseline

`src/modelAdapter` is now organized around model-native common semantics instead of one generated tool per upstream endpoint.

- `schema/`: Praxis-facing request, message, tool, event, usage, and error types.
- `route/`: protocol + endpoint + auth + framing + transport composition.
- `protocols/`: provider body lowering and stream-frame decoding.
- `providers/`: provider bundles that register routes, compat records, auth env hints, and static model catalog entries.
- `registry/`: provider, compatibility, and model catalog registries.
- `toolBridge/`: unified tool and provider-native tool bridge helpers.

The first runnable route is `openai.compatible_chat`, intentionally shaped after opencode's reuse pattern: OpenAI-compatible providers share the same chat-completions protocol and differ by route/provider metadata.
Provider auth is part of the provider bundle, not a caller-side special case. For example OpenAI-compatible providers use `Authorization: Bearer`, Anthropic uses `x-api-key`, and Google Gemini uses `x-goog-api-key`; callers can ask the registry for an auth ref and keep provider header differences out of runtime code.

Use `createDefaultRaxProviderRegistry()` when an application needs provider metadata, compatibility records, model catalog entries, and provider auth profiles as one isolated object. Use `createDefaultRaxModelClient()` when it only needs a ready-to-call client with the default OpenAI, DeepSeek, Anthropic, and Google routes registered.

Use `registry.completeModelRequest(request)` before calling the client when the upper layer only knows provider/model. It fills the route id and provider auth ref, attaches provider/model/compat metadata, rejects capability mismatches such as tool calls on a model marked as text-only, and applies catalog limits such as clamping `generation.maxOutputTokens` to the model's recorded ceiling while recording the adjustment in `metadata.provider.appliedLimits`.

Provider protocols lower the shared Praxis request schema into native wire shapes. OpenAI-compatible chat, Anthropic Messages, and Google GenerateContent all lower image content parts; OpenAI and Google also lower structured JSON response schemas into their native structured-output fields. Anthropic does not get a fake generic response-schema field because the stable API surface is not equivalent.

Request preparation filters provider-native options through each route's allow-list, expands query/path parameters, redacts sensitive provider headers in the prepared debug view, and forwards `http.timeoutMs` / `http.signal` to the fetch transport.

The fetch transport preserves incomplete SSE blocks across network chunks, so protocol decoders only receive complete provider frames. It also accepts `application/json` responses as a single provider frame for OpenAI-compatible or Anthropic-compatible endpoints that ignore streaming. This matters for process-event consumers such as Raxode because partial JSON should never be surfaced as a model event, while non-stream provider fallbacks still need to fold into the same event contract.

Provider failures are classified at the transport boundary. `provider_error` and `transport_error` details include a stable `category`, `retryable`, optional HTTP `status`, optional `retryAfterMs`, and a truncated `bodyPreview`; runtime and applications should use these fields for retry policy, user-facing diagnostics, and telemetry instead of parsing raw provider text.

The stable upper surface is:

- `prepare(request)`: build a redacted provider request without sending it.
- `stream(request)`: return `RaxModelEvent` process events such as `text.delta`, `tool.input.delta`, `tool.call`, `usage`, and `response.finish`.
- `generate(request)`: fold the stream into a single response.

Raxode-specific provider naming/configuration was removed from Praxis. Product-specific provider choices should live in Raxode and call this generic model adapter surface.
