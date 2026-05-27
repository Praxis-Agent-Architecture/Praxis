export type RaxReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | (string & {});

export type RaxGenerationOptions = {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  stop?: string[];
  seed?: number;
  reasoningEffort?: RaxReasoningEffort;
  responseFormat?: "text" | "json" | { type: string; schema?: unknown };
};

export type RaxProviderOptions = {
  native?: Record<string, unknown>;
  headers?: Record<string, string>;
  query?: Record<string, string>;
};

export type RaxHttpOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

