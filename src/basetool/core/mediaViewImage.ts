import type { BaseToolDefinition, BaseToolInvokeRequest, BaseToolInvokeResult } from "../types.js";
import { callRuntimePort } from "./results.js";
import { compactRecord, inputRecord, namespaceMethod, numberField, stringField } from "./validation.js";

export async function invokeMediaViewImageCore(
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
): Promise<BaseToolInvokeResult> {
  const input = inputRecord(definition, request);
  if (!input.ok) return input.result;
  const imageRef = stringField(definition, input.value, "imageRef", { minLength: 1 });
  if (!imageRef.ok) return imageRef.result;
  const imagePath = stringField(definition, input.value, "imagePath", { minLength: 1 });
  if (!imagePath.ok) return imagePath.result;
  if (imageRef.value === undefined && imagePath.value === undefined) {
    return {
      ok: false,
      toolId: definition.toolId,
      error: {
        code: "MISSING_REQUIRED_FIELD",
        message: "media.viewImage requires either 'imageRef' or 'imagePath'.",
        publicSafe: true,
      },
      events: [`basetool.core.${definition.toolId}.failed`],
    };
  }
  const prompt = stringField(definition, input.value, "prompt");
  if (!prompt.ok) return prompt.result;
  const detail = stringField(definition, input.value, "detail", { allowed: ["low", "high", "auto"] });
  if (!detail.ok) return detail.result;
  const maxBytes = numberField(definition, input.value, "maxBytes");
  if (!maxBytes.ok) return maxBytes.result;
  const viewImage = namespaceMethod(definition, request, "media", "viewImage");
  if (!viewImage.ok) return viewImage.result;

  return callRuntimePort(
    definition,
    viewImage.value(compactRecord({
      imageRef: imageRef.value,
      imagePath: imagePath.value,
      prompt: prompt.value,
      detail: detail.value,
      maxBytes: maxBytes.value,
    })),
    {
      portPath: "media.viewImage",
      metadata: compactRecord({ imageRef: imageRef.value, imagePath: imagePath.value }),
    },
  );
}
