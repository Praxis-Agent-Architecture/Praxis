import assert from "node:assert/strict";
import test from "node:test";

import { getSemanticBaseToolDefinition } from "../../../../src/basetool/index.js";
import { lowerPraxisToolsForProvider, normalizeProviderInputSchema } from "../../../../src/modelAdapter/toolBridge/index.js";

test("provider tool lowering strips root schema combinators rejected by OpenAI Responses", () => {
  const normalized = normalizeProviderInputSchema({
    type: "object",
    properties: {
      imageRef: { type: "string" },
      imagePath: { type: "string" },
    },
    additionalProperties: false,
    anyOf: [{ required: ["imageRef"] }, { required: ["imagePath"] }],
    oneOf: [{ required: ["imageRef"] }],
    allOf: [{ type: "object" }],
    enum: ["invalid-at-root"],
    not: { required: ["forbidden"] },
  });

  assert.equal(normalized.type, "object");
  assert.deepEqual(Object.keys(normalized.properties as Record<string, unknown>).sort(), ["imagePath", "imageRef"]);
  for (const keyword of ["anyOf", "oneOf", "allOf", "enum", "not", "const"]) {
    assert.equal(keyword in normalized, false, `${keyword} must not be emitted at the provider parameters root`);
  }
});

test("media.viewImage lowers to an OpenAI Responses-compatible parameters object", () => {
  const definition = getSemanticBaseToolDefinition("media.viewImage");
  assert.notEqual(definition, undefined);

  const bundle = lowerPraxisToolsForProvider({
    providerFamily: "openaiResponses",
    includeRuntimeDecisionTools: false,
    tools: [
      {
        toolId: definition!.toolId,
        family: definition!.family,
        group: definition!.group,
        description: definition!.description,
        inputSchema: definition!.inputSchema.schema,
      },
    ],
  });

  const [tool] = bundle.tools;
  assert.equal(tool?.type, "function");
  assert.equal(tool?.name, "praxis_tool_media_viewImage");
  const parameters = tool?.parameters as Record<string, unknown> | undefined;
  assert.equal(parameters?.type, "object");
  assert.equal("anyOf" in (parameters ?? {}), false);
  assert.equal("oneOf" in (parameters ?? {}), false);
  assert.equal("allOf" in (parameters ?? {}), false);
  assert.equal("enum" in (parameters ?? {}), false);
  assert.equal("not" in (parameters ?? {}), false);
});
