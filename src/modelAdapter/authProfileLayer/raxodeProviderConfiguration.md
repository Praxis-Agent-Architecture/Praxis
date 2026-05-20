# Raxode Provider Configuration Alpha Contract

## Scope

This note records the first alpha contract for unified provider login and
request routing across:

```text
praxis_framework -> framework_runtime -> raxode_backend -> raxode_legacy_tui
```

The goal is not to make Raxode a hidden special case. Raxode is the official
sample coding agent above the Praxis framework, and it should consume the same
model/auth/provider primitives that other Praxis applications can reuse.

## Layer Views

### Framework: `agent_modelAdapter/authProfileLayer`

Framework owns provider-neutral configuration primitives. It does not read
`~/.raxode`, does not call a network endpoint, and does not parse a product TUI
config file.

The framework contract is:

- endpoint shape: `chatgpt_codex_responses`, `responses`, `chat_completions`, `messages`
- URL plan: `inputBaseURL`, `urlMode`, `finalRequestURL`
- secret record shape with masked display and explicit alpha encryption metadata
- model entry shape with context window, max output, input threshold, and test status
- role binding shape that lets `core.main` and `tui.main` bind independently

The implementation entry is `providerConfiguration.ts`.

### Runtime/config: `raxcode-config.ts` and `runtime-paths.ts`

The Raxode runtime config layer owns concrete files for the official Raxode
product:

```text
~/.raxode/auth.json
~/.raxode/config.json
```

`auth.json` stores secret material and active auth profile ids. `config.json`
stores provider profiles, model settings, role bindings, UI settings,
permissions, embedding settings, and workspace defaults.

The official Raxode home is resolved from `RAXODE_HOME` or `~/.raxode`.
`RAXCODE_HOME` is intentionally not used by the alpha path.
`PRAXIS_CONFIG_ROOT` and `PRAXIS_STATE_ROOT` are not accepted as product config
overrides for the official Raxode alpha path.

Workspace state remains in the workspace `.raxode/` tree. It is not the default
secret store.

### Raxode backend: `authentication/liveProvider.ts`

The backend owns the actual runtime handoff from resolved config to provider
callers. It chooses the provider route and credential type, then forwards model
requests through the existing provider carrier/caller stack.

The backend must trust the config route plan instead of rebuilding endpoint
strings ad hoc. For compatible providers, the caller uses `finalRequestURL` when
present:

- Responses caller posts to `finalRequestURL`
- Chat Completions caller posts to `finalRequestURL`
- Messages caller posts to `finalRequestURL`

If a manually edited config contains a known full endpoint without a trailing
slash, backend resolution rejects it instead of silently constructing a wrong
URL.

### Legacy TUI and CLI: `raxode-login-wizard.ts`, `raxcode-cli.ts`, `bin/raxode`

The legacy UI/CLI owns user interaction:

- `raxode login` opens the login surface
- `raxode status` prints resolved provider, model, base URL, request URL, and
  auth profile for `core.main` and `tui.main`
- `raxode tui` starts the legacy TUI through the legacy command dispatcher

The CLI entrypoint is `bin/raxode`. The older `raxode-cli` backend entry remains
available for application backend debugging, but the alpha product command is
`raxode`.

## URL Rule

Raxode supports two URL modes.

### Auto append endpoint

If the configured URL does not end with `/`, it is treated as a provider root.
Raxode appends the endpoint path for the selected endpoint shape.

Examples:

```text
https://api.deepseek.com + messages
=> https://api.deepseek.com/v1/messages

https://api.deepseek.com + chat_completions
=> https://api.deepseek.com/v1/chat/completions

https://api.openai.com/v1 + responses
=> https://api.openai.com/v1/responses
```

### Literal URL

If the configured URL ends with `/`, it is treated as the final request URL and
used exactly.

Example:

```text
https://api.deepseek.com/anthropic/ + messages
=> https://api.deepseek.com/anthropic/
```

### Rejected shape

Known full endpoint URLs without a trailing slash are rejected. The user should
either add `/` for literal mode or remove the endpoint path and enter the
provider root.

Examples:

```text
https://gateway.example.com/v1/responses
https://gateway.example.com/v1/chat/completions
https://gateway.example.com/v1/messages
```

## Alpha Verification Gates

The tracked verification surface is:

```bash
node --import tsx --test \
  src/modelAdapter/authProfileLayer/providerConfiguration.test.ts \
  raxode-cli/frontend/legacy-src/runtime-paths.test.ts \
  raxode-cli/frontend/legacy-src/raxode-login-wizard.test.ts \
  raxode-cli/frontend/legacy-src/raxcode-cli.test.ts \
  raxode-cli/backend/tests/raxodeLiveProvider.test.ts

npm run typecheck

tmp_home=$(mktemp -d /tmp/raxode-smoke.XXXXXX)
RAXODE_HOME="$tmp_home" ./bin/raxode status
rm -rf "$tmp_home"
```

These gates verify the framework URL contract, the Raxode home path, login
config writes, backend final request URL routing, CLI status output, and
TypeScript compile surface.
