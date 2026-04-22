/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：提供客户端式调用 API，让应用更方便地使用 runtime。
 * 能力要求1：需要封装 invoke、stream、inspect、subscribe、control 等常见操作。
 * 能力要求2：它面向开发者体验，而不是内部模块间细节。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
