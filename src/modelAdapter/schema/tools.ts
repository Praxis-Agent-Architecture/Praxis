export type RaxJsonObjectSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean | Record<string, unknown>;
  [key: string]: unknown;
};

export type RaxUnifiedToolDefinition = {
  kind?: "function";
  name: string;
  description?: string;
  inputSchema: RaxJsonObjectSchema;
  strict?: boolean;
  metadata?: Record<string, unknown>;
};

export type RaxNativeToolDefinition = {
  kind: "native";
  provider: string;
  name: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type RaxToolDefinition = RaxUnifiedToolDefinition | RaxNativeToolDefinition;

export type RaxToolChoice =
  | "auto"
  | "none"
  | "required"
  | {
      type: "tool";
      name: string;
    };

export type RaxToolCall = {
  id: string;
  name: string;
  input: unknown;
  providerName?: string;
  providerPayload?: Record<string, unknown>;
};

const SAFE_TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export function toProviderToolName(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
  return SAFE_TOOL_NAME.test(clean) ? clean : `tool_${Math.abs(hashString(name))}`;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

