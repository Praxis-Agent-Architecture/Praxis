/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：把治理面裁决桥接给 CMP、MP、TAP、multiagent 等官方模块。
 * 能力要求1：需要让官方模块申请权限、读取授权结果、感知治理拒绝或降级。
 * 能力要求2：它不实现模块内部策略，只保证模块接入 runtime 时受同一治理系统约束。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
