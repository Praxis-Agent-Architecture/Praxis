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

The stable upper surface is:

- `prepare(request)`: build a redacted provider request without sending it.
- `stream(request)`: return `RaxModelEvent` process events such as `text.delta`, `tool.input.delta`, `tool.call`, `usage`, and `response.finish`.
- `generate(request)`: fold the stream into a single response.

Raxode-specific provider naming/configuration was removed from Praxis. Product-specific provider choices should live in Raxode and call this generic model adapter surface.
