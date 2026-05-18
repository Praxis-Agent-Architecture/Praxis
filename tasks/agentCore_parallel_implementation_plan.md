# agentCore 488 文件并发实现计划

## 1. 当前目标

当前目标是为：

`src/agentCore/`

下面的 488 个 `.ts` 文件补齐第一轮主体实现。

这不是一次性写完整 agentCore，而是先完成：

- 可编译的 TypeScript 主体。
- 和对应 `.md` 文档一致的输入、输出、错误、依赖、调用边界。
- 可被后续行为测试逐步升级的最小实现。
- 不把 provider 字段形状、上层产品逻辑、TAP 高级工具系统、CMP/MP 内部策略混进 agentCore。

当前阶段继续坚持：

```text
弱文档，强构建
先契约
再最小主体
再行为测试
再联调
再逐块增强
```

## 2. 已有基础

当前已经具备：

- 488 个 `src/agentCore/**/*.ts` 文件。
- 488 个 `docs/agentCore/**/*.md` 逐文件施工文档。
- 488 个 `test/agentCore/**/*.test.ts` 契约测试。
- 1 个共享测试助手：
  `test/agentCore/agentCoreContractTestHelper.ts`
- 1 个子工程配置：
  `package.json`
- 1 个子工程 TypeScript 配置：
  `tsconfig.json`

当前可运行：

```bash
cd /home/proview/Desktop/Praxis_series/Praxis_org
npm run typecheck
npm run test:agentCore
```

当前 `test:agentCore` 是契约测试，不是完整行为测试。它先保证每个源码、文档和测试之间的工程边界一致。

## 3. 并发规模建议

基于当前机器性能和之前内存爆掉的经验，建议：

- 起步并发：4 个 Codex agent。
- 稳定后并发：最多 6 个 Codex agent。
- 不建议一开始开 16 个。

原因：

- 488 个文件数量大，但不是每个文件都适合独立 agent。
- 并发太高会造成上下文、内存、文件冲突和合并冲突。
- 当前任务更适合按模块切片，而不是按文件暴力切片。
- 同一个 worktree 并发写入很容易互相覆盖。

## 4. 推荐切片

### Slice A：runtime 契约与应用入口

范围：

- `agent_runtimeImplementation/runtime.contractSurface/`
- `agent_runtimeImplementation/runtime.applicationSurface/`
- `agent_runtimeImplementation/runtime.invocationMethod/`

目标：

- 先长出 runtime 公共契约、内部契约、调用契约、状态契约、错误契约。
- 让上层应用可以通过 applicationSurface 创建、持有、调用、观察 agentCore。
- 让 invocationMethod 成为 agent/tool/model/interface/stream/batch 的统一入口。

### Slice B：runtime 治理与官方模块入口

范围：

- `agent_runtimeImplementation/runtime.governancePlane/`
- `agent_runtimeImplementation/runtime.officialModuleSurface/`
- `agent_interfaceAdapter/`

目标：

- 固定治理策略、权限、scope、审计、违规报告的最小类型和最小判断结果。
- 让 CMP/MP/TAP/multiagent 通过官方 module surface 进入 runtime。
- 保持官方模块只通过 port/bridge/surface 接入，不把模块内部策略写进 agentCore。

### Slice C：PromptPack 与执行核心

范围：

- `agent_executionEngine/promptPack/`
- `agent_executionEngine/coreLogic/`
- `agent_executionEngine/IOTransceiver/`
- `agent_runtimeImplementation/runtime.execEngine/`

目标：

- 把 PromptPack 实现成模型输入前的上下文包管理层。
- 明确它不是最终 provider payload，也不是 system/user prompt 拼接器。
- 建立 mainLoop、stateEngine、eventExposurePlane 的最小可测壳。
- 让 runtime.execEngine 能绑定执行引擎各子面。

### Slice D：模型适配链

范围：

- `agent_modelAdapter/actualInvocationLayer/`
- `agent_modelAdapter/abstractionLayer/`
- `agent_modelAdapter/bridgingLayer/`
- `agent_runtimeImplementation/runtime.modelAdapter/`

目标：

- actualInvocationLayer 承接真实 provider/custom 上游形态。
- abstractionLayer 把不同 provider/custom 格式抽象成 agentCore 可理解的能力。
- bridgingLayer 把抽象结果变成 agentCore 内部唯一固定使用方式。
- 不让 provider 原始字段反向定义 agentCore 公共契约。

