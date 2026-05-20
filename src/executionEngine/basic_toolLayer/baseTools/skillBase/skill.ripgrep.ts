/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / Skill 基础工具 / skill.ripgrep 入口。
 * 核心目的：暴露“搜索本地 Skill 库内容”的稳定 baseTool 公共入口。
 * 边界：这里只做显式导出，不承载搜索执行、shell 调用或 provider 实现。
 * 对接：由 registry 挂载 handler，经 storagePool 的 bestPractice/core 调用 runtime search.ripgrep port。
 * 实现提示：保持入口薄层，真实语义在 src/storagePool/baseToolStorage/skillBase/skill.ripgrep/。
 */

export {
  executeSkillRipgrep,
  executeSkillRipgrepCore,
  planSkillRipgrep,
  selectSkillRipgrepPractice,
  skillRipgrepBaseToolDefinition,
  skillRipgrepHandler,
} from "../../../../storagePool/baseToolStorage/skillBase/skill.ripgrep/bestPractice.js";
export type {
  SkillRipgrepBestPracticeRequest,
  SkillRipgrepErrorCode,
  SkillRipgrepHandlerInput,
  SkillRipgrepOutput,
  SkillRipgrepRequest,
  SkillRipgrepResult,
  SkillRipgrepTarget,
} from "../../../../storagePool/baseToolStorage/skillBase/skill.ripgrep/bestPractice.js";
