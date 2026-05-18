# Raxode Application Layer Integration

## 2026-05-10 Decision

Raxode is the first formal Praxis application backend. Its backend lives under `raxode-cli/backend` and follows the `realtest/caonima` project shape: `rax.project.json`, `application/`, `agents/`, `authentication/`, `context/`, `memory/`, `topology/`, `tests/`, and `reports/`.

`src/applicationLayer` is the official framework application integration surface. It is allowed to import the public `src/agentCore/index.ts` API and must not import Raxode product code. Raxode frontend/backend communication should go through application-layer contracts, commands, events, sessions, and view models.

The legacy TUI source under `raxode-cli/frontend/legacy-src` is preserved as reference material. The migration goal is technical separation and backend replacement, not deleting the old UI assets or changing the visual identity.

## Current Verified State

- `package.json` exports `./application`.
- `src/applicationLayer` exposes project loading, local runtime, local transport, REST transport descriptor, and WebSocket transport descriptor.
- `raxode-cli/backend` contains `agent.raxode.coding` with `gpt-5.5` low reasoning, standard permission profile, SQLite workspace persistence, and all 175 catalog BaseTools mounted through the framework catalog.
- `raxode-cli` now uses `createRaxodeBackend`, which runs through `applicationLayer` rather than the deleted temporary `agentCoreBackend.ts`.
- Verification passed with `npm run typecheck`, application/backend node tests, and `./bin/raxode-cli --json`.

## 2026-05-10 Follow-up

The Raxode application backend now also exposes a JSONL stdio server at `raxode-cli/backend/application/stdioApplicationServer.ts`. Frontend code can use `createProcessApplicationClient` from `raxode-cli/frontend/bridge/applicationClient.ts` to talk to the backend process through application protocol messages instead of importing backend or agentCore modules directly.

`npm run raxode:tui` now runs the CLI through the process-backed application protocol. `npm run raxode:legacy-tui` is still preserved for side-by-side visual and behavior reference.

Application commands now carry session steering into runtime state, and the frontend has a slash command registry at `raxode-cli/frontend/state/slashCommands.ts` so the visible/hidden command set can be reused by migrated legacy panels without coupling slash UI to backend execution.

## 2026-05-10 Frontend Split Progress

The migrated frontend now has dedicated application-facing UI modules outside `legacy-src`: `components/Shell.ts`, `components/Composer.ts`, `components/SlashMenu.ts`, `components/StatusBar.ts`, `components/theme.ts`, `state/slashCommands.ts`, and `bridge/applicationClient.ts`.

The visible slash set is `/model`, `/status`, `/exit`, `/init`, `/resume`, `/permissions`, and `/workspace`; `/rush`, `/cmp`, `/mp`, `/capabilities`, and `/agents` remain hidden in the registry for later advanced panels. Slash commands resolve into application-layer commands instead of direct backend calls.

`createProcessApplicationClient` now wraps the stdio backend with a restart-capable process client. Recovery is best-effort: pending commands fail if the backend dies mid-command, but the next dispatch respawns the backend and attempts to resume the last known session id.

Verified after this split with `npm run typecheck`, application/backend/frontend node tests, and `npm run raxode:tui -- --json`.

The composer now parses `@file` style mentions into application attachments through `frontend/state/composerAttachments.ts`. This keeps file reference handling on the application contract path instead of reintroducing legacy direct backend coupling.

A regression test now covers backend process death before the next dispatch. The client checks dead/non-writable stdin before sending a command, restarts the backend, and replays the command through the fresh application process.

The framework application layer now includes real REST and WebSocket servers. `createApplicationRestServer` serves `GET /application/view` and `POST /application/commands`; `createApplicationWebSocketServer` speaks JSON messages for ready, command, command result, and application events.

Raxode exposes these transports through backend helpers (`createRaxodeBackendRestServer`, `createRaxodeBackendWebSocketServer`) and CLI flags (`raxode-cli --serve-rest`, `raxode-cli --serve-ws`).