### Slice E：基础工具原语层

范围：

- `agent_executionEngine/basic_toolLayer/`
- `agent_executionEngine/basic_toolLayer/baseTools/`

目标：

- 建立 code/shell/git/mcp/computeruse/office/omni/search/skill 基础工具原语的最小类型和最小执行壳。
- 每个工具先支持 dry-run、guard、audit path。
- 不把基础工具层写成 TAP 高级工具系统。
- TAP 后续在这些原语上构建审批、治理、组合、替换和专业能力库。

### Slice F：运行质量面

范围：

- `agent_runtimeImplementation/runtime.inspection/`
- `agent_runtimeImplementation/runtime.debug/`
- `agent_runtimeImplementation/runtime.selfRepair/`
- `agent_runtimeImplementation/runtime.adaptiveRuntime/`
- `agent_runtimeImplementation/runtime.managementPlane/`
- `agent_runtimeImplementation/runtime.behaviorExposure/`
- `agent_runtimeImplementation/runtime.capabilityExposure/`
- `agent_runtimeImplementation/runtime.modeExposure/`
- `agent_runtimeImplementation/runtime.externalControl/`

目标：

- 建立运行检查、调试、自修复、自适应、管理、能力暴露、行为暴露、模式暴露和外部调控的最小壳。
- 第一版不追求智能化完整，只要求类型清楚、结果稳定、错误可分类、事件可观察。

## 5. 每个 slice 的交付要求

每个 slice 完成时必须满足：

- 对应 `.ts` 文件不再只是注释空壳。
- 每个文件至少导出一个与文件职责对应的类型、函数、常量或类。
- 所有导出必须有明确输入、输出、错误或结果类型。
- 不做真实危险副作用，危险动作先只做 dry-run / guard / audit。
- 不引入循环依赖。
- 不把相邻模块职责塞进当前文件。
- 不冻结最终 schema，只冻结第一轮最小可测契约。

## 6. 测试策略

第一层测试已经存在：

```bash
npm run test:agentCore
```

它验证：

- 源码存在。
- 文档存在。
- 源码头注释和文档一致。
- 文档有输入、输出、错误、依赖、调用方、最小实现、最小测试。
- 关键边界没有跑偏。

实现主体之后，需要逐步升级测试：

1. 保留契约测试。
2. 每个 slice 增加少量共享行为测试 helper。
3. 对每个 `.test.ts` 增加最小行为断言。
4. 最后增加跨模块联调测试。

优先升级顺序：

```text
runtime.contractSurface
  -> runtime.applicationSurface
  -> runtime.invocationMethod
  -> runtime.governancePlane
  -> promptPack
  -> runtime.modelAdapter
  -> executionEngine/coreLogic
  -> basic_toolLayer
  -> inspection/debug/selfRepair/adaptiveRuntime
```

## 7. 自动激活 Codex 工作流的可行方案

本机已经确认 Codex CLI 支持非交互执行：

```bash
codex exec --help
```

可用能力包括：

- `codex exec`
- `codex exec --full-auto`
- `codex exec -C <workspace>`
- `codex exec -m <model>`
- `codex exec --json`
- `codex exec -o <last-message-file>`

这意味着可以让 Codex 以非交互方式执行某个明确任务。

但是，不建议直接在同一个 worktree 同时跑多个 `codex exec` 写同一批文件。

风险：

- 多个 agent 同时改同一文件。
- 多个 agent 同时改 `package.json`、共享 helper 或公共类型。
- 输出互相覆盖。
- 合并时无法判断哪个 agent 的设计是主线。
- 内存和上下文占用不可控。

## 8. 推荐自动化方式

### 方式 A：当前聊天内手动派 subagents

优点：

- 主代理可以看住方向。
- 能及时阻止跑偏。
- 适合架构还在快速调整时使用。

缺点：

- 需要用户或主代理持续调度。
- 不能真正脱离当前会话长时间自动跑。

建议：

- 起步 4 个。
- 完成后必须收回。
- 每个 agent 只负责一个 slice。
- 每个 agent 结束后报告改了哪些文件。

### 方式 B：Codex CLI + 独立 worktree

这是最适合“自动写”的方式。

建议为每个 slice 建独立 worktree：

