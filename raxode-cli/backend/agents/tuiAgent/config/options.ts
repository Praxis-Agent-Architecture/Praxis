export type RaxodeTuiProvider = "openai" | "anthropic";
export type RaxodeTuiEndpointShape = "responses" | "chat_completions" | "messages";
export type RaxodeTuiProviderRoute =
  | "chatgpt_codex_responses"
  | "openai_responses"
  | "openai_chat_completions"
  | "anthropic_messages";

export type RaxodeTuiOptions = {
  provider?: RaxodeTuiProvider;
  endpointShape?: RaxodeTuiEndpointShape;
  baseURL?: string;
  providerRoute?: RaxodeTuiProviderRoute;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "none" | "minimal";
  timeoutMs?: number;
};

export type NormalizedRaxodeTuiOptions = Required<Omit<RaxodeTuiOptions, "baseURL" | "providerRoute">> & {
  baseURL?: string;
  providerRoute?: RaxodeTuiProviderRoute;
};

export function normalizeRaxodeTuiOptions(options: RaxodeTuiOptions = {}): NormalizedRaxodeTuiOptions {
  return {
    provider: options.provider ?? (options.endpointShape === "messages" ? "anthropic" : "openai"),
    endpointShape: options.endpointShape ?? "responses",
    baseURL: options.baseURL,
    providerRoute: options.providerRoute,
    model: options.model ?? "gpt-5.4-mini",
    reasoningEffort: options.reasoningEffort ?? "low",
    timeoutMs: options.timeoutMs ?? 1800,
  };
}
