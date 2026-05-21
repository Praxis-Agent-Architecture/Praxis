import type { ToolBaseDefinition, ToolBaseProviderCapability } from "./types.js";

export type ProviderNeutralToolSpec = {
  name: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  metadata: Readonly<{
    praxisToolId: string;
    risk: string;
    layer: string;
    interaction: string;
  }>;
};

export function toProviderNeutralToolSpec(
  definition: ToolBaseDefinition,
  provider?: ToolBaseProviderCapability,
): ProviderNeutralToolSpec {
  return {
    name: encodeProviderToolName(definition.id),
    description: definition.description,
    inputSchema: adaptSchemaForProvider(definition.inputSchema, provider),
    metadata: {
      praxisToolId: definition.id,
      risk: definition.risk,
      layer: definition.layer,
      interaction: definition.interaction,
    },
  };
}

export function toProviderNeutralToolSpecs(
  definitions: readonly ToolBaseDefinition[],
  provider?: ToolBaseProviderCapability,
): readonly ProviderNeutralToolSpec[] {
  return definitions.map((definition) => toProviderNeutralToolSpec(definition, provider));
}

export function encodeProviderToolName(toolId: string): string {
  return toolId.replaceAll(".", "__");
}

export function decodeProviderToolName(name: string): string {
  return name.replaceAll("__", ".");
}

function adaptSchemaForProvider(
  schema: Readonly<Record<string, unknown>>,
  provider: ToolBaseProviderCapability | undefined,
): Readonly<Record<string, unknown>> {
  if (provider?.supportsStrictJsonSchema !== false) {
    return schema;
  }

  return {
    ...schema,
    additionalProperties: true,
  };
}
