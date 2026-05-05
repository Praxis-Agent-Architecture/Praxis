/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / Skill 基础工具 / skill.management 入口。
 * 核心目的：暴露“管理、检查、激活、加载本地 Skill”的稳定 baseTool 公共入口。
 * 边界：这里只做显式导出，不承载 registry 读写、activate/load 内容注入或 provider 实现。
 * 对接：由 registry 挂载 handler，经 storagePool 的 bestPractice/core 调用 runtime filesystem port。
 * 实现提示：保持入口薄层，真实语义在 src/storagePool/baseToolStorage/skillBase/skill.management/。
 */

export {
  executeSkillManagement,
  executeSkillManagementCore,
  planSkillManagement,
  selectSkillManagementPractice,
  skillManagementBaseToolDefinition,
  skillManagementHandler,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.management/bestPractice.js";
export type {
  SkillManagementAction,
  SkillManagementBestPracticeRequest,
  SkillManagementErrorCode,
  SkillManagementHandlerInput,
  SkillManagementOutput,
  SkillManagementRequest,
  SkillManagementResult,
  SkillManagementTarget,
} from "../../../../../storagePool/baseToolStorage/skillBase/skill.management/bestPractice.js";
