# baseToolExecutorPortFactory

> 对应源码：`src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.ts`

核心目的：从 runtime context 构造 `BaseToolExecutorPort` 契约，让 semantic basetool 通过注入端口接触宿主能力。

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 所属路径：`agent_runtimeImplementation/runtime.execEngine`。
- 当前文件：`baseToolExecutorPortFactory.ts`。
- 角色概括：从 runtime context 构造完整 `BaseToolExecutorPort`，让 baseTool handler 通过注入端口接触宿主能力。

## 2. 文件职责

这个文件负责创建 runtime-owned `BaseToolExecutorPort`。

它只提供宿主能力插座和第一批真实 adapter，不承载 baseTool 的高层语义。具体工具的输入校验、provider 选择、结果归一化属于 `src/basetool/core/*` 和 semantic registry。

## 2.1 文件名语义拆解

- 原始文件名：`baseToolExecutorPortFactory.ts`。
- 命名片段：`base` / `Tool` / `Executor` / `Port` / `Factory`。
- 工程含义：这是 runtime 中 `runtime.execEngine` 表面下的 executor port 构造器。
- 第一实现重点：filesystem、shell、process、git、ripgrep、network.fetch、plan/tool/runtime helper 可以真实执行；其他能力先稳定返回 unavailable 或委托给注入 backend。
- 边界提醒：runtime 是承托面，不应吞并 executionEngine、modelAdapter、interfaceAdapter 的内部实现。

## 3. 目录语义

- 执行引擎运行绑定层：把 executionEngine 的基础工具能力安全拉入 runtime 生命周期、状态和调用面。
- 本文件和 `baseToolSupportCatalog.ts` 配套：catalog 解释需要什么，factory 提供实际插座。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / semantic basetool executor port 工厂。
- 核心目的：从 runtime context 构造 BaseToolExecutorPort 契约，让 semantic basetool 通过注入端口接触宿主能力。
- 边界：承托和治理运行态，不在 factory 内实现单个工具的高层语义。
- 对接：服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
- 实现提示：真实可用端口和稳定 unavailable fallback 必须可区分，避免 readiness 把缺 adapter 的工具误报为 ready。

## 5. 需要提供的能力

- `createRuntimeBaseToolExecutorPort(context)` 返回完整 `BaseToolExecutorPort`。
- `listRuntimeBaseToolImplementedPortPaths(context)` 返回当前 runtime 内建 adapter 加注入 backend adapter 的真实 port 列表，供 support catalog / mount preflight 使用。
- 第一批真实 adapter：filesystem read/write/delete/list、shell.run、process.run/wait/kill、git.runGit、search.ripgrep、network.fetch、plan.update、tool.discover、tool.describe、sandbox.run、output.truncate。
- `mcpServers` 配置存在时，通过 `mcpRuntimeAdapter` 挂载 MCP stdio/http/sse provider，并暴露 semantic catalog 使用的 `mcp.call` / `mcp.listResources` / `mcp.readResource` 端口。
- 未实现 adapter 若有 `context.adapters` 注入 backend，则先委托 backend；否则返回 public-safe `PROVIDER_UNAVAILABLE`。
- 对 shell/process/git/filesystem write/delete/ripgrep 做最小 runtime policy gate。
- 发出 runtime event，供后续审计、检查、debug 串接。

## 6. 输入边界

- `runtimeId`、`sessionId`。
- runtime policy：workspaceRoot、allowedRoots、是否允许 shell/git/process/filesystem write/delete/ripgrep。
- resource limits：timeout、输出字节数、读取字节数、目录列举数量。
- mcpServers：可选 runtime-owned MCP server profiles，用于把 stdio/http/sse MCP server 接入 `mcpRuntimeAdapter`。
- adapters：可选 backend port 注入，用来承托 MCP、LSP、computer、media、skill 等需要专门 runtime surface 的能力。
- event sink：只接收 public-safe runtime executor event。

输入边界必须窄：factory 不接收 AgentObject、Manifest 全量对象或 TAP 策略对象。

## 7. 输出边界

- 完整 `BaseToolExecutorPort`。
- 每个 port method 返回 `BaseToolExecutorResult`。
- 成功输出只包含该 port 的稳定 envelope，失败输出必须 public-safe。

## 8. 错误边界

- policy 未允许时返回 `GOVERNANCE_REJECTED`。
- 路径越界时返回 `SCOPE_REJECTED`。
- 未实现能力返回 `PROVIDER_UNAVAILABLE`。
- 真实 host 执行失败返回 `PROVIDER_FAILURE` 或 `EXECUTION_TIMEOUT`，不泄漏 raw stack。

## 9. 依赖对象

- Node filesystem API。
- Node child_process spawn。
- `BaseToolExecutorPort` 类型。
- runtime.contractSurface
- runtime.governancePlane
- runtime.invocationMethod
- Node child_process 只作为 runtime-owned process adapter 使用；baseTool storage 层不得直接持有进程对象。

依赖关系通过显式 context 和 runtime policy 进入，不从 baseTool 内部偷偷读取全局权限。

## 10. 被谁调用

- `invokeMountedBaseTool` 的调用方。
- runtime composition root。
- runtime inspection/debug 中需要构造或探测 baseTool executor 的位置。
- 后续 officialModuleSurface 在需要使用 baseTool 时也应经由 runtime。

## 11. 不应该做什么

- 不要在 factory 内实现每个 tool 的高层语义。
- 不要替 TAP 做高级工具策略。
- 不要替 storage core 做参数校验、dry-run 语义或 fallback 选择。
- 不要静默允许 shell、git、process 或写文件副作用。

## 12. 最小实现建议

- 先创建完整 port shape，保证缺能力是稳定 unavailable，而不是 undefined。
- 第一批 adapter 只接 OS/filesystem/process/git/ripgrep 的最小安全路径。
- background/detached 进程必须经过 policy gate、allowedRoots、sandbox 适配和启动期失败检测；成功 envelope 要保留 handle/pid/lifecycle，并把用户可达性标记为未验证，等待上层做 HTTP、浏览器或日志读回。
- 所有真实副作用都经过 context policy 和 allowedRoots。
- MCP 可通过 `mcpServers` 接入 runtime-owned stdio/http/sse adapter；agent/context/skill/LSP/media/work 等仍按专用 runtime surface 或 application adapter 逐步补齐。

## 13. 最小测试建议

- 验证完整 port namespace 和 unavailable fallback。
- 验证 filesystem read/write 能被 `file.read`、`patch.apply` handler 经 runtime mount 调用。
- 验证 shell/git/process/ripgrep/network.fetch adapter 能返回稳定 envelope。
- 验证注入 backend adapter 时，未内建的长连接能力可以被 runtime 委托，而不是缺字段。
- 验证 policy 拒绝不会抛 raw error。
- 验证未配置 adapter 的能力不会被 support catalog 误判为 ready。

## 14. 与系统链路的关系

它属于 runtime 主干：factory 提供 executor port，baseToolRuntimeMount 保持 registry/handler 调用链，storage core 仍然持有工具语义。
