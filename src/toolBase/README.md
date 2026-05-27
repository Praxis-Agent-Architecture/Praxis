# Praxis ToolBase

`toolBase` is the new semantic tool layer for Praxis. It describes the small set of tools that a model should understand, without carrying the old 176-tool implementation catalog into every prompt.

The boundary is intentionally strict:

- `toolBase` owns semantic ids such as `shell.run`, `file.read`, `patch.apply`, `web.search`, `skill.load`, and `mcp.use`.
- `modelAdapter` lowers these semantic tools into provider wire formats such as OpenAI Responses, OpenAI Chat Completions, Anthropic Messages, Gemini, Bedrock Converse, or OpenAI-compatible chat.
- `runtimeImplementation` owns real side effects: shell, filesystem, patching, network, approvals, sandboxing, truncation, user handoff, skills, MCP, and subagents.

The first default profiles are:

- `minimalCoding`: a Pi/Codex-like small set for fast coding loops.
- `standardAgent`: Praxis default model-facing set with coding, grounding, skill, MCP, and subagent delegation.
- `extendedAgent`: larger runtime set where uncommon tools stay deferred instead of occupying prompt space.
- `runtimeOnly`: hidden governance and host operations that are never sent directly to the model.

Runtime-hidden operations such as `approval.request`, `permission.check`, `sandbox.run`, `process.kill`, `secret.resolve`, and `output.truncate` are modeled as ports and policy surfaces, not as model-facing tools.
