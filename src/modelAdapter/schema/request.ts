import type { RaxModelId, RaxProviderId, RaxRouteId } from "./ids.js";
import type { RaxModelMessage, RaxSystemPart } from "./messages.js";
import type { RaxGenerationOptions, RaxHttpOptions, RaxProviderOptions } from "./options.js";
import type { RaxToolChoice, RaxToolDefinition } from "./tools.js";

export type RaxAuthRef =
  | { type: "api_key"; env?: string; value?: string; header?: string }
  | { type: "bearer"; env?: string; value?: string }
  | { type: "oauth"; token?: string; refreshToken?: string; expiresAt?: string }
  | { type: "none" };

export type RaxModelRef = {
  provider: RaxProviderId | string;
  model: RaxModelId | string;
  route?: RaxRouteId | string;
  baseUrl?: string;
  auth?: RaxAuthRef;
};

export type RaxModelRequest = {
  id?: string;
  model: RaxModelRef;
  system?: RaxSystemPart[];
  messages: RaxModelMessage[];
  tools?: RaxToolDefinition[];
  toolChoice?: RaxToolChoice;
  generation?: RaxGenerationOptions;
  providerOptions?: RaxProviderOptions;
  http?: RaxHttpOptions;
  metadata?: Record<string, unknown>;
};

export type RaxPreparedModelRequest = {
  id: string;
  routeId: string;
  protocolId: string;
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  redacted: {
    url: string;
    method: "POST";
    headers: Record<string, string>;
    body: unknown;
  };
  metadata: Record<string, unknown>;
};
