# Historical BaseTool Full Readiness Task List

本文记录旧 176-tool baseTools 路线的历史验收材料。它不再代表当前 Praxis basetool 完成度口径。

当前有效方向是 `docs/basetool/profileApplicationContract.md` 中的 compact semantic basetool catalog：少量稳定语义工具、profile-aware describe、统一 factMatrix/registry/runtime port。下面内容仅作为迁移前的背景证据，不能作为新 basetool 的任务清单继续执行。

旧目标不是继续证明“工具已经挂载”，而是把 176 个 BaseTool 推进到真实可用：

```text
mounted
-> providerSchemaReady
-> modelCallable
-> governanceReady
-> dependencyReady
-> hostAdapterReady
-> liveSmokeReady
-> modelDialogueReady
```

第一 live provider 先锁定 `chatgpt_codex_responses` / Codex 订阅登录链路。后续再用同一兼容层扩展 OpenAI API、Claude、Gemini。

## 0. 验收口径

- [x] 176 个 BaseTool 都必须可被 runtime registry 找到。
- [x] 176 个 BaseTool 都必须能 lower 成 provider 可接受的 tool schema。
- [x] 176 个 BaseTool 都必须能被模型在自然语言任务中正确选择或被工具上下文展开机制引导选择。
- [x] 176 个 BaseTool 都必须进入 runtime governance、sandbox、dependency、approval、session/state/event 主链。
- [x] 176 个 BaseTool 都必须有真实 smoke 或可解释失败。
- [x] fullstack 模式下，所有工具要么真实成功，要么返回 public-safe、可修复、可审计的失败。
- [x] `npm run test:agentCore:all-tools-matrix` 最终应达到 `matrixCoverage.covered=176`、`missing=0`。

当前基线：

```text
catalog total: 176
strict smoke covered: 176
strict smoke missing: 0
missing families: none
matrix scripts: shell 32, git 35, code 29, skill 6, omni 14, computeruse 32, search 4, mcp 23
```

最新验证：

- `npm run typecheck` 通过。
- `npm run test:agentCore:all-tools-matrix` 通过，`catalog.total=176`、`matrixCoverage.covered=176`、`missing=0`，分族 smoke 为 shell 33/33、git 35/35、code 29/29、skill 6/6、omni 14/14、computeruse 32/32、search 4/4、mcp 23/23。
- `npm run test:agentCore` 通过，`tests=2471`、`pass=2469`、`fail=0`、`skipped=2`。
- `git diff --check` 通过。
- `AGENTCORE_CODEX_AUTH_FILE="$HOME/.codex/auth.json" AGENTCORE_CODEX_MODEL="gpt-5.5" AGENTCORE_CODEX_REASONING_EFFORT="low" OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS="1200" npm run chat:realtest:fullstack -- --all-testable --policy=permissive --verbose` 真实 live 对话通过；`providerTools=enabled`，模型自然语言触发 `shell.commandExecution` 与 `code.read`，最终记录 `modelCalls=3`、`toolCalls=2`、`events=165`。

## 1. Tool Context Folding

工具上下文不应一次性粗暴塞入 176 个完整说明，也不应只给模型一组冷冰冰的 tool schema。需要建立可展开、可回收、可加权的工具说明树。

### 1.1 说明树结构

- [x] 建立 `BaseToolContextTree`。
- [x] 支持四级结构：

```text
baseTool_index
-> family
-> group
-> tool
```

- [x] 初始全自动模式只注入：

```text
baseTool_index.md
codeBase.md
computeruseBase.md
gitBase.md
mcpBase.md
omniBase.md
searchBase.md
shellBase.md
skillBase.md
```

- [x] family 展开后注入该 family 的 group index。
- [x] group 展开后注入具体 tool 的 `.basetool` / `.md` 使用说明。
- [x] tool 说明正文来自 `storagePool/baseToolStorage/**/<toolId>.md`，不足时从 `bestPractice.ts` / `BaseToolDefinition` 提炼。

### 1.2 暴露模式

- [x] 支持 `allOpen`：176 个工具全部展开。
- [x] 支持 `autoFolded`：全部工具折叠，模型通过展开工具逐层打开。
- [x] 支持 `manualCoarse`：开发者按 family/group 粗粒度选择。
- [x] 支持 `manualFine`：开发者按 toolId 细粒度选择。
- [x] 支持 `semiAuto`：开发者固定打开一部分，其余自动折叠。
- [x] 支持 `none`：纯聊天，不暴露 BaseTool。

