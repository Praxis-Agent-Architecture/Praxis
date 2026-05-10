/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / 模型元数据注册表。
 * 核心目的：记录无法可靠从 provider /models 自动获得的静态模型能力事实。
 * 边界：只登记手动维护的模型上下文、输入预算和阈值，不做 live 可用性判断。
 */

export type ProviderModelMetadata = {
  provider: "openai" | "anthropic" | "deepmind" | "customFormat" | (string & {});
  model: string;
  contextWindowTokens: number;
  maxInputTokens: number;
  inputBudgetThreshold: number;
  usableInputTokens: number;
  source: "manual-registry";
};

const MANUAL_MODEL_METADATA: readonly ProviderModelMetadata[] = [
  {
    provider: "openai",
    model: "gpt-5.5",
    contextWindowTokens: 400_000,
    maxInputTokens: 272_000,
    inputBudgetThreshold: 0.95,
    usableInputTokens: Math.floor(272_000 * 0.95),
    source: "manual-registry",
  },
] as const;

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function resolveProviderModelMetadata(input: {
  provider?: string;
  model?: string;
}): ProviderModelMetadata | undefined {
  const provider = normalize(input.provider);
  const model = normalize(input.model);
  if (!provider || !model) {
    return undefined;
  }
  return MANUAL_MODEL_METADATA.find((entry) =>
    normalize(entry.provider) === provider
    && normalize(entry.model) === model
  );
}

export function createModelMetadataRecord(input: {
  provider?: string;
  model?: string;
}): Readonly<Record<string, unknown>> | undefined {
  const metadata = resolveProviderModelMetadata(input);
  if (!metadata) {
    return undefined;
  }
  return {
    contextWindowTokens: metadata.contextWindowTokens,
    maxInputTokens: metadata.maxInputTokens,
    inputBudgetThreshold: metadata.inputBudgetThreshold,
    usableInputTokens: metadata.usableInputTokens,
    metadataSource: metadata.source,
  };
}
