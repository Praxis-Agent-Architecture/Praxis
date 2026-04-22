/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：定义官方模块如何加入、暂停、恢复、重载和脱离 runtime。
 * 能力要求1：需要让模块生命周期和 runtime 生命周期可协调、可检查、可回滚。
 * 能力要求2：避免模块随意挂载导致运行态不可预测。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
