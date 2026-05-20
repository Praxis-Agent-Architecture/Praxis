/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / Skill 基础工具 / skill.iterate 入口。
 * 核心目的：暴露“迭代本地 Skill 包”的稳定 baseTool 公共入口。
 * 边界：这里只做显式导出，不承载补丁语义、文件 IO、审批或 provider 实现。
 * 对接：由 registry 挂载 handler，经 storagePool 的 bestPractice/core 调用 runtime filesystem port。
 * 实现提示：保持入口薄层，真实语义在 src/storagePool/baseToolStorage/skillBase/skill.iterate/。
 */

export {
  executeSkillIterate,
  executeSkillIterateCore,
  planSkillIteration,
  selectSkillIteratePractice,
  skillIterateBaseToolDefinition,
  skillIterateHandler,
} from "../../../../storagePool/baseToolStorage/skillBase/skill.iterate/bestPractice.js";
export type {
  SkillIterateBestPracticeRequest,
  SkillIterateErrorCode,
  SkillIterateHandlerInput,
  SkillIterateOutput,
  SkillIterateRequest,
  SkillIterateResult,
  SkillIterateTarget,
  SkillIterationOperation,
  SkillIterationOperationKind,
} from "../../../../storagePool/baseToolStorage/skillBase/skill.iterate/bestPractice.js";
