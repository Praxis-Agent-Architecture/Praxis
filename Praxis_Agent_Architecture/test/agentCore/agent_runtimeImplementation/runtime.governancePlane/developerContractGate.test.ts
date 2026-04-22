/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：在开发者通过公共 runtime API 调用 agentCore 前做契约门禁。
 * 能力要求1：需要检查参数形态、调用模式、能力范围和允许暴露的内部信息。
 * 能力要求2：它保证第三方开发者使用的是稳定 runtime 契约，而不是内部实现细节。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