The migrated TUI has minimal slash panels for `/model`, `/permissions`, `/workspace`, and `/status`. Panels are derived from `ApplicationViewModel`; commands with arguments still dispatch through the application protocol.

Raxode live-run now uses a product-layer live provider resolver in `backend/authentication/liveProvider.ts`. The process-backed TUI path completed a real `gpt-5.5/low` smoke run with `modelCalls=1` and final output `Raxodelivesmokeok`.

The CLI now accepts `--model`, `--reasoning`, and `--permission` before non-interactive runs so automated smoke tests can exercise model and policy changes without manual TUI interaction.

`bapr` and `yolo` profiles now auto-approve runtime approval requests through the application runtime. A live process-backed Raxode run with `--permission bapr` successfully invoked `shell.commandExecution` for `pwd` with `toolCalls=1` and returned `/home/proview/Desktop/Praxis_series/Praxis_org`.

Live smoke coverage now includes shell, git, code, search, skill, computeruse screenshot, and MCP list-tools paths. The repeatable command is `npm run test:raxode:live-tools`; it runs only when `RAXODE_LIVE_TEST=1` is set by the script and checks `toolCalls=1` plus expected final output for each proven case. The screenshot smoke accepts both artifact ids and real saved `screenshot-*.png` paths, because the current computeruse provider returns a saved image path.

`omni.viewImage` has an honest provider-gap regression in the same live smoke file: Raxode can route the invocation through the application backend, but the current runtime returns `PROVIDER_UNAVAILABLE` until an omni provider is wired.

The migrated frontend now owns a copied-and-tested workspace index/search core at `raxode-cli/frontend/state/workspaceIndex.ts`, preserving the legacy search ranking while avoiding imports from `legacy-src`. `/workspace` surfaces indexed directory hints through the new panel layer, and the panel action model can move through workspace candidates with keyboard selection before dispatching `application.switchWorkspace`.

Text input responsiveness now has a focused regression at `raxode-cli/frontend/tui-input/text-input.performance.test.ts`. The core repeated-backspace path deleted a 7,000-character ASCII input in about 2.4ms on the current machine, keeping the core input algorithm well above the 120Hz target before rendered-terminal verification.

The migrated composer now routes `Ctrl+V` image, desktop file, and long-text paste through application attachments. `frontend/state/clipboardAttachments.ts` reuses the legacy clipboard provider order (`wl-paste`, then `xclip`) and now reads provider-specific file MIME payloads such as `x-special/gnome-copied-files` and `text/uri-list`; file attachments preserve `clipboardMimeType` and GNOME copy/cut action metadata before falling back to plain text path parsing.

The `/permissions` slash path now covers both profile switching and approval decisions. `/permissions approve <id>`, `/permissions reject <id>`, and `/permissions always <id>` resolve into `application.approvalDecision`; the permissions panel also exposes pending approval decisions as keyboard-selectable actions.

The `/resume` slash path now accepts an optional session id. `/resume <session-id>` resolves to `application.resume` with `sessionId`, and the resume panel exposes keyboard-selectable resume/create/rename flows.

The `/workspace` slash path can now consult the migrated workspace index. When a relative query matches an indexed directory, the frontend resolves it to an explicit workspace path before dispatching `application.switchWorkspace`; the workspace panel also exposes indexed directory candidates as keyboard-selectable actions.

`ApplicationViewModel` now includes `sessions` and `approvals` summaries. The `/resume` panel lists recent application sessions from this view and exposes keyboard-selectable panel actions: existing sessions dispatch `application.resume`, while create/rename actions prefill editable slash commands into the composer. `/permissions` lists approval decision records from this view and exposes pending approval actions for approve, reject, and approve-always decisions through `application.approvalDecision`.

Application commands now include `application.createSession` and `application.renameSession`. The `/resume create <name>` and `/resume rename <session-id> <name>` slash paths resolve into these commands, and keyboard-selected create/rename panel actions prefill the matching editable commands into the composer.

