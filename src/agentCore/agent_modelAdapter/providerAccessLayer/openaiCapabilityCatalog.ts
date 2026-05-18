/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / OpenAI 能力目录。
 * 核心目的：登记 OpenAI actualInvocationLayer 已具备或可承接的 endpoint 能力族。
 * 能力要求1：表达 text/reasoning、image、audio、realtime、video、files/vector stores、skills 等能力。
 * 能力要求2：只登记能力和 endpoint，不承诺每个 endpoint 已 live 打通。
 * 能力要求3：为 provider carrier/probe 和后续经济控制提供能力枚举。
 * 边界：不查询官方服务、不读取用户账号、不做模型可用性判断。
 * 对接：被 providerProbe、文档示例和上层 carrier 选择使用。
 * 实现提示：模型名称由上层配置或 probe 决定，不在这里硬编码未确认产品名。
 */

export type OpenAICapabilityRecord = {
  capabilityId: string;
  endpointShape: string;
  endpoint: string;
  modality: "text" | "image" | "audio" | "realtime" | "video" | "storage" | "tooling";
  liveAdapterStatus: "representative" | "catalog-only";
};

export const OPENAI_PROVIDER_CAPABILITY_CATALOG: readonly OpenAICapabilityRecord[] = [
  {
    capabilityId: "openai.responses.text-reasoning",
    endpointShape: "responses",
    endpoint: "/v1/responses",
    modality: "text",
    liveAdapterStatus: "representative",
  },
  {
    capabilityId: "openai.images.generations",
    endpointShape: "image",
    endpoint: "/v1/images/generations",
    modality: "image",
    liveAdapterStatus: "representative",
  },
  {
    capabilityId: "openai.audio.transcriptions",
    endpointShape: "audio",
    endpoint: "/v1/audio/transcriptions",
    modality: "audio",
    liveAdapterStatus: "representative",
  },
  {
    capabilityId: "openai.audio.speech",
    endpointShape: "audio",
    endpoint: "/v1/audio/speech",
    modality: "audio",
    liveAdapterStatus: "catalog-only",
  },
  {
    capabilityId: "openai.realtime.sessions",
    endpointShape: "realtime",
    endpoint: "/v1/realtime/sessions",
    modality: "realtime",
    liveAdapterStatus: "catalog-only",
  },
  {
    capabilityId: "openai.videos",
    endpointShape: "video",
    endpoint: "/v1/videos",
    modality: "video",
    liveAdapterStatus: "catalog-only",
  },
  {
    capabilityId: "openai.files.vector-stores",
    endpointShape: "files",
    endpoint: "/v1/files",
    modality: "storage",
    liveAdapterStatus: "catalog-only",
  },
  {
    capabilityId: "openai.skills",
    endpointShape: "skills",
    endpoint: "/v1/skills",
    modality: "tooling",
    liveAdapterStatus: "catalog-only",
  },
];