### 1.3 展开工具

- [x] 新增 runtime decision tool：`praxis_expand_tool_context`。
- [x] `praxis_expand_tool_context` 只展开工具说明，不执行 host 行为。
- [x] 展开请求必须进入 MainLoop / PromptPack / event 记录。
- [x] 展开结果进入 PromptPack 的 capability segment。

验证：`node --import tsx --test test/agentCore/agent_modelAdapter/route/openaiCompatibleChat.test.ts test/agentCore/agent_executionEngine/coreLogic/modelDecision.test.ts test/agentCore/agent_runtimeImplementation/baseToolContextFolding.test.ts test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`、`npm run typecheck`、`git diff --check`。

### 1.4 热度权重与回收

- [x] tool 被调用一次：tool 节点 +5。
- [x] group 被工具命中一次：group 节点 +3。
- [x] family 被工具命中一次：family 节点 +1。
- [x] 对单个 agent 维护工具热度状态。
- [x] 高频节点保持展开，低频节点可折叠回 index。
- [x] 回收策略应优先保证 PromptPack cache prefix 稳定。

验证：`node --import tsx --test test/agentCore/agent_runtimeImplementation/baseToolContextFolding.test.ts test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`、`npm run typecheck`、`git diff --check`。

## 2. PromptPack Tool Guidance

工具好不好用，不只取决于 schema，也取决于模型能不能理解什么时候该用工具。

### 2.1 内置工具使用提示

- [x] 在 framework core-static prompt 中加入工具使用引导。
- [x] 明确：仓库、文件、git、shell、系统、版本、环境等事实问题必须先工具观察，不得猜。
- [x] 明确：工具调用是获取确定性证据的主要方式。
- [x] 明确：低效工具调用仍然被允许，但应尽量选择必要、高效、低风险的工具。
- [x] 明确：复杂任务可使用 `praxis_ephemeral_procedure` 串并行编排已有 BaseTool。
- [x] 明确：不得发明不存在的工具。

### 2.2 幻觉抑制与强锚定

- [x] 加入“先结论，再验证/下一步”的回答风格。
- [x] 加入“不确定就说明，不得编造或真假混合”。
- [x] 加入“证据优先于记忆/印象”。
- [x] 加入“搜索、读取、修改、安装、修复、验证前先重述当前目标”。
- [x] 加入“用户切换对象后必须重新锚定，不复用旧路径和旧假设”。

验证：`node --import tsx --test test/agentCore/agent_executionEngine/promptPack/promptDefiner.test.ts test/agentCore/agent_executionEngine/promptPack/promptAssembler.test.ts test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`、`npm run typecheck`、`git diff --check`。

### 2.3 Segment 位置

- [x] core rules 放在 `core-static`。
- [x] agent base prompt 放在 `agent-base-static`。
- [x] BaseTool 折叠树放在 `capability-static`。
- [x] 动态展开的工具说明仍尽量保持稳定排序。
- [x] MCP 不常驻展开；MCP 只通过 `mcpBase` 概述和后续展开进入上下文。

实现映射：Praxis 内部段名分别为 `stableSystemCore`、`declaredRuntimeContext`/`projectContext`、`toolDeclarations`。BaseTool/TAP/MCP/dynamic external 的稳定排序由 PromptPack assembler 维护；MCP 在 BaseTool 折叠树里默认只给 `mcpBase` family summary，显式展开后才进入 group/tool 说明。

验证：`node --import tsx --test test/agentCore/agent_runtimeImplementation/baseToolContextFolding.test.ts test/agentCore/agent_executionEngine/promptPack/promptAssembler.test.ts`、`npm run typecheck`、`git diff --check`。

## 3. Provider Tool Schema Compatibility

Praxis 内部仍只认 `family/group/toolId`。对外调用模型时，由 compatibility layer lower 成 provider 可接受的 tools/schema/request shape。

### 3.1 OpenAI / Codex 优先

- [x] 第一优先级打通 `chatgpt_codex_responses` / Codex 订阅登录链路。
- [x] OpenAI/Codex schema lowering 尽可能保留 Praxis schema 细节。
- [x] 若 provider 拒绝某些字段，以 provider 可接受为硬约束做 sanitizer。
- [x] provider-visible tool name 尽量使用可读长名。
- [x] 保持 provider name 到 `toolId` 的稳定映射。
- [x] `praxis_ephemeral_procedure` 和 `praxis_request_approval` 保留 provider 可见，但归入 runtime decision tool 区。

