import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { inputRecord, namespaceMethod, objectArrayField, stringField } from "./validation.js";

export async function invokeUserAskCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const prompt = stringField(definition, input.value, "prompt");
  if (!prompt.ok) return prompt.result;
  const questions = objectArrayField(definition, input.value, "questions");
  if (!questions.ok) return questions.result;
  if ((prompt.value?.trim().length ?? 0) === 0 && (questions.value?.length ?? 0) === 0) {
    return {
      ok: false,
      toolId: definition.toolId,
      error: {
        code: "MISSING_REQUIRED_FIELD",
        message: "user.ask requires either a non-empty prompt or a questions array.",
        publicSafe: true,
      },
      events: ["basetool.core.user.ask.invalidInput"],
    };
  }
  const ask = namespaceMethod(definition, request, "userInteraction", "ask");
  if (!ask.ok) return ask.result;

  return callRuntimePort(definition, ask.value({ prompt: prompt.value, questions: questions.value ?? [] }), {
    portPath: "userInteraction.ask",
    metadata: { questionCount: questions.value?.length ?? 0 },
  });
}
