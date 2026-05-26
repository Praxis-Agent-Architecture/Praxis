# baseToolRuntimeGovernance

> 对应源码：`src/runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 当前文件：`runtime.execEngine/baseToolRuntimeGovernance.ts`。
- 角色概括：BaseTool runtime 调用前的治理解释层。

## 2. 文件职责

这个文件按 `family / group / toolId`、BaseTool 支持目录、policy matrix、sandbox profile、readiness 和资源限制，解释一次 BaseTool 调用是允许、拒绝，还是需要 approval。

白话说，它不是工具脑子，而是 runtime 治理门卫：工具怎么做仍然归 storage handler；这层只判断当前 runtime 是否应该放行、记录、审批或拒绝，并输出稳定契约给 Kernel、event log、approval surface 和 session store。

## 2.1 文件名语义拆解

- `baseTool`：治理对象是现有 176 个 storage-backed BaseTool handler，不是 TAP 高级工具。
- `Runtime`：判断发生在运行态，需要结合 session、sandbox、policy、readiness 和 resource context。
- `Governance`：输出治理契约，包括 allow / deny / requiresApproval，而不是执行工具语义。

## 3. 目录语义

该文件位于 `runtime.execEngine`，因为它夹在执行引擎的 tool invocation bridge 与 BaseTool mount 之间。它服务 runtime 执行面，但不进入 `basic_toolLayer` 改写 BaseTool 语义。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / BaseTool 治理面。
- 核心目的：按 family/group/toolId 与 policy matrix 解释一次 BaseTool 调用是否允许、需要审批或拒绝。
- 能力要求1：把 BaseTool policy profile、sandbox、readiness 和 resource limit 合并成 public-safe 决策。
- 能力要求2：让 Kernel 和 EphemeralProcedure 在 invokeMountedBaseTool 前走同一个治理入口。
- 边界：只做 runtime 治理和审计解释，不替代 BaseTool handler 语义，不绕过 registry/handler/executor 链。
- 对接：需要服务 PraxisRuntimeKernel、runtimeSessionStateEventStore、approval surface 和 BaseTool runtime mount。
- 实现提示：先输出稳定 governance decision，再由 Kernel 负责 approval envelope、event/session persistence 和实际 mount 调用。

## 5. 需要提供的能力

- 使用现有 BaseTool 分类轴：`family / group / toolId`。
- 支持 `safe / risky / dangerous` 风险归一化。
- 支持 `bapr / yolo / permissive / standard / restricted / codingAgentFull` 等 policy profile。
- 保留 `host-observed` sandbox 元数据，明确“宿主可观察但无真实容器隔离”。
- 接收 BaseTool readiness preflight，阻断不可用 provider。
- 输出 public-safe governance decision，供 Kernel、event log、approval plane 和 observation material 使用。

## 6. 输入边界

- 输入必须包含 `toolId`、`BaseToolPolicyMatrixSpec` 和 `SandboxSpec`。
- 可选输入包括 readiness preflight、support catalog entry、resource limits 和 metadata。
- policy lookup 只允许按 `family / group / toolId / action risk`，不按 executor namespace 重新分类。
- readiness 可影响不可用阻断，但不替代 policy matrix 对 approval 的最终声明。

## 7. 输出边界

- 输出 `BaseToolRuntimeGovernanceDecision`。
- 输出只包含 public-safe 字段：toolId、family/group、risk、status、policy profile、sandbox 摘要、readiness 摘要、resource limits、events 和 metadata。
- 输出不包含 raw secret、provider private material、host file handle 或 BaseTool handler 内部对象。

## 8. 错误边界

- readiness `blocked` 必须拒绝。
- policy `approval` 必须转成 approval request，由 Kernel/interface surface 接走。
- 未匹配具体 rule 时使用 policy matrix 的 defaultDecision。
- 所有错误原因必须 public-safe，不能泄漏 raw provider response 或宿主执行细节。

## 9. 依赖对象

- `BaseToolSupportCatalogEntry` 和 readiness preflight。
- `BaseToolPolicyMatrixSpec` 与 `SandboxSpec`。
- BaseTool definition 的风险级别。
- 下游调用者包括 `PraxisRuntimeKernel`、BaseTool runtime mount、approval surface 和 session/event store。

## 10. 被谁调用

- `PraxisRuntimeKernel` 在执行 model 请求的 BaseTool 前调用。
- EphemeralProcedure step 经 Kernel 执行 BaseTool 前调用。
- 后续 governance/inspection/debug surface 可以用它解释“为什么这次工具能或不能执行”。

## 11. 不应该做什么

- 不重写 BaseTool handler。
- 不绕过 `adaptRuntimeToolInvocation -> bridgeExecEngineInvocation -> createBaseToolRegistry().lookupHandler -> BaseToolHandler.invoke({ executor }) -> BaseToolExecutorPort.*`。
- 不按 executor namespace 建第二套工具分类。
- 不实现真实 sandbox 容器。
- 不实现 TAP/CMP/MP/multiagent 具体能力。

## 12. 最小实现建议

- 先输出稳定治理决策，再由 Kernel 负责 approval envelope 与 session/event persistence。
- policy rule 优先级应保持 `toolId > group > family > action risk > defaultDecision`。
- readiness `blocked` 是硬阻断；approval 由 policy matrix/profile 决定，避免 readiness 自己绕过用户声明的 profile。
- host-observed 只描述“无容器但可治理可审计”，不要伪装成真实隔离。

## 13. 最小测试建议

- 测 bapr safe pass。
- 测 restricted approval。
- 测 readiness blocked。
- 测 Kernel 中 BaseTool approval pending/resolver continuation。
- 测 EphemeralProcedure step 仍然经由 runtime mount 执行。

## 14. 与系统链路的关系

它位于 `ModelDecision -> BaseTool governance -> approval/session/event -> invokeMountedBaseTool -> observation material` 的中间层，让当前 semantic basetool catalog 从“能挂载”变成“能被 runtime 统一治理、解释、审计”。旧 176-tool baseTools 路线只作为迁移背景，不再是当前 basetool 完成度口径。
