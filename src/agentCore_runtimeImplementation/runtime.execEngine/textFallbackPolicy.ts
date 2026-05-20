export type TextToolFallbackSource =
  | "provider-tools-disabled"
  | "provider-returned-no-tool-call"
  | "disabled";

export type TextToolFallbackDecision = {
  shouldRun: boolean;
  source: TextToolFallbackSource;
  degraded: boolean;
  modelDialogueReadyCredit: boolean;
  reason: string;
};

export type TextToolFallbackPolicyInput = {
  runOk: boolean;
  providerToolsEnabled: boolean;
  nativeToolCallCount: number;
  explicitFallbackRequestCount: number;
  inferredFallbackRequestCount: number;
};

export function decideTextToolFallback(input: TextToolFallbackPolicyInput): TextToolFallbackDecision {
  if (!input.runOk) {
    return {
      shouldRun: false,
      source: "disabled",
      degraded: true,
      modelDialogueReadyCredit: false,
      reason: "runtime run failed; text fallback must not mask provider/runtime errors",
    };
  }

  if (input.providerToolsEnabled && input.nativeToolCallCount > 0) {
    return {
      shouldRun: false,
      source: "disabled",
      degraded: true,
      modelDialogueReadyCredit: false,
      reason: "provider-native tool calls already occurred",
    };
  }

  if (!input.providerToolsEnabled) {
    const requestCount = input.explicitFallbackRequestCount + input.inferredFallbackRequestCount;
    return {
      shouldRun: requestCount > 0,
      source: requestCount > 0 ? "provider-tools-disabled" : "disabled",
      degraded: true,
      modelDialogueReadyCredit: false,
      reason: requestCount > 0
        ? "provider tools are disabled, so text fallback may run as a debug path"
        : "provider tools are disabled but no text fallback request was detected",
    };
  }

  if (input.explicitFallbackRequestCount > 0) {
    return {
      shouldRun: true,
      source: "provider-returned-no-tool-call",
      degraded: true,
      modelDialogueReadyCredit: false,
      reason: "provider returned no native tool call but model emitted an explicit fallback request",
    };
  }

  return {
    shouldRun: false,
    source: "disabled",
    degraded: true,
    modelDialogueReadyCredit: false,
    reason: input.inferredFallbackRequestCount > 0
      ? "provider tools are enabled; user-text inference is not allowed as a fallback"
      : "provider returned no native tool call and no explicit fallback request was detected",
  };
}
