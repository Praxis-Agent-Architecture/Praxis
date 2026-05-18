# agentCore 第一轮主体实现 Spec

## 总目标

为 `src/agentCore/` 下 488 个 `.ts` 文件补齐第一轮最小主体实现。

第一轮不追求完整智能行为，只追求：

- 可编译。
- 有明确导出。
- 输入、输出、错误、依赖边界清楚。
- 和 `docs/agentCore/**/*.md` 逐文件文档一致。
- 契约测试保持通过。
- 为后续行为测试和联调留出稳定接口。

## 大 spec

### AC-SPEC-A：runtime 契约与应用入口

范围：

- `agent_runtimeImplementation/runtime.contractSurface/`
- `agent_runtimeImplementation/runtime.applicationSurface/`
- `agent_runtimeImplementation/runtime.invocationMethod/`

目标：

- 先长出 runtime 类型契约。
- 让上层应用可以创建、持有、调用、观察 agentCore。
- 让 invocationMethod 成为 agent/tool/model/interface/stream/batch 的统一入口。

### AC-SPEC-B：runtime 治理与官方模块入口

范围：

- `agent_runtimeImplementation/runtime.governancePlane/`
- `agent_runtimeImplementation/runtime.officialModuleSurface/`
- `agent_interfaceAdapter/`

目标：

- 固定治理策略、权限、scope、审计、违规报告的最小结果。
- 让 CMP/MP/TAP/multiagent 通过 officialModuleSurface 进入 runtime。
- 不把官方模块内部策略写进 agentCore。

### AC-SPEC-C：PromptPack 与执行核心

范围：

- `agent_executionEngine/promptPack/`
- `agent_executionEngine/coreLogic/`
- `agent_executionEngine/IOTransceiver/`
- `agent_runtimeImplementation/runtime.execEngine/`

目标：

- PromptPack 作为模型输入前的上下文包管理层。
- mainLoop、stateEngine、eventExposurePlane 有最小可测主体。
- runtime.execEngine 能绑定执行引擎各子面。

### AC-SPEC-D：模型适配链

范围：

- `agent_modelAdapter/actualInvocationLayer/`
- `agent_modelAdapter/abstractionLayer/`
- `agent_modelAdapter/bridgingLayer/`
- `agent_runtimeImplementation/runtime.modelAdapter/`

目标：

- actualInvocationLayer 承接 provider/custom 上游现实形态。
- abstractionLayer 做跨厂商能力抽象。
- bridgingLayer 变成 agentCore 内部唯一稳定使用模型能力的桥。
- 不让 provider 字段形状反向定义 agentCore。

### AC-SPEC-E：基础工具原语层

范围：

- `agent_executionEngine/basic_toolLayer/`

目标：

- 建立 code/shell/git/mcp/computeruse/office/omni/search/skill 基础工具原语。
- 先 dry-run / guard / audit，不做危险真实副作用。
- 不把 baseTools 写成 TAP 高级工具系统。

### AC-SPEC-F：运行质量面

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
- `agent_runtimeImplementation` 根部 runtime 主干文件

目标：

- 建立运行检查、调试、自修复、自适应、管理、能力暴露、行为暴露、模式暴露和外部调控的最小壳。
- 第一版只要求类型清楚、结果稳定、错误可分类、事件可观察。

## micro-spec group task 完成标准

每个 micro-spec 文件组完成时：

- 组内每个 `.ts` 不再只是注释。
- 组内每个文件至少导出一个与文档职责一致的类型、函数、常量或类。
- 不越界改相邻模块。
- 组内每个 `.test.ts` 至少保留契约测试，并可增加最小行为测试。
- `cd . && npm run typecheck && npm run test:agentCore` 通过。

默认每组 4 个文件。这个粒度比完整 small spec 更小，适合控制 Codex 上下文窗口；同时比单文件更大，避免每个文件都启动 worker/reviewer/merge 三个 agent。

reviewer 必须逐文件 review，但由同一个 reviewer Codex 完成整个组的 review。

merge 仍由 Codex 完成，但使用 `gpt-5.4 medium`。merge 的工作重点是 diff 范围、测试、账本、必要合并或 cherry-pick，不是重新实现功能。
