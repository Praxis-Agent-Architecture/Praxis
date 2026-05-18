/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / Skill 基础工具 / skill.generate 入口。
 * 核心目的：暴露“生成本地 Skill 包”的稳定 baseTool 公共入口。
 * 边界：这里只做显式导出，不承载文件写入、模板生成、审批或 provider 实现。
 * 对接：由 registry 挂载 handler，经 storagePool 的 bestPractice/core 调用 runtime filesystem port。
 * 实现提示：保持入口薄层，真实语义在 src/storagePool/baseToolStorage/skillBase/skill.generate/。
 */

export {
  executeSkillGenerate,
  executeSkillGenerateCore,
  planSkillGeneration,
  selectSkillGeneratePractice,
  skillGenerateBaseToolDefinition,
  skillGenerateHandler,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.generate/bestPractice.js";
export type {
  SkillGenerateBestPracticeRequest,
  SkillGenerateErrorCode,
  SkillGenerateFileKind,
  SkillGenerateHandlerInput,
  SkillGenerateOutput,
  SkillGenerateRequestedFile,
  SkillGenerateRequest,
  SkillGenerateResult,
  SkillGenerateTarget,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.generate/bestPractice.js";
