import type { RaxModelId, RaxProviderId, RaxProtocolId } from "../schema/index.js";

export type RaxModelCatalogEntry = {
  providerId: RaxProviderId | string;
  modelId: RaxModelId | string;
  protocolId: RaxProtocolId;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsTools?: boolean;
  supportsReasoning?: boolean;
  supportsVision?: boolean;
  status?: "stable" | "preview" | "deprecated" | "unknown";
  metadata?: Record<string, unknown>;
};

export class RaxModelCatalog {
  readonly entries = new Map<string, RaxModelCatalogEntry>();

  register(entry: RaxModelCatalogEntry): void {
    this.entries.set(`${entry.providerId}:${entry.modelId}`, entry);
  }

  get(providerId: string, modelId: string): RaxModelCatalogEntry | undefined {
    return this.entries.get(`${providerId}:${modelId}`);
  }

  list(providerId?: string): RaxModelCatalogEntry[] {
    const entries = [...this.entries.values()];
    return providerId ? entries.filter((entry) => entry.providerId === providerId) : entries;
  }
}

export const defaultRaxModelCatalog = new RaxModelCatalog();
