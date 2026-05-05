/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / Skill 基础工具 / skill.summarize 入口。
 * 核心目的：暴露“生成模型可见 Skill 摘要”的稳定 baseTool 公共入口。
 * 边界：这里只做显式导出，不承载摘要预算、文件读取或 provider 实现。
 * 对接：由 registry 挂载 handler，经 storagePool 的 bestPractice/core 调用 runtime filesystem port。
 * 实现提示：保持入口薄层，真实语义在 src/storagePool/baseToolStorage/skillBase/skill.summarize/。
 */

export {
  executeSkillSummarize,
  executeSkillSummarizeCore,
  planSkillSummarize,
  selectSkillSummarizePractice,
  skillSummarizeBaseToolDefinition,
  skillSummarizeHandler,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.summarize/bestPractice.js";
export type {
  SkillSummarizeBestPracticeRequest,
  SkillSummarizeErrorCode,
  SkillSummarizeHandlerInput,
  SkillSummarizeOutput,
  SkillSummarizeRequest,
  SkillSummarizeResult,
  SkillSummarizeTarget,
  SkillSummarySource,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.summarize/bestPractice.js";
