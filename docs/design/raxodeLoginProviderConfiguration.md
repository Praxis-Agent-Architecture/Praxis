# Raxode Login Provider Configuration Design

## Goal

This design defines the first alpha path for model login, API key, base URL,
endpoint shape, model selection, and health checks across:

```text
praxis_framework
  -> framework_runtime
  -> raxode_backend
  -> raxode_legacy_tui
```

Raxode is the official Praxis coding agent sample. Its user-facing entry is
`raxode login`, but the implementation must not become a Raxode-only auth
island. The framework owns the reusable provider/auth/profile substrate,
runtime mounts the resolved calling surface, backend consumes runtime-ready
config, and legacy TUI only presents the interaction.

## Fixed Product Rules

- Raxode official config lives under `~/.raxode/`.
- Raxode uses `~/.raxode/auth.json` and `~/.raxode/config.json`.
- Workspace-local `./.raxode/` stores workspace, session, and agent state only.
  It does not store provider secrets by default.
- Raxode no longer reads `AGENTCORE_CODEX_MODEL` or
  `AGENTCORE_CODEX_REASONING_EFFORT` as the normal product path. The alpha only
  recognizes `config.json`.
- Old `~/.raxcode/` migration is out of scope because Raxode has not shipped.
- Secrets are never actively deleted by alpha workflows. Logout only unbinds
  the current selected role/profile.
- Secret display is always masked, using front and tail fragments when
  possible.
- Secret persistence is alpha-grade: file permission `0600`, explicit
  `encryption` metadata reserved, raw secret storage not falsely advertised as
  encrypted.
- First `raxode` launch with no usable config opens `raxode login`.
- First successful config may bind both `core.main` and `tui.main`. Later logins
  do not override the last selected role bindings.
- `core.main` and `tui.main` are independently switchable.
- TAP, MP, and CMP roles are not exposed in the alpha login/model UI.

## Endpoint Shapes

Alpha supported endpoint shapes:

- `chatgpt_codex_responses`: ChatGPT subscription / Codex product channel.
- `responses`: OpenAI-compatible `/v1/responses`.
- `chat_completions`: OpenAI-compatible `/v1/chat/completions`.
- `messages`: Anthropic-compatible `/v1/messages`.

Gemini is not a separate template in the first alpha. If a provider exposes an
OpenAI-compatible chat endpoint, users configure it as `chat_completions`.

## URL Resolution

The URL parser must preserve user intent. The trailing slash is meaningful.

If the user enters a provider root without a trailing slash, Raxode appends the
endpoint for the selected shape:

```text
https://api.deepseek.com + messages
  -> https://api.deepseek.com/v1/messages

https://api.example.com + responses
  -> https://api.example.com/v1/responses

https://api.example.com + chat_completions
  -> https://api.example.com/v1/chat/completions
```

If the user enters a URL ending with `/`, Raxode treats it as the complete
request URL and posts to it exactly:

```text
https://api.deepseek.com/anthropic/ + messages
  -> https://api.deepseek.com/anthropic/
```

If the user enters a known full endpoint without the trailing `/`, login rejects
it before save:

```text
https://api.example.com/v1/responses
https://api.example.com/v1/chat/completions
https://api.example.com/v1/messages
```

The error should explain the two valid choices:

- Remove the endpoint and enter only the provider root.
- Add a trailing `/` to force literal URL mode.

The persisted profile stores:

- `inputBaseURL`: exactly what the user typed.
- `urlMode`: `auto_append_endpoint` or `literal`.
- `finalRequestURL`: the computed request URL.

## Data Model

### `auth.json`

`auth.json` stores secret material and public-safe secret metadata. It does not
store base URLs or model settings.

Conceptual shape:

```ts
type RaxodeSecret = {
  id: string;
  providerLabel: string;
  authMode: "api_key" | "chatgpt_oauth";
  secretKind: "api_key" | "chatgpt_tokens";
  credentials: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    accountId?: string;
  };
  display: {
    masked: string;
    redactedIdentity?: string;
  };
  encryption: {
    mode: "none";
    reserved: true;
  };
  meta: {
    createdAt: string;
    updatedAt: string;
    lastUsedAt?: string;
  };
};
```