The new Raxode TUI/backend path no longer uses the old `direct_user_input`, `direct_init_request`, or `direct_question_answer` protocol names. Those strings remain only in `frontend/legacy-src` as preserved reference code; the active frontend bridge uses application-layer JSON commands and view models.

Application commands now also include `application.requestApproval`. The `/permissions request <approval-id> <reason>` slash path can create a pending approval record, and the permissions panel shows both pending and decided approval records from `ApplicationViewModel.approvals`.

Terminal mouse parsing has been migrated into `raxode-cli/frontend/tui-input/mouse.ts`. It preserves the legacy SGR scroll delta handling for reports with or without the leading ESC byte, and now normalizes left/middle/right SGR click events with terminal coordinates. `RaxodeProcessApp` wires scroll deltas into slash-panel line scrolling; full click-to-action behavior remains pending until real TTY mouse-tracking and rendered row offsets are verified.

`raxode-cli/frontend/components/Shell.render.test.ts` is a static render smoke for the migrated TUI shell. It locks core visual anchors (`Raxode`, slash menu entries, workspace/status, model, permission) without claiming full legacy visual parity.

`npm run raxode:tui` now has a non-interactive guard: if stdin is not a real TTY, `runRaxodeCli` returns exit code 2 with a clear "requires an interactive TTY" message instead of letting Ink throw a raw-mode stack trace. The helper `canStartInteractiveRaxodeTui` has a unit test in `raxode-cli/cli.test.ts`.

`application.start` now compiles and validates the Raxode agent manifest before publishing the ready view. This keeps the initial TUI status honest: the startup smoke through `script -qfec 'timeout 8s npm run raxode:tui'` shows `175/175 tools` and `mountedTools=175` instead of the previous `0/175 tools` pre-turn placeholder.

A tmux-driven TTY smoke verifies the migrated TUI can accept real terminal input and backspace correction: launching `npm run raxode:tui`, sending `/statusxxxx`, four backspaces, and Enter opens the Status slash panel and shows `tools 175/175`. This is interaction evidence, not yet a full 120Hz rendered-frame benchmark.

The migrated shell now restores key legacy visual identity anchors: the RAXODE ASCII banner, `powered by Praxis`, `v0.1.0`, the bottom workspace/context bar, the numbered slash menu, and the legacy composer hint (`Drag to select text, Ctrl+V to paste images, @ to choose files, / to choose commands`). Full pixel/line parity remains a later visual audit, but the acceptance baseline is now represented in the active TUI and locked by render smoke.

The all-tools matrix gate now passes with `npm run test:agentCore:all-tools-matrix`: 175/175 catalog tools are covered by the readiness ledger and no-model family matrices across shell, git, code, skill, omni, computeruse, search, and mcp. This is framework readiness proof, not a claim that every tool performed a live external side effect through a model turn; live execution evidence remains in `raxode-cli/reports/live-tool-smoke.md`.

The TUI input layer now filters complete SGR mouse reports before text insertion. A tmux smoke sends `ESC [<0;5;32M` to the running TUI and verifies the raw mouse report does not appear in the composer. Full click-to-action behavior still requires a rendered row-offset binding for slash panels.

## 2026-05-10 Legacy TUI Reuse Correction

The existing legacy TUI is now an active application-backed acceptance path, not merely reference material. `raxode-cli/frontend/legacy-src/agent_core/direct-tui.tsx` keeps its current UI and direct input/log polling behavior, but when `raxode-cli/backend/legacyDirectApplicationBackend.ts` is present it launches that adapter instead of the old live-agent backend.

`legacyDirectApplicationBackend.ts` is the compatibility boundary: it still speaks the legacy direct TUI stdout/log protocol (`log file:`, `direct ready:`, and JSONL live report rows), while translating user input into applicationLayer turns against the Raxode backend. This avoids rewriting the user's long-lived TUI while still moving the backend through the formal application surface.

