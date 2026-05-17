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

export type DeepSeekV4ProviderReasoningEffort = "high" | "max";

export type DeepSeekV4ReasoningPlan = {
  thinking: { type: "enabled" | "disabled" };
  reasoningEffort?: DeepSeekV4ProviderReasoningEffort;
  outputConfig?: { effort: DeepSeekV4ProviderReasoningEffort };
};

export const DEEPSEEK_V4_REASONING_LEVELS = ["none", "low", "medium", "high", "xhigh"] as const;

const DEEPSEEK_V4_CONTEXT_WINDOW_TOKENS = 1_000_000;
const DEEPSEEK_V4_MAX_OUTPUT_TOKENS = 384_000;
const DEEPSEEK_V4_INPUT_BUDGET_THRESHOLD = 0.95;
const DEEPSEEK_V4_MAX_INPUT_TOKENS = DEEPSEEK_V4_CONTEXT_WINDOW_TOKENS - DEEPSEEK_V4_MAX_OUTPUT_TOKENS;
const DEEPSEEK_V4_USABLE_INPUT_TOKENS = Math.floor(
  DEEPSEEK_V4_MAX_INPUT_TOKENS * DEEPSEEK_V4_INPUT_BUDGET_THRESHOLD,
);

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
  {
    provider: "openai",
    model: "deepseek-v4-flash",
    contextWindowTokens: DEEPSEEK_V4_CONTEXT_WINDOW_TOKENS,
    maxInputTokens: DEEPSEEK_V4_MAX_INPUT_TOKENS,
    inputBudgetThreshold: DEEPSEEK_V4_INPUT_BUDGET_THRESHOLD,
    usableInputTokens: DEEPSEEK_V4_USABLE_INPUT_TOKENS,
    source: "manual-registry",
  },
  {
    provider: "openai",
    model: "deepseek-v4-pro",
    contextWindowTokens: DEEPSEEK_V4_CONTEXT_WINDOW_TOKENS,
    maxInputTokens: DEEPSEEK_V4_MAX_INPUT_TOKENS,
    inputBudgetThreshold: DEEPSEEK_V4_INPUT_BUDGET_THRESHOLD,
    usableInputTokens: DEEPSEEK_V4_USABLE_INPUT_TOKENS,
    source: "manual-registry",
  },
  {
    provider: "anthropic",
    model: "deepseek-v4-flash",
    contextWindowTokens: DEEPSEEK_V4_CONTEXT_WINDOW_TOKENS,
    maxInputTokens: DEEPSEEK_V4_MAX_INPUT_TOKENS,
    inputBudgetThreshold: DEEPSEEK_V4_INPUT_BUDGET_THRESHOLD,
    usableInputTokens: DEEPSEEK_V4_USABLE_INPUT_TOKENS,
    source: "manual-registry",
  },
  {
    provider: "anthropic",
    model: "deepseek-v4-pro",
    contextWindowTokens: DEEPSEEK_V4_CONTEXT_WINDOW_TOKENS,
    maxInputTokens: DEEPSEEK_V4_MAX_INPUT_TOKENS,
    inputBudgetThreshold: DEEPSEEK_V4_INPUT_BUDGET_THRESHOLD,
    usableInputTokens: DEEPSEEK_V4_USABLE_INPUT_TOKENS,
    source: "manual-registry",
  },
] as const;

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isDeepSeekV4Model(model: string | undefined): boolean {
  const normalized = normalize(model);
  return normalized === "deepseek-v4-flash" || normalized === "deepseek-v4-pro";
}

export function mapDeepSeekV4ReasoningEffort(effort: string | undefined): DeepSeekV4ReasoningPlan | undefined {
  const normalized = normalize(effort);
  if (!normalized) {
    return undefined;
  }
  if (normalized === "none" || normalized === "minimal") {
    return {
      thinking: { type: "disabled" },
    };
  }
  if (normalized === "low" || normalized === "medium") {
    return {
      thinking: { type: "enabled" },
      reasoningEffort: "high",
      outputConfig: { effort: "high" },
    };
  }
  if (normalized === "high" || normalized === "xhigh" || normalized === "max") {
    return {
      thinking: { type: "enabled" },
      reasoningEffort: "max",
      outputConfig: { effort: "max" },
    };
  }
  return undefined;
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
