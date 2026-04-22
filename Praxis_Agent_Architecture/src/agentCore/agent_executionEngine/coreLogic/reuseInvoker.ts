/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：承托 AgentCore 复用调用能力，让上层应用、CMP、MP、TAP 可以把 agentCore 打包复用。
 * 能力要求1：更偏向复用已构建的 Agent 实例、能力集合或运行对象，而不是单纯缓存一次调用结果。
 * 能力要求2：需要服务未来 OAO 场景：用户可以 new 出一个 agentCore 对象并用它承接实际 Agent。
 * 能力要求3：需要让官方模块也按同一复用方式实践 agentCore，而不是各自绕开核心。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
