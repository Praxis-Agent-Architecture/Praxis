/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / Skill 基础工具 / skill.remove 入口。
 * 核心目的：暴露“禁用、解除链接、清除本地 Skill”的稳定 baseTool 公共入口。
 * 边界：这里只做显式导出，不承载删除策略、文件 IO、审批或 provider 实现。
 * 对接：由 registry 挂载 handler，经 storagePool 的 bestPractice/core 调用 runtime filesystem port。
 * 实现提示：保持入口薄层，真实语义在 src/storagePool/baseToolStorage/skillBase/skill.remove/。
 */

export {
  executeSkillRemove,
  executeSkillRemoveCore,
  planSkillRemove,
  selectSkillRemovePractice,
  skillRemoveBaseToolDefinition,
  skillRemoveHandler,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.remove/bestPractice.js";
export type {
  SkillRemoveBestPracticeRequest,
  SkillRemoveErrorCode,
  SkillRemoveHandlerInput,
  SkillRemoveMode,
  SkillRemoveOutput,
  SkillRemoveRequest,
  SkillRemoveResult,
  SkillRemoveTarget,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.remove/bestPractice.js";