```bash
git worktree add ../Praxis_org_agentcore_slice_A dev/rebase
git worktree add ../Praxis_org_agentcore_slice_B dev/rebase
git worktree add ../Praxis_org_agentcore_slice_C dev/rebase
git worktree add ../Praxis_org_agentcore_slice_D dev/rebase
```

然后每个 worktree 里跑：

```bash
codex exec \
  -C /home/proview/Desktop/Praxis_series/Praxis_org_agentcore_slice_A \
  --full-auto \
  -m gpt-5.4 \
  "按 Tasks/agentCore_parallel_implementation_plan.md 的 Slice A 实现 agentCore 第一轮最小主体。只改 Slice A 范围文件。完成后运行 cd . && npm run typecheck && npm run test:agentCore。"
```

优点：

- 真正自动执行。
- 每个 agent 有独立工作区。
- 冲突可控。
- 最后可以逐个 cherry-pick 或手动合并。

缺点：

- 需要额外管理 worktree。
- 每个 worktree 会占磁盘和索引资源。
- 如果提示词不够严格，仍然可能跑偏。

### 方式 C：Codex App Automations / Thread Heartbeat

Codex Desktop 支持自动化/心跳式唤醒时，可以让当前线程定时继续推进。

适合：

- 每隔一段时间唤醒当前线程检查任务。
- 提醒继续下一批 slice。
- 自动查看是否已有 agent 完成。

不适合：

- 同时写 488 个文件。
- 长时间无人监管地大范围改代码。

建议用途：

- 当作“调度提醒器”。
- 不当作“无限自动写代码机器”。

### 方式 D：本地 orchestrator 脚本

可以后续新增一个脚本，例如：

`Tasks/run_agentcore_slices.mjs`

它负责：

- 创建 worktree。
- 为每个 slice 生成 prompt。
- 调用 `codex exec`。
- 收集每个 slice 的输出。
- 跑测试。
- 生成合并报告。

这个方式最自动，但也最需要先设计好安全边界。

建议等 Slice A/B/C 手动验证过一次后，再写 orchestrator。

## 9. 推荐启动流程

第一轮不要一上来全自动。

建议流程：

```text
1. 主线保持 dev/rebase 不乱动
2. 开 4 个 worktree
3. 每个 worktree 跑一个 codex exec
4. 每个 slice 完成后运行 typecheck + test:agentCore
5. 主代理读 diff
6. 用户确认方向
7. 逐个合并
8. 再开下一批
```

第一批建议只开：

- Slice A
- Slice B
- Slice C
- Slice D

暂时不要同时开 Slice E/F。

原因：

- Slice E 基础工具层文件很多，容易膨胀。
- Slice F 运行质量面涉及治理/debug/selfRepair/adaptive，抽象空间大，容易跑偏。
- 先让 runtime contract、modelAdapter、promptPack、executionCore 站住，后面更稳。

## 10. 时间估计

如果目标是第一轮最小主体：

- 4 个并发 agent：约 4 到 7 小时。
- 6 个并发 agent：约 3 到 5 小时。

如果目标是可联调的第一版 agentCore：

- 初步联调骨架：约 1 到 2 天。
- 比较像样的可用内核：约 3 到 7 天。
- 稳定工程版：约 1 到 3 周。

## 11. 通过标准

第一轮完成标准：

```bash
cd /home/proview/Desktop/Praxis_series/Praxis_org
npm run typecheck
npm run test:agentCore
```

必须全部通过。

此外还要检查：

- 没有跨 slice 乱改。
- 没有把旧 phase_1 runner/executor/attempt 链写回主线。
- 没有把 Raxode/Raxos 产品逻辑写进 agentCore 内核。
- 没有把 PromptPack 写成 provider payload。
- 没有把 baseTools 写成 TAP。
- 没有让 provider 字段形状反向污染 agentCore。

## 12. 当前建议

当前最稳建议是：

```text
先不要直接 16 并发。
先用 4 个 Codex agent / 4 个 worktree。
每个 agent 一个 slice。
完成后先 typecheck + test:agentCore。
再由主代理汇总 diff 和冲突。
用户确认方向后再扩大并发。
```

如果要真正自动化，优先研究：

```text
git worktree + codex exec + slice prompt + 自动测试 + 合并报告
```

而不是在当前单一 worktree 里直接同时放飞多个 agent。