A startup race was fixed in the adapter: stdin and close listeners are attached immediately after `direct ready`, before async application runtime imports and initialization. Incoming payloads are queued until the runtime is ready, then consumed in order. The legacy TUI child backend is launched with `node --import tsx` and `NODE_NO_WARNINGS=1` so backend-only Node experimental warnings do not appear as chat errors.

Verified with `npm run typecheck`, `node --import tsx --test raxode-cli/backend/tests/legacyDirectApplicationBackend.test.ts`, application/backend/frontend node tests, and a tmux smoke of `RAXODE_LEGACY_APPLICATION_MODE=dry-run npm run raxode:legacy-tui` that submitted Chinese text through the legacy UI and rendered `PraxisRuntimeKernel dry-run completed.` from the application-backed adapter.

## 2026-05-10 Legacy TUI Streaming

The legacy TUI application-backed path now supports streaming output. Raxode's live provider wraps the provider transport so ChatGPT/Codex SSE chunks are read incrementally; `response.output_text.delta` payloads are forwarded into applicationLayer `stream` events while the provider call is still running.

`legacyDirectApplicationBackend.ts` subscribes to application events and translates `stream` events into the legacy live-report `assistant_delta` rows with `label: "core/model.infer"`, which the existing legacy TUI already knows how to render. Dry-run mode emits a small synthetic `assistant_delta` sequence for regression and UI smoke tests.

The legacy TUI log tailer now polls at `RAXODE_RENDER_FPS` instead of the old 350ms interval. With the default `RAXODE_RENDER_FPS=120`, stream rows can be picked up at roughly 8.3ms cadence. A separate `RAXODE_STREAM_FPS` can tune dry-run/synthetic chunk pacing, defaulting to the render FPS.

A model-decision trimming bug was fixed: SSE `delta` chunks now preserve internal/trailing spaces while still trimming final direct strings. This prevents streamed text like `"stream " + "ok"` from becoming `"streamok"`.

A live tmux smoke also passed through the legacy UI path with `AGENTCORE_CODEX_MODEL=gpt-5.5 AGENTCORE_CODEX_REASONING_EFFORT=low RAXODE_RENDER_FPS=120 RAXODE_STREAM_FPS=120 npm run raxode:legacy-tui`. Prompt `只回答: OK` rendered `OK` in the legacy UI and logged a real `assistant_delta` row before `turn_result`, confirming the live provider stream bridge is active.

## 2026-05-10 Multi-Agent Entry Contract

`rax.project.json` now supports a lightweight `agents` map in addition to the legacy primary `entry/export/agent.id` fields. `applicationLayer` still starts and submits normal turns through the primary entry, while `application.invokeAuxiliaryTask` can address a sidecar by `agentKey` without overwriting the primary manifest shown in `ApplicationViewModel`.

Raxode declares `agent.raxode.tui.sidecar` at `raxode-cli/backend/agents/tuiSidecar/praxis.agent.ts` as the first sidecar entry. The sidecar currently reuses the coding agent capability surface and only changes identity, so it is a contract and routing foothold rather than a separate product behavior fork.

`ApplicationViewModel.agentEntries` exposes the project-visible entry keys and agent ids to frontend slash panels or future orchestration UI. This is intentionally project metadata, not a full multiagent scheduler; topology, launch/kill/resume semantics, and parent/child policy remain future `multiagentCore` work.

## 2026-05-10 TUI Auxiliary Agent Correction

The live TUI helper path now uses `agent.raxode.tui` at `raxode-cli/backend/agents/tuiAgent/praxis.agent.ts`, not the earlier sidecar foothold. This agent is intentionally tool-free and structured-output-only: it uses `gpt-5.4-mini` with low reasoning by default, denies tool execution, and currently supports only `tui.pending-composer-summary` and `tui.tool-summary.websearch`.

`application.invokeAuxiliaryTask` routes these helper tasks through the application layer with a separate auxiliary session and leaves the primary `agent.raxode.coding` view untouched. The legacy helper file `raxode-cli/frontend/legacy-src/agent_core/tui-mini-summary.ts` is preserved, but its active implementation now delegates to the application command instead of the old direct model/TAP inference path.

