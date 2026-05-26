# baseToolSupportCatalog

> 对应源码：`src/runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 所属路径：`agent_runtimeImplementation/runtime.execEngine`。
- 当前文件：`baseToolSupportCatalog.ts`。
- 角色概括：按 semantic basetool catalog 的 family/group/toolId 和 runtime port 契约生成 runtime 支持目录。

## 2. 文件职责

这个文件负责把 `src/basetool/catalog.ts` 中的 compact semantic basetool catalog 汇总成 runtime 可检查的支持目录。

它不重新分类工具，不按 `BaseToolExecutorPort` namespace 建第二套工具层，而是读取每个 semantic definition 中的 `runtimePorts` / `dependencies` 契约，形成 `family/group/toolId -> required support -> readiness` 的稳定视图。

## 2.1 文件名语义拆解

- 原始文件名：`baseToolSupportCatalog.ts`。
- 命名片段：`base` / `Tool` / `Support` / `Catalog`。
- 工程含义：这是 runtime 中 `runtime.execEngine` 表面下的 baseTool 支持目录，服务运行时检查、调试、治理和挂载解释。
- 第一实现重点：证明 24 个 semantic tools 都能被目录收纳，且 `officeBase` 不混入核心 basetool 口径。
- 边界提醒：runtime 是承托面，不应吞并 executionEngine、modelAdapter、interfaceAdapter 的内部实现。

## 3. 目录语义

- 执行引擎运行绑定层：把 executionEngine 的基础工具能力安全拉入 runtime 生命周期、状态和调用面。
- 本文件只描述 baseTool runtime support，不保存工具执行结果，不创建 host adapter。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / semantic basetool 支持目录。
- 核心目的：把 src/basetool 的单一事实源投影为 runtime 可检查的支持、readiness 和挂载契约目录。
- 边界：这里只做 runtime 支持状态投影，不重新定义工具语义。
- 对接：服务 BaseTool 挂载前置检查、reality ledger、inspection 和 application 调试面。
- 实现提示：以 src/basetool/supportCatalog.ts 为唯一实现源，runtime.execEngine 这里只保留兼容导出。

## 5. 需要提供的能力

- 生成 semantic basetool runtime support catalog。
- 按 storage family、group、toolId 暴露分类，不把 executor port 当分类主轴。
- 从 handler definition dependencies 中提取 runtime support、permission、provider carrier、host dependency。
- 给每个支持项标记 `available`、`unavailable`、`disabled`、`requiresApproval` 或 `notImplemented`。
- 提供 runtime preflight：调用前判断某个 toolId 是否缺真实 executor support，区分“有函数形状”和“有真实 runtime/backend 实现”。
- 对单个语义工具覆盖多个 runtime port 的场景支持输入敏感 preflight，例如 `mcp.resources` 的 `list` 只要求 `mcp.listResources`，`read` 才要求 `mcp.readResource`。
- 输出总数、family 分布和 readiness 分布，供 runtime inspection/debug 使用。

## 6. 输入边界

- 可选的 `BaseToolExecutorPort`，只用于判断某些 port method 是否已经挂载。
- 可选的 `implementedPortPaths`，用于声明哪些 port 不是单纯占位/委托壳，而是当前 runtime 已真实实现或已注入 backend。
- 可选的 `toolInput`，用于判断本次调用实际需要哪一组 runtime port。
- 可选的 disabled / approval / status override，用于 runtime 治理和检查场景。
- 输入不应包含 TAP office 包、用户 agent 配置或执行结果。

输入边界必须窄：目录只解释当前 baseTool 支持合同，不启动工具、不访问文件系统、不读 package 源。

## 7. 输出边界

- `BaseToolSupportCatalogEntry[]`：每个 baseTool 的 family/group/toolId、依赖合同和 readiness。
- `BaseToolSupportCatalogSnapshot`：总量、family 分布、readiness 分布。
- `BaseToolRuntimeReadinessPreflight`：单个 toolId 的调用前管理结论，包括 `allowed`、`requiresApproval` 或 `blocked`。
- 输出必须可被 runtime、inspection、debug 和测试稳定消费。

## 8. 错误边界

- 本文件保持纯计算路径，不抛 host 执行错误。
- 缺失 executor method 时返回 `notImplemented`，不伪装成可执行。
- executor method 只是 delegated unavailable 壳时，如果调用方没有把该 port 放进 `implementedPortPaths`，preflight 会把它当作 `notImplemented`。
- permission 合同默认标记 `requiresApproval`，不在目录层替治理做批准。

## 9. 依赖对象

- `semanticBaseToolCatalog`
- `BaseToolDefinition.runtimePorts`
- `BaseToolDefinition.dependencies`
- `BaseToolExecutorPort`
- runtime.contractSurface
- runtime.governancePlane
- runtime.invocationMethod

依赖关系通过显式导入和参数进入，不读取隐藏全局配置。

## 10. 被谁调用

- runtime.execEngine 的 baseTool mount / factory。
- runtime inspection 和 debug surface。
- 后续 applicationSurface、officialModuleSurface、governancePlane 的 readiness 检查。

调用方只能依赖本文件公开的 catalog 类型和 snapshot 函数。

## 11. 不应该做什么

- 不要直接执行工具。
- 不要生成大量手写 wrapper。
- 不要把 `officeBase` TAP 能力混入核心 semantic basetool catalog。
- 不要让 port namespace 替代 `family/group/toolId` 的 storage 分类。

## 12. 最小实现建议

- 以 `semanticBaseToolCatalog` 为唯一工具集合来源。
- 从 semantic definition 读取 family/group/storageFamily。
- 从 runtimePorts 和 dependencyId 中提取 `BaseToolExecutorPort.*` 支持项。
- 对非 port 依赖保留原合同，并给出 runtime 可解释状态。
- 在 mount 调用前使用 `evaluateBaseToolRuntimeReadiness(...)` 拦截缺真实 executor support 的工具，避免 handler 才发现 provider 不存在。

## 13. 最小测试建议

- 验证 catalog 总数为 24。
- 验证没有 `office` family。
- 验证每个 semantic tool 都有 catalog entry。
- 验证 `shell.run`、`file.read`、`file.search`、`web.fetch` 等典型工具能提取正确 support。
- 验证 `agent.spawn` 这类 application/runtime adapter port 在没有 backend 时被 preflight 判定为 blocked。

## 14. 与系统链路的关系

它属于 runtime 主干：catalog 解释 baseTool 需要哪些 runtime support，factory 负责构造 executor port，mount 负责把请求送进 registry handler。
