# omni.viewImage

> 对应源码：`src/agentCore_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer`。
- 当前文件：`omni.viewImage.ts`。
- 角色概括：`omni.viewImage` 的稳定公开入口，负责把模型工具调用转接到 storagePool 的承托面实现。

## 2. 文件职责

为 `omni.viewImage` 提供薄公开入口，把模型工具调用转接到 storagePool 的承托面实现。

这个文件的核心不是实现图片读取、压缩、上传或 provider body lowering，而是暴露稳定、可 review、可被 registry 挂载的基础工具原语入口。真实校验、dry-run、provider missing、provider failure 和审计逻辑落在 `storagePool/baseToolStorage`。

## 2.1 文件名语义拆解

- 原始文件名：`omni.viewImage.ts`。
- 命名片段：`omni` / `view` / `Image`。
- 工程含义：这是 `omniBase` 下 `imageTransformer` 分组里的 `viewImage` 基础工具原语，重点是把一个底层动作做成可治理、可审计、可测试的最小工具能力。
- 第一实现重点：保持 entry 层薄导出，显式暴露 planner/executor、definition、handler、practice selector 和 public types。
- 与 TAP 的关系：这里只提供底层原语；审批、组合、专业工具库和替换策略应交给 TAP 高级系统。

## 3. 目录语义

- 基础工具原语层：提供 Agent 成立所需的底层工具能力，让 TAP 在其上构建更高级工具治理系统。
- 多模态转换基础工具：音频、图像、视频的基础转换能力

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 图像转换工具。
- 核心目的：为 omni.viewImage 提供薄公开入口，把模型工具调用转接到 storagePool 的承托面实现。
- 能力要求1：显式导出该能力的输入、输出、错误、权限需求和可观测事件类型。
- 能力要求2：导出 BaseToolDefinition、BaseToolHandler 和 provider practice selector，供 registry/runtime 挂载。
- 能力要求3：保留 planner/executor 兼容入口，但不在 entry 层读取、压缩、上传或 lowering 图片材料。
- 边界：这里只做基础工具原语入口，不替代 TAP 的高级工具系统，也不定义 provider 统一多模态协议。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：真实校验、dry-run、provider missing、provider failure 和审计逻辑放在 storagePool/baseToolStorage。

## 5. 需要提供的能力

- 为 `omni.viewImage` 暴露基础工具原语入口。
- 显式导出输入、输出、错误、权限需求和可观测事件类型。
- 导出 `BaseToolDefinition`、`BaseToolHandler` 和 provider practice selector，供 registry/runtime 挂载。
- 保留 planner/executor 兼容入口，但不在 entry 层读取、压缩、上传或 lowering 图片材料。
- 让 TAP 高级工具系统在上层做审批、组合、专业能力替换和策略编排。
- 为上层调用方保留必要的运行上下文、治理上下文和事件线索。
- 在不冻结最终 schema 的前提下，给后续真实实现留下最小但清楚的扩展点。

## 6. 输入边界

- runtime/toolInvocationEntrypoint 下发的 `omni.viewImage` 工具调用请求。
- TAP 治理、执行上下文、目标 image path/ref、detail/maxBytes、runtime/session/toolCall metadata 和审计上下文。

输入边界必须窄：只接收完成本文件职责所需的材料，不把相邻模块的大对象整包吞进来。

## 7. 输出边界

- 工具执行结果、工具事件、审计材料和可交给 TAP 继续治理的状态。
- `BaseToolInvokeResult` 标准结果信封，成功时包含 dry-run 或 runtime omni 承托结果。

输出边界必须稳定：上层应该依赖这里给出的标准结构，而不是依赖内部临时变量、provider 原始字段或工具底层细节。

## 8. 错误边界

- 参数缺失、契约不满足、权限不足、作用域越界时必须返回可解释错误。
- runtime provider 缺失、runtime provider 失败、guard 未确认和治理拒绝要区分处理。

错误处理要服务工程构建：第一版可以简单，但必须可分类、可测试、可被 runtime inspection/debug/selfRepair 继续消费。

## 9. 依赖对象

- runtime.execEngine
- runtime.governancePlane
- runtime.contractSurface
- runtime.invocationMethod/toolInvocationEntrypoint
- `BaseToolExecutorPort.omni.transformMedia`
- storagePool/baseToolStorage/omniBase/imageTransformer/omni.viewImage

依赖关系应该通过显式参数、接口或 runtime context 进入，不要在文件内部形成隐式全局耦合。

## 10. 被谁调用

- runtime.invocationMethod/toolInvocationEntrypoint
- runtime.execEngine
- `createBaseToolRegistry().lookupHandler("omni.viewImage")`
- TAP 高级工具系统

调用方只能依赖本文件公开的窄接口；如果需要更多能力，应新增相邻能力点或上移到 runtime surface，而不是把本文件写胖。

## 11. 不应该做什么

- 不要在这里写上层产品逻辑，也不要让它直接绑定某一家 provider 的请求格式。
- 不要在 entry 层读取、压缩、上传图片，或把图片降级成某个 provider 的 body。
- 不要定义 provider 统一多模态协议；模型能力、artifact/ref、base64、上传和 body lowering 属于 runtime/modelAdapter。
- 不要把基础工具原语写成 TAP 的完整高级工具系统；TAP 负责更上层的审批、治理和专业工具组合。

越界判断标准很简单：如果实现开始替别的模块做策略、产品逻辑、最终协议冻结或大而全编排，就应该停下来拆文件。

## 12. 最小实现建议

- entry 层只保留显式导出，不使用 bare `export *`。
- storagePool `core.ts` 负责 unknown JSON 校验、dry-run、guard、provider missing/failure 和 public-safe result。
- storagePool `bestPractice.ts` 负责 `BaseToolInvokeRequest` 适配、practice metadata 注入和 handler 结果适配。
- runtime/provider 只能通过明确依赖注入进入，避免在文件内部偷偷读全局状态。

第一版实现应该追求“能被调用、能被测、边界清楚”，不要追求一次性完整。

## 13. 最小测试建议

- 空输入、最小合法输入、非法 target/context 各至少一组。
- 验证 dry-run 不调用 provider，`dryRun:false` 没有 guard 时拒绝，缺 runtime provider 时返回 `PROVIDER_UNAVAILABLE`。
- 验证 provider failure 映射为 public-safe error，不泄漏内部细节。
- 验证 `createBaseToolRegistry().lookupHandler("omni.viewImage")` 可解析且可调用。
- 验证 entry 层只做显式导出，不使用 bare `export *`。

测试优先证明边界正确，而不是证明未来完整能力已经全部实现。

## 14. 与系统链路的关系

它处在工具调用链的底层：runtime 和 TAP 经过治理后调用这些基础工具原语。

这份文档服务后续编码：当实现该文件时，应先回看本文件说明，再决定类型、函数、类和测试如何落位。