## 2026-05-14 Prompt Cache And BaseTool Exposure Correction

Raxode/Praxis no longer treats BaseTool context folding as PromptPack text-only optimization. `BaseToolContextFolding` still owns model-readable family/group/tool documentation, but `toolSchemaCompatibilityLayer.lowerPraxisToolsForProvider` now accepts `visibleToolIds` so provider-native function schemas can be narrowed to the tools currently expanded, selected, or retained by session context.

Runtime decision tools such as `praxis_expand_tool_context` remain exposed even when concrete BaseTools are folded. This preserves the intended workflow: the model first sees stable family summaries, asks to expand a likely family/group/tool, and only then receives concrete provider-callable schemas for those tools.

`applicationLayer` now carries BaseTool context selection and tool usage across same-session Raxode turns. A tool expanded or used in one turn can stay visible in the next turn without exposing the full 175-tool schema set again. This is the intended cache-friendly middle ground: stable indexes stay small, hot tools remain reachable, and cold tools do not churn provider tool declarations.

PromptPack segment hashes now represent provider-visible prompt text rather than internal runtime heat metadata. The internal metadata hash is still emitted under segment provider hints for diagnostics. `raxode:cache-xray` also prints provider body fingerprints so future cache investigations can distinguish tool-schema changes, PromptPack text changes, previous provider output items, and tool result blocks.

## 2026-05-16 Multi Provider Model Routes

The framework model route now treats ChatGPT Codex responses, OpenAI API responses, OpenAI chat completions, and Anthropic messages as distinct runtime routes instead of folding every OpenAI-shaped call into the Codex carrier.

`AgentManifest.model.endpointShape` now accepts `responses`, `chat_completions`, and `messages`. `PraxisRuntimeKernel` derives provider tool schema family and provider body shape from the manifest model:

- `responses` with the Codex capability, `chatgpt-codex` metadata, ChatGPT Codex carrier id, or `chatgpt.codex.responses` scope stays on the ChatGPT Codex responses path.
- OpenAI API `responses` uses the public OpenAI responses carrier and `openaiResponsesCaller`.
- OpenAI-compatible `chat_completions` lowers tools/messages to the chat completions shape and uses `openaiChatCompletionsCaller`.
- Anthropic `messages` lowers tools/messages to the Anthropic messages shape and uses `anthropicMessagesCaller`.

`providerCaller` remains the legacy OpenAI responses-compatible caller for Codex/OpenAI responses. New provider families should use the named caller fields so request envelope types do not drift across provider protocols.

`authResolver` now resolves `anthropic_api_key` into an `x-api-key` envelope with `anthropic-version`. Tool schema compatibility now includes OpenAI chat completions tool/result shapes, and model decision parsing reads OpenAI chat completions and Anthropic message text/tool-call outputs.

Verification passed with:

```bash
npm run typecheck
node --import tsx --test test/agentCore/agent_modelAdapter/authProfileLayer/authProfileLayer.test.ts test/agentCore/agent_modelAdapter/providerAccessLayer/providerAccessLayer.test.ts test/agentCore/agent_runtimeImplementation/runtime.modelAdapter/modelInvocationRuntime.test.ts test/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_chat_completions.test.ts test/agentCore/agent_modelAdapter/actualInvocationLayer/anthropic/v1_messages.test.ts test/agentCore/agent_executionEngine/coreLogic/modelDecision.test.ts test/agentCore/agent_modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.test.ts test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts test/agentCore/agent_runtimeImplementation/runtimeAgentManifest.test.ts
node --import tsx --test raxode-cli/backend/tests/raxodeLiveProvider.test.ts raxode-cli/backend/tests/raxodeBackend.compile.test.ts raxode-cli/backend/tests/legacyDirectApplicationBackend.test.ts test/applicationLayer/applicationLayer.test.ts
```
