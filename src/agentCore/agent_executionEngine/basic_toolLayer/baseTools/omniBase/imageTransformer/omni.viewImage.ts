/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 图像转换工具。
 * 核心目的：为 omni.viewImage 提供薄公开入口，把模型工具调用转接到 storagePool 的承托面实现。
 * 能力要求1：显式导出该能力的输入、输出、错误、权限需求和可观测事件类型。
 * 能力要求2：导出 BaseToolDefinition、BaseToolHandler 和 provider practice selector，供 registry/runtime 挂载。
 * 能力要求3：保留 planner/executor 兼容入口，但不在 entry 层读取、压缩、上传或 lowering 图片材料。
 * 边界：这里只做基础工具原语入口，不替代 TAP 的高级工具系统，也不定义 provider 统一多模态协议。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：真实校验、dry-run、provider missing、provider failure 和审计逻辑放在 storagePool/baseToolStorage。
 */

export {
  executeOmniViewImage,
  executeOmniViewImageCore,
  omniViewImageBaseToolDefinition,
  omniViewImageBestPracticeDescriptor,
  omniViewImageDescriptor,
  omniViewImageHandler,
  omniViewImageProviderPractices,
  planOmniViewImage,
  selectOmniViewImagePractice,
} from "../../../../../../storagePool/baseToolStorage/omniBase/imageTransformer/omni.viewImage/bestPractice.js";

export type {
  OmniViewImageAuditEvent,
  OmniViewImageBestPracticeRequest,
  OmniViewImageBoundary,
  OmniViewImageContext,
  OmniViewImageDetail,
  OmniViewImageError,
  OmniViewImageErrorCode,
  OmniViewImageHandlerInput,
  OmniViewImageMediaType,
  OmniViewImageOutput,
  OmniViewImagePermission,
  OmniViewImagePracticeSelection,
  OmniViewImageProvider,
  OmniViewImageProviderRequest,
  OmniViewImageProviderResult,
  OmniViewImageRequest,
  OmniViewImageResult,
  OmniViewImageTarget,
} from "../../../../../../storagePool/baseToolStorage/omniBase/imageTransformer/omni.viewImage/bestPractice.js";
