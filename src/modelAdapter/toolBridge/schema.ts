import type { RaxToolDefinition } from "../schema/index.js";

export type RaxToolBridgeResult = {
  tools: RaxToolDefinition[];
  nativeTools: RaxToolDefinition[];
  metadata?: Record<string, unknown>;
};

export function splitNativeRaxTools(tools: RaxToolDefinition[] = []): RaxToolBridgeResult {
  const nativeTools = tools.filter((tool) => tool.kind === "native");
  return {
    tools,
    nativeTools,
    metadata: { nativeToolCount: nativeTools.length, unifiedToolCount: tools.length - nativeTools.length },
  };
}