Unbound secrets can remain in the file. Status may show that orphan secrets
exist, but it must not reveal raw values.

### `config.json`

`config.json` stores provider profiles, model entries, and role bindings. It
does not store raw secrets.

Conceptual shape:

```ts
type RaxodeProviderProfile = {
  id: string;
  name: string;
  providerLabel: string;
  endpointShape:
    | "chatgpt_codex_responses"
    | "responses"
    | "chat_completions"
    | "messages";
  authSecretId: string;
  inputBaseURL: string;
  urlMode: "auto_append_endpoint" | "literal";
  finalRequestURL: string;
  modelEntries: RaxodeModelEntry[];
  createdAt: string;
  updatedAt: string;
};

type RaxodeModelEntry = {
  id: string;
  model: string;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  inputBudgetThreshold?: number;
  usableInputTokens?: number;
  testStatus?: {
    state: "unknown" | "passed" | "failed";
    checkedAt?: string;
    statusCode?: number;
    message?: string;
  };
};

type RaxodeRoleBinding = {
  roleId: "core.main" | "tui.main" | string;
  providerProfileId?: string;
  modelEntryId?: string;
  enabled: boolean;
};
```

Model entries belong under a provider profile because identical model names may
mean different things on different providers.

## Framework View

The Praxis framework owns the reusable substrate. It should expose generic APIs
that Raxode wraps rather than hard-coding Raxode behavior into the framework.

Responsibilities:

- Define provider profile, model entry, auth secret, URL resolution, role
  binding, and test status contracts.
- Provide public-safe secret masking and validation helpers.
- Provide endpoint-shape URL planning.
- Provide model metadata defaults and static templates.
- Provide smoke test and doctor request contracts.
- Return `CredentialRef`, provider profile, and carrier inputs for runtime.

Suggested API surface:

```ts
createProviderSecret(...)
createProviderProfile(...)
createModelEntry(...)
resolveProviderRequestUrl(...)
bindRoleModel(...)
resolveRoleModelBinding(...)
createProviderCarrierForBinding(...)
runProviderSmokeTest(...)
runProviderDoctor(...)
```

The framework should not read `~/.raxode` directly. It works with an injected
store/root abstraction. Raxode supplies the official `~/.raxode` store.

## Runtime View

Runtime receives resolved framework objects and mounts them into
`runtime.modelAdapter`.

Responsibilities:

- Accept provider carriers and credential refs.
- Register provider carriers in the runtime provider carrier registry.
- Expose public-safe inspection state for current model route and health.
- Route model invocation to `responses`, `chat_completions`, `messages`, or
  `chatgpt_codex_responses`.
- Preserve streaming event surfaces for TUI rendering and health checks.
- Avoid raw secret discovery. Runtime should receive resolved auth material or
  governed credential refs from the framework/auth layer.

Runtime does not own:

- Product-specific Raxode login screens.
- Raw config file discovery.
- Provider-specific wizard choices.
- Direct `auth.json` mutation.

## Raxode Backend View

The backend is the official Raxode application layer over Praxis framework and
runtime.

Responsibilities:

- Use `~/.raxode` as the official config root.
- Load config/auth through the Raxode adapter over framework APIs.
- Resolve `core.main` and `tui.main` role bindings.
- Create backend model options from resolved config.
- Build live provider callers from runtime-ready provider route data.
- Expose TUI-facing commands for login, status, model list, model switch,
  smoke test, and doctor.
- Surface clear startup errors when the selected model is failed or untested.

The backend should not require the legacy TUI to parse or mutate raw
`config.json`. The TUI asks the backend for view models and dispatches commands.

## Raxode Legacy TUI View

The legacy TUI is a user interaction shell.

Responsibilities:

- `raxode login` presents provider templates.
- First `raxode` launch enters login if no usable config exists.
- Login collects API key/OAuth data, base URL, endpoint shape, and model names.
- Login can query `/models` when supported to assist model entry creation.
- Login creates only the selected provider profile/template.
- Login runs a low-cost streaming smoke test before marking a model as passed.
- `/model` displays role bindings and model entries for `core.main` and
  `tui.main`, including pass/fail marks.