### 3.2 Claude / Gemini 后续一致化

- [x] Claude lowering：`name`、`description`、`input_schema`。
- [x] Gemini lowering：`functionDeclarations`、`functionCall`、`functionResponse`。
- [x] 三家 raise 回统一 `ModelDecision.toolCall`。
- [x] 三家 tool result lowering 都走统一 `lowerProviderToolResult(...)`。

验证：`node --import tsx --test test/agentCore/agent_modelAdapter/route/openaiCompatibleChat.test.ts test/agentCore/agent_executionEngine/coreLogic/modelDecision.test.ts test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`、`npm run typecheck`、`git diff --check`。

### 3.3 Inspection

- [x] `rax inspect` 显示 provider tool count。
- [x] 显示被折叠工具数量、展开工具数量。
- [x] 显示 schema sanitizer 改动。
- [x] 显示 provider schema rejected risk。
- [x] 显示 provider cache prefix health。

实现落点：`createFrameworkInspectionReport(...).providerToolSchema` 输出三家 provider target 的 tool count、mapping count、runtime decision tool count、declaration hash、sanitized tool count、schema rejected risk 与 cache prefix health。

验证：`node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.inspection/frameworkInspectionReport.test.ts test/agentCore/agent_modelAdapter/route/openaiCompatibleChat.test.ts`、`npm run typecheck`、`git diff --check`。

## 4. Tool Result 回填

工具执行结果应优先走 provider-native tool result / functionResponse，而不是只靠 PromptPack observation 重建。

- [x] Kernel 接入 `lowerProviderToolResult(...)`。
- [x] OpenAI/Codex tool result 回填到下一轮 provider request。
- [x] Claude tool result 回填为 `tool_result` block。
- [x] Gemini tool result 回填为 `functionResponse` part。
- [x] PromptPack observation 保留为审计、恢复、CMP 输入。
- [x] 工具成功后，模型必须能基于 tool result 继续回答或重规划。
- [x] 工具失败后，失败信息也应回给模型作为 observation，而不是默认终止。

验证：`node --import tsx --test test/agentCore/agent_modelAdapter/route/openaiCompatibleChat.test.ts test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`、`npm run typecheck`、`git diff --check`。

## 5. Text Fallback 收口

Text fallback 是调试兜底，不是正式成功路径。

- [x] 关闭 provider-native tool call 成功后的文本推断 fallback。
- [x] fallback 只在 `--no-provider-tools` 时启用，或 provider 明确没有返回 tool call 且输出合法 fallback request 时启用。
- [x] fallback 结果标记为 `debug/degraded`。
- [x] fallback 成功不能计入最终 `modelDialogueReady`。
- [x] fallback 失败必须给出 public-safe 错误。

验证：`node --import tsx --test test/agentCore/agent_runtimeImplementation/textFallbackPolicy.test.ts`、`npm run typecheck`、`git diff --check`。

## 6. MainLoop 正式接管

`mainLoop.ts` 已有 runner、turn preparation、adjudication、behavior registry 等正式结构。下一步是让 Kernel 逐步退成 orchestrator。

- [x] 复核当前新版 `mainLoop.ts`，以当前代码为准，不沿用旧 shim 判断。
- [x] Kernel 不再新增 provider parsing、tool semantics、prompt construction。
- [x] 真实 turn lifecycle 下沉到 `coreLogic/mainLoop.ts`。
- [x] final output 必须经过 `runtime adjudication`。
- [x] pending approval 时不得直接 final。
- [x] unresolved procedure 时不得直接 final。
- [x] critical tool failure 时不得直接 final。
- [x] 工具失败后支持：failure observation -> model replan。
- [x] `APPROVAL_REQUIRED` 进入中断等待，approval 返回后进入下一 loop。
- [x] MainLoopStepRecord 保留完整链路：prepareTurn、assemblePromptPack、buildCachePlan、modelInvocation、decision、tool/procedure、observation、state/event。

验证：`node --import tsx --test test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts test/agentCore/agent_executionEngine/coreLogic/mainLoop.test.ts`、`npm run typecheck`、`git diff --check`。

## 7. Sandbox / Governance

Sandbox 不能只停留在 `hostObserved` 声明。

