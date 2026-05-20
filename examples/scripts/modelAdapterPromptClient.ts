import {
  createDefaultRaxModelClient,
  createDefaultRaxProviderRegistry,
  createProviderAuthRef,
  type RaxModelClient,
  type RaxModelRequest,
  type RaxReasoningEffort,
} from "../../src/modelAdapter/index.js";

const defaultProviderRegistry = createDefaultRaxProviderRegistry();

export type ModelAdapterPromptOptions = {
  model?: string;
  provider?: string;
  route?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  reasoningEffort?: RaxReasoningEffort;
  maxOutputTokens?: number;
  client?: RaxModelClient;
  responseFormat?: NonNullable<RaxModelRequest["generation"]>["responseFormat"];
};

export async function callModelAdapterPrompt(
  prompt: string,
  instructions: string,
  options: ModelAdapterPromptOptions = {},
): Promise<string> {
  const provider = options.provider ?? process.env.AGENTCORE_MODEL_PROVIDER ?? "openai";
  const model = options.model ?? process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
  const route = options.route ?? process.env.AGENTCORE_MODEL_ROUTE ?? provider;
  const baseUrl = options.baseUrl ?? process.env.AGENTCORE_MODEL_BASE_URL;
  const apiKeyEnv = options.apiKeyEnv ?? process.env.AGENTCORE_MODEL_API_KEY_ENV;
  const reasoningEffort =
    options.reasoningEffort ??
    process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
    process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
    process.env.OPENAI_REASONING_EFFORT ??
    "low";
  const maxOutputTokens = options.maxOutputTokens ?? Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
  const providerDefinition = defaultProviderRegistry.get(provider);
  const client = options.client ?? createDefaultRaxModelClient();
  const auth = providerDefinition
    ? createProviderAuthRef(providerDefinition, { env: apiKeyEnv })
    : { type: "api_key" as const, env: apiKeyEnv ?? "OPENAI_API_KEY" };

  const request: RaxModelRequest = {
    model: {
      provider,
      model,
      route,
      ...(baseUrl ? { baseUrl } : {}),
      auth,
    },
    system: [{ type: "text", text: instructions }],
    messages: [{ role: "user", content: prompt }],
    generation: {
      maxOutputTokens,
      reasoningEffort,
      ...(options.responseFormat ? { responseFormat: options.responseFormat } : {}),
    },
  };

  const response = await client.generate(request);
  return response.text.trim();
}