- `/model` may switch model entry under the same provider profile without
  changing the provider or secret.
- `raxode status` shows provider, endpoint shape, final URL, model, context
  budget, and masked secret.

The TUI should not directly own the data model. Any temporary direct JSON calls
must be treated as migration scaffolding and moved behind backend/framework
commands.

## Login Templates

Alpha templates:

1. ChatGPT subscription
   - route: `chatgpt_codex_responses`
   - auth: OAuth token set
   - model defaults: Codex official defaults

2. OpenAI compatible Responses
   - endpoint shape: `responses`
   - URL auto append: `/v1/responses`
   - model name: required, assisted by `/models` if available

3. OpenAI compatible Chat Completions
   - endpoint shape: `chat_completions`
   - URL auto append: `/v1/chat/completions`
   - model name: required, assisted by `/models` if available

4. Anthropic compatible Messages
   - endpoint shape: `messages`
   - URL auto append: `/v1/messages`
   - model name: required, assisted by `/models` if available

5. DeepSeek OpenAI compatible
   - endpoint shape: `chat_completions`
   - default root: `https://api.deepseek.com`
   - default model entries: `deepseek-v4-flash`, `deepseek-v4-pro`

6. DeepSeek Anthropic compatible
   - endpoint shape: `messages`
   - default root: `https://api.deepseek.com/anthropic/`
   - default model entries: `deepseek-v4-flash`, `deepseek-v4-pro`

Only the selected template creates a profile.

## Smoke Test

Smoke test scope is one model entry:

```text
provider profile + endpoint shape + final request URL + model name
```

The test should:

- Use streaming.
- Send a tiny prompt such as `请只回复 OK`.
- Pass when HTTP succeeds, text can be parsed, and non-empty text arrives.
- Not require exact text equality.
- Store only a short public-safe status and error message.

Failed smoke tests mark the model entry with a cross in `/model`. If the active
`core.main` model is failed, startup should stop with a useful error and guide
the user to `raxode login`, `/model`, or `raxode doctor`.

## Doctor

`raxode doctor` is the complete health check.

First alpha coverage:

- Read `~/.raxode/config.json` and `~/.raxode/auth.json`.
- Validate role bindings for `core.main` and `tui.main`.
- Validate URL resolution.
- Run streaming smoke test for active `core.main`.
- Test tool-call parsing on the selected route when feasible.
- Test usage/cache field parsing when the provider returns usage data.
- Confirm context/max output parameters are sent or omitted according to route
  rules.
- Confirm backend can create the runtime kernel and live provider.
- Avoid real filesystem writes and shell execution.

Doctor writes a redacted JSON report under `~/.raxode/diagnostics/`.

## Implementation Order

1. Add framework-level provider config contracts and URL planner.
2. Add Raxode store adapter for `~/.raxode`.
3. Rewrite existing `raxcode-config` concepts into Raxode-named config/auth
   compatibility code.
4. Wire backend resolution through the framework/Raxode adapter.
5. Update legacy login TUI to call backend/framework commands instead of owning
   JSON details.
6. Update `/model` to show role-specific binding and model entry health.
7. Add smoke test and doctor commands.
8. Run regression tests for Codex, chat completions, messages, startup, status,
   and model switching.

## Release Boundary

The first alpha is successful when:

- A clean user can run `raxode`, enter login, configure a provider, and continue
  into legacy TUI.
- A returning user can run `raxode` without environment variables.
- Codex subscription, OpenAI-compatible chat completions, OpenAI-compatible
  responses, and Anthropic-compatible messages are represented by the same
  profile/model/role concepts.
- DeepSeek OpenAI-compatible and Anthropic-compatible templates pass smoke tests
  with `deepseek-v4-flash` and `deepseek-v4-pro`.
- Config, status, model switching, and diagnostics use Raxode names, not
  Raxcode/OpenAI-only language.
