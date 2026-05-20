# dependencySourceRegistry

> 对应源码：`src/agentCore_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/toolDependency`。
- 当前文件：`dependencySourceRegistry.ts`。
- 角色概括：基础工具依赖源注册表，负责可信源、安装目标和安装计划。

## 2. 文件职责

管理可信依赖源、安装目标、版本策略和可审计安装计划。

## 2.1 文件名语义拆解

- `dependencySource`：依赖来自哪里。
- `Registry`：以内置注册表保存可信 recipe。
- 工程含义：让 toolDependency 知道哪些依赖可以装到 Praxis managed 目录，哪些只能检测或需要治理确认。

## 3. 目录语义

- 基础工具原语层：提供 Agent 成立所需的底层工具能力，让 TAP 在其上构建更高级工具治理系统。
- 工具依赖面：描述基础工具运行所需依赖、环境和可用性。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 工具依赖管理层 / 依赖源注册表。
- 核心目的：管理可信依赖源、安装目标、版本策略和可审计安装计划。
- 能力要求1：需要把内置依赖源和用户/系统越界源明确分级。
- 能力要求2：正常 Praxis managed 安装不交给 TAP，越界安装才进入治理确认。
- 边界：只生成依赖源和安装计划，不直接执行安装命令。
- 对接：被 dependencyChecker、dependencyIterationManager 和 LSP runtime 前置依赖链消费。
- 实现提示：优先保持 registry 数据驱动，避免把不同语言的安装逻辑散落到工具实现里。

## 5. 需要提供的能力

- 管理可信依赖源、安装目标、版本策略和可审计安装计划。
- 标记 `trusted-managed`、`trusted-detect-only`、`custom-source`、`system-global`。
- 为缺失依赖生成不执行副作用的安装计划。

## 6. 输入边界

- dependencyId、安装目标、managed root、环境变量和可选 source override。

## 7. 输出边界

- 标准安装计划、probe 命令、approvalRequired 标记和审计 metadata。

## 8. 错误边界

- 未注册依赖、不可自动安装的 detect-only 依赖、越界安装目标。

## 9. 依赖对象

- Node path 工具。
- 内置 source registry。

## 10. 被谁调用

- dependencyChecker
- dependencyIterationManager
- LSP runtime 前置依赖链

## 11. 不应该做什么

- 不直接执行安装命令。
- 不在这里处理 TAP 高级工具系统。
- 不允许开放式任意源静默安装。

## 12. 最小实现建议

- 以数据注册表保存 source entry。
- 使用纯函数生成 install plan。
- 把越界条件明确写进 approvalRequired。

## 13. 最小测试建议

- trusted managed 生成无审批安装计划。
- detect-only 不生成自动安装。
- 未注册源返回 public-safe 错误。
- Linux 桌面截图这类复合能力用一个 detect-only dependency id 表示，由 probe 检查 portal、Wayland CLI、GNOME CLI、X11 CLI 等可用 Provider，而不是让 baseTool 或提示词写死某个工具。

## 14. 与系统链路的关系

它是 toolDependency 的依赖源治理层，让 checker/iteration/runtime 都消费同一套来源事实。