- [x] `hostObserved` 文档明确：它是观察治理，不是真隔离。
- [x] `workspaceOnly` 实际约束 filesystem/shell/code 的读写根。
- [x] `linuxBubblewrap` 作为 Linux 第一条真隔离路线。
- [x] fullstack 可选择 `linuxBubblewrap` 作为推荐安全 profile。
- [x] shell/filesystem/code 执行读取 sandbox readiness。
- [x] policy allow 不等于 sandbox allow。
- [x] sandbox block 要回给模型作为可解释 observation。
- [x] computeruse 设备权限必须经过 interface approval 和 provider readiness。
- [x] 禁止用 runtime 假授权冒充系统授权。

验证：`node --import tsx --test test/agentCore/agent_runtimeImplementation/runtimeSandboxProvider.test.ts test/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.test.ts test/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.test.ts test/agentCore/agent_runtimeImplementation/runtime.inspection/frameworkInspectionReport.test.ts`、`npm run typecheck`、`git diff --check`。

## 8. Dependency Runtime

依赖系统不能产生假阳性。

- [x] unknown dependency 不再默认为 available。
- [x] unknown dependency 进入 unknown/missing/selfRepair。
- [x] 增加 dependency mode：`auto` 和 `full`。
- [x] `auto`：用到时中断安装，再恢复 loop。
- [x] `full`：`rax build init` 或 `rax test` 阶段预装。
- [x] 尽可能准备常用依赖：`rg`、LSP server、`bwrap`、`ffmpeg`、`imagemagick`、`xdotool`、`ydotool`、MCP test server。
- [x] 系统级安装必须走 approval/selfRepair envelope。
- [x] 不做静默系统级副作用。

实现落点：`BaseToolDependencyRuntime` 现在只信任 `BaseToolSupportCatalog` 已证明可用的 executor/runtime/permission support；未登记的 runtime contract 会进入 `unknown`，不会再因为缺少 probe 被当成 available。可信 managed install 支持 `auto`、`full`、`autoInstallTrustedManaged`，系统级安装保持 approval/selfRepair 边界。`dependencySourceRegistry` 已登记 `rg`、LSP server、`bwrap`、`ffmpeg`、`imagemagick`、`xdotool`、`ydotool`、MCP echo test server 的来源或探测合同。

验证：`node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolDependencyRuntime.test.ts test/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.test.ts`、`npm run typecheck`、`git diff --check`。

## 9. 63 个 Strict Smoke 缺口清零

当前缺口集中在 `code`、`computeruse`、`mcp`、`search`。

### 9.1 code

- [x] `code.modify` 真实 smoke。
- [x] `code.overwrite` 真实 smoke。
- [x] `code.replaceFile` 真实 smoke。
- [x] `code.delete` 真实 smoke。
- [x] `code.format` 真实 smoke。
- [x] `code.testCode` 真实 smoke。
- [x] `code.benchmark` 真实 smoke。
- [x] `code.debugRun` 真实 smoke。
- [x] `code.debugCaptureState` 真实 smoke。
- [x] `code.debugCollectLogs` 真实 smoke。
- [x] 所有 `code.lsp_*` 真实 smoke。
- [x] 建通用 LSP manager，参考 VSCode 思路。
- [x] LSP 支持 `auto` / `full` 依赖准备模式。

验证：`node --import tsx scripts/agentCore_Agent_Test/agentcore_codebase_explore_live_matrix.ts --no-model`，结果 `total=29 passed=29 failed=0`；`npm run test:agentCore:all-tools-matrix` 覆盖 code 29/29；`npm run test:agentCore` 覆盖 shared stdio LSP runtime 与 workspace-level server auto-resolve。

### 9.2 computeruse

- [x] `mouseMove` 真实 smoke。
- [x] `mouseClick` 真实 smoke。
- [x] `mouseScroll` 真实 smoke。
- [x] `keyboardEmulation` 真实 smoke。
- [x] `keyboardInputEmulation` 真实 smoke。
- [x] `keyboardSubmitInput` 真实 smoke。
- [x] `checkboxConfirm` 真实 smoke。
- [x] `inputCheckboxConfirm` 真实 smoke。
- [x] `cursorLocate` 真实 smoke。
- [x] Linux desktop adapter 识别 Wayland/X11。
- [x] `xdotool` / `ydotool` / screenshot provider 进入 dependency readiness。
- [x] 高风险输入动作必须 explicit permissive 或 approval。

验证：`node --import tsx scripts/agentCore_Agent_Test/agentcore_computeruse_live_matrix.ts --no-model`，结果 `total=32 passed=32 failed=0`；matrix 覆盖 computeruse 32/32。当前 smoke 使用 deterministic Linux desktop host adapter，不冒充真实 OS 指针/键盘系统授权。

### 9.3 mcp

