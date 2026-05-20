export type RaxProviderId = string & { readonly __raxProviderId: unique symbol };
export type RaxModelId = string & { readonly __raxModelId: unique symbol };
export type RaxRouteId = string & { readonly __raxRouteId: unique symbol };
export type RaxProtocolId =
  | "openai.chat"
  | "openai.compatible_chat"
  | "openai.responses"
  | "anthropic.messages"
  | "google.generate_content"
  | "bedrock.converse"
  | "bedrock.event_stream"
  | "ollama.chat"
  | (string & {});

export function raxProviderId(value: string): RaxProviderId {
  return value as RaxProviderId;
}

export function raxModelId(value: string): RaxModelId {
  return value as RaxModelId;
}

export function raxRouteId(value: string): RaxRouteId {
  return value as RaxRouteId;
}

