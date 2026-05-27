import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { inputRecord, namespaceMethod, objectArrayField, stringField } from "./validation.js";

export async function invokePlanUpdateCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const explanation = stringField(definition, input.value, "explanation");
  if (!explanation.ok) return explanation.result;
  const plan = objectArrayField(definition, input.value, "plan");
  if (!plan.ok) return plan.result;
  const update = namespaceMethod(definition, request, "plan", "update");
  if (!update.ok) return update.result;

  return callRuntimePort(definition, update.value({ explanation: explanation.value, plan: plan.value ?? [] }), {
    portPath: "plan.update",
    metadata: { itemCount: plan.value?.length ?? 0 },
  });
}