- [x] 外部真实 MCP 服务 smoke（非 deterministic local）。
- [x] 打通真实 MCP stdio。
- [x] 打通真实 MCP SSE/HTTP。
- [x] `connect`、`disconnect`、`listTools`、`call`、`readResource`、`listResources`、`subscribe`、`stream`、`ping`、`healthCheck` 全部 smoke。
- [x] MCP auth/cache/resource/subscription 进入 session/state/event。
- [x] 不绕过 MCP BaseTool handler。

验证：`node --import tsx scripts/agentCore_Agent_Test/agentcore_mcp_live_matrix.ts --no-model`，结果 `total=23 passed=23 failed=0`；matrix 覆盖 mcp 23/23。`node --import tsx scripts/agentCore_Agent_Test/agentcore_mcp_external_transport_smoke.ts --no-model --npm-filesystem` 通过独立 stdio 子进程、真实 localhost HTTP/SSE 服务，以及 `npx -y @modelcontextprotocol/server-filesystem` 外部 npm MCP 服务验证 `total=12 passed=12 failed=0`，且仍走 `registry -> handler -> executor -> BaseToolExecutorPort.mcp.*`。

### 9.4 search

- [x] `search.fetch` 真实 smoke。
- [x] `search.searchEngine` 真实 provider/runtime smoke。
- [x] `search.nativeSearch` 走 provider native tool，但由 Praxis BaseTool 做传参接口和结果整形。
- [x] `search.ground` 真实 grounding smoke。
- [x] search 失败必须区分 provider rejected、permission denied、domain blocked、network unavailable。

验证：`node --import tsx scripts/agentCore_Agent_Test/agentcore_search_live_matrix.ts --no-model`，结果 `total=4 passed=4 failed=0`；matrix 覆盖 search 4/4。

## 10. Family Completion Rules

### shell

- [x] background / interactive / detach / process lifecycle 必须真执行。
- [x] shell 高危命令 hard block 或 approval。
- [x] shell 结果必须可回填给模型。

验证：`npm run test:agentCore:all-tools-matrix` 中 shell family `total=32 passed=32 failed=0`。

### git

- [x] 所有写操作在临时 repo 真跑。
- [x] commit / branch / stash / remote 等操作固定 action mapping，不给模型任意 git 执行口。
- [x] 真实工作区破坏性操作默认审批。

验证：`npm run test:agentCore:all-tools-matrix` 中 git family `total=35 passed=35 failed=0`。

### omni

- [x] 本地能做的优先本地做。
- [x] 压缩/转换走 `ffmpeg` / `ImageMagick`。
- [x] OpenAI image/vision 作为第一模型后端。
- [x] 产物写入 `.rax_workspace/artifacts`，返回 artifact id。

验证：`npm run test:agentCore:all-tools-matrix` 中 omni family `total=14 passed=14 failed=0`。

### skill

- [x] 定位为本地 md/上下文增删改查和注入。
- [x] 不算模型能力。
- [x] `skill.ripgrep` 走本地搜索。
- [x] skill 写入类使用临时 skill root 测试，不污染真实 `~/.codex/skills`。

验证：`npm run test:agentCore:all-tools-matrix` 中 skill family `total=6 passed=6 failed=0`。

## 11. Realtest / CLI

- [x] `rax test fullstack --all-testable` 默认全测 176 个工具。
- [x] fullstack 输出完整 `tool reality report`。
- [x] 按 family/group/tool 展开 readiness。
- [x] minimal 只测 selected tools。
- [x] fullstack 测全部工具和全部 policy/sandbox/interface 路径。
- [x] live 对话验收：所有 selected/fullstack tools 要么成功，要么可解释失败。
- [x] 每族至少一条自然语言 dialogue gate：code、shell、git、search、mcp、omni、computeruse、skill。

验证：`bin/rax test realtest/fullstack --all-testable --json` 输出 `toolReadiness.total=176`、`ready=176`、每个 tool 带 `family/group/stages/dependencyStatus/executorSupport`；`bin/rax test realtest/minimal --json` 输出 selected tool readiness `total=2`；`node --import tsx --test test/agentCore/rax_packageManager/raxBuildInit.test.ts` 覆盖 `rax test --all-testable reports the full 176 BaseTool readiness matrix`。

