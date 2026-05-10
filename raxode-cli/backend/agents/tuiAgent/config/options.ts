export type RaxodeTuiOptions = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "none" | "minimal";
  timeoutMs?: number;
};

export type NormalizedRaxodeTuiOptions = Required<RaxodeTuiOptions>;

export function normalizeRaxodeTuiOptions(options: RaxodeTuiOptions = {}): NormalizedRaxodeTuiOptions {
  return {
    model: options.model ?? "gpt-5.4-mini",
    reasoningEffort: options.reasoningEffort ?? "low",
    timeoutMs: options.timeoutMs ?? 1800,
  };
}
