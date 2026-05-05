# runtimeSessionStateEventStore

> 对应源码：`src/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 当前文件：`runtimeSessionStateEventStore.ts`。
- 角色概括：runtime v1 的轻量 session/state/event 记录面。

## 2. 文件职责

这个文件提供内存 store 与 SQLite store，记录 session、state、event、invocation、mainLoop step、procedure、approval 和 public-safe error。它让 Agent 运行过程可观察、可恢复、可审计，并为 runtime 治理与契约检查留下可读证据。

## 2.1 文件名语义拆解

- `runtime`：服务运行时内核。
- `SessionStateEvent`：记录运行期间的会话、状态和事件。
- `Store`：只提供轻量持久化合同，不定义 CMP/MP 存储策略。

## 3. 目录语义

它位于 `agent_runtimeImplementation` 根运行面，因为 session/state/event 会被 kernel、inspection、debug、management、selfRepair 共同使用。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / session-state-event 轻量持久化面。
- 核心目的：记录 runtime session、state transition、model/tool invocation 和事件日志。
- 能力要求1：提供内存 store 与 SQLite store 两种实现，保持同一套 runtime 事件合同。
- 能力要求2：SQLite 只保存 public-safe JSON，不保存 raw secret 或 provider 私有材料。
- 边界：只做轻量 runtime 记录，不承担 CMP 数据库策略、MP RAG/LanceDB 或企业级外部存储。
- 对接：需要服务 PraxisRuntimeKernel、inspection/debug、session resume 和后续 mainLoop 审计。
- 实现提示：先落最小 append/read 合同，再等待更完整状态机和动作原语审计。

## 5. 需要提供的能力

- 创建 session。
- 更新 session 状态。
- 追加 state transition、event 和 invocation。
- 持久化 `MainLoopStepRecord`，让 prompt/model/tool/procedure/approval/failure 的动作原语可审计。
- 记录 EphemeralProcedure 计划和执行结果摘要。
- 记录 approval pending/resolved，并保留 interface/application surface 可以接走的 public-safe envelope。
- 记录 public-safe error，避免失败只存在于返回值里。
- 查询 pending approvals 和最新 state snapshot。
- 读取单个 session 的完整 public-safe snapshot。
- 提供 in-memory 与 SQLite 两种 runtime store。

## 6. 输入边界

- 输入 record 必须由调用方提供 sessionId、runtimeId、agentId、manifestHash、createdAt 等稳定字段。
- payload 和 summary 只接受 public-safe JSON object。
- SQLite path 由 runtime 或测试显式传入，不自动扫描全局目录。

## 7. 输出边界

- 输出 `RuntimeSessionSnapshot`。
- snapshot 包含 session、states、events、invocations、mainLoopSteps、procedures、approvals、errors。
- 不输出 provider raw secret、auth privateMaterial 或宿主内部句柄。

## 8. 错误边界

- store 本身保持窄接口，SQLite I/O 错误交由调用方测试和 runtime error boundary 包装。
- JSON 解析失败时降级为空 object，避免把坏数据扩散进 runtime。
- 未找到 session 时返回空 snapshot，而不是伪造 session。

## 9. 依赖对象

- 内存实现依赖 Map/Array。
- SQLite 实现依赖 Node 内置 `node:sqlite`。
- 上游调用方包括 `PraxisRuntimeKernel`、inspection/debug 和后续 mainLoop。

## 10. 被谁调用

- `PraxisRuntimeKernel`。
- runtime inspection/debug/replay。
- 后续 session resume、自修复和行为审计。
- 测试与 smoke harness。

## 11. 不应该做什么

- 不承担 CMP 的数据库策略。
- 不承担 MP 的 RAG/LanceDB。
- 不保存 raw token、raw auth file、provider privateMaterial。
- 不替代 event bus 或 UI subscription。

## 12. 最小实现建议

- 先以 append-only 记录为主。
- SQLite schema 保持小表结构，便于迁移。
- 后续再增加索引、压缩、清理、replay cursor。

## 13. 最小测试建议

- 同一套记录流程同时覆盖内存 store 和 SQLite store。
- 验证 session 状态更新、事件排序、invocation 记录。
- 验证 MainLoopStepRecord、procedure、approval pending/resolved、public-safe error 同时进入 memory/SQLite snapshot。
- 验证 snapshot 中只出现 public-safe payload。

## 14. 与系统链路的关系

它是 runtime 从“一次函数调用”走向“可观察、可恢复、可审计运行实例”的基础层，先服务 Agent v1，后续再接 mainLoop/coreLogic 的完整动作原语审计。