live 验证：`AGENTCORE_CODEX_AUTH_FILE="$HOME/.codex/auth.json" AGENTCORE_CODEX_MODEL="gpt-5.5" AGENTCORE_CODEX_REASONING_EFFORT="low" OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS="1200" npm run chat:realtest:fullstack -- --all-testable --policy=permissive --verbose`；模型在自然语言任务中主动调用 `shell.commandExecution` 定位仓库，再调用 `code.read` 读取 `package.json`，工具结果回填后总结出 `chat:realtest:minimal` 与 `chat:realtest:fullstack`。

## 12. ToolSkill / Markdown 说明

- [x] 每个工具必须有 `<toolId>.md`。
- [x] 每个 `<toolId>.md` 包含：用途、何时用、参数、返回、危险点、失败解释、示例。
- [x] 每个 family 有 family index。
- [x] 每个 group 有 group index。
- [x] family/group/tool markdown 进入 Tool Context Folding。
- [x] `rax inspect` 显示当前 agent 的工具展开树。
- [x] `rax inspect` 显示热度分、cache 风险、折叠/展开原因。

## 13. Provider Trio 后续

- [x] Codex live 链路先完全打稳。
- [x] Claude 做 schema lowering/raising fixture。
- [x] Gemini 做 schema lowering/raising fixture。
- [ ] Claude/Gemini 后续再做 live。
- [x] Provider adapter 读取 PromptPack cache plan，不在 core 里写 provider 私有缓存逻辑。

阻塞说明：当前环境探测 `ANTHROPIC_API_KEY`、`CLAUDE_API_KEY`、`GEMINI_API_KEY`、`GOOGLE_API_KEY`、`GOOGLE_GENAI_API_KEY`、`GOOGLE_GENERATIVE_AI_API_KEY` 均缺失，因此 Claude/Gemini live 不能在本轮伪造通过；保持未勾，等真实凭据或 modelAdapter auth route 产物接入后再跑 live smoke。

## 14. TAP / CMP / MP / Multiagent 预留

本轮不实现具体高级模块，但必须保证未来接入不破坏 agentCore。

- [x] TAP 作为工具能力进入 capability tree，但不能破坏 BaseTool 稳定前缀。
- [x] CMP 后续接管 `session-summary` / `context-managed`。
- [x] MP 后续接管 `memory-retrieval`。
- [x] Multiagent 后续通过 Manifest/runtime/interface/governance/storage/session/state 合同进入。
- [x] 不给任何未来模块开隐藏后门。

验证：`node --import tsx --test test/agentCore/agent_executionEngine/promptPack/promptAssembler.test.ts test/agentCore/agent_executionEngine/coreLogic/observationIntegrator.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/tapRuntimeBridge.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/cmpRuntimeBridge.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/mpRuntimeBridge.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/multiagentRuntimeBridge.test.ts test/agentCore/rax_packageManager/raxDeveloperCommandContract.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleCapabilityContract.test.ts` 通过 33/33。PromptPack capability segment 强制 `BaseTool -> TAP -> MCP -> dynamic external`，CMP summary delegation 和 MP fallback memory takeover ref 已进入 observation/material 合同，TAP/CMP/MP/multiagent bridge 均为 contract-only dry-run 计划，不实现具体高级策略。

验证：`node --import tsx --test test/agentCore/rax_packageManager/raxDeveloperCommandContract.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleRuntimeSurface.test.ts test/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/officialModuleCapabilityContract.test.ts` 通过 9/9；验证 rax inspect/test/run/build 使用 framework API，不走 runtime backdoor，official module runtime surface 只暴露 governance/event/state/invocation 等受治理入口，capability contract 会先做 scope/runtime-state 校验。

## 15. 推荐实施顺序

1. Tool Context Folding + PromptPack 注入。
2. Core prompt 工具使用引导与幻觉抑制。
3. Provider-native tool result 回填。
4. Text fallback 收口。
5. Dependency false-positive 修正。
6. Sandbox/governance 与工具主链联动。
7. 清零 63 个 strict smoke 缺口。已完成：`matrixCoverage.covered=176`、`missing=0`。
8. realtest/fullstack 全量 reality report。
9. Codex live natural-language dialogue gates。
10. Claude/Gemini schema fixture 和后续 live 扩展。

## 16. 最终完成定义

当以下命令全部通过，才算 BaseTool 全量收尾完成：

```bash
npm run typecheck
npm run test:agentCore:all-tools-matrix
npm run test:agentCore
git diff --check
```

并且：

```text
matrixCoverage.covered = 176
matrixCoverage.missing = 0
fullstack selected/all-testable tools all success or public-safe explainable failure
Codex live provider can naturally call tools and receive provider-native tool results
```
