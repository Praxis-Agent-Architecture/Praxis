import { praxis } from "@praxis-ai/framework";
import type { ModelFleetSpec, ModelSpec } from "@praxis-ai/framework";
import { createModelMetadataRecord } from "../../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/modelMetadataRegistry.js";

import type { NormalizedRaxodeOptions } from "./raxodeOptions.js";

export function createRaxodeModel(options: NormalizedRaxodeOptions): ModelSpec {
  const metadata = createModelMetadataRecord({ provider: "openai", model: options.model });
  return praxis.model(options.model, {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.raxode.coding.primary",
    reasoning: {
      effort: options.reasoningEffort,
      summary: "concise",
    },
    metadata,
  });
}

export function createRaxodeModelFleet(options: NormalizedRaxodeOptions): ModelFleetSpec {
  const primaryMetadata = createModelMetadataRecord({ provider: "openai", model: options.model });
  return praxis.modelFleet.auto({
    primary: praxis.endpoint("/v1/responses", {
      role: "background",
      provider: "openai",
      model: options.model,
      carrierId: "carrier.raxode.coding.primary",
      capabilityMatrix: { text: true, reasoning: true, toolCalling: true, metadata: primaryMetadata },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 1, timeoutMs: 30_000 },
      metadata: primaryMetadata,
    }),
    fast: praxis.endpoint("/v1/responses", {
      role: "fast-path",
      provider: "openai",
      model: "gpt-5.4-mini",
      capabilityMatrix: { text: true, toolCalling: true },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 1, timeoutMs: 15_000 },
    }),
    image: praxis.endpoint("/v1/images", {
      role: "image-generation",
      provider: "openai",
      model: "gpt-image-style",
      capabilityMatrix: { imageGeneration: true },
      failurePolicy: { onUnavailable: "skip" },
    }),
    realtime: praxis.endpoint("/v1/realtime", {
      role: "realtime",
      provider: "openai",
      model: "gpt-realtime-style",
      capabilityMatrix: { realtime: true },
      failurePolicy: { onUnavailable: "skip" },
    }),
  }, {
    probeStrategy: "lazy",
    primaryRef: "primary",
    failurePolicy: {
      onUnavailable: "degrade",
      fallbackEndpointRef: "fast",
      maxRetries: 1,
      metadata: { optionalEndpointPolicy: "record-and-continue" },
    },
  });
}
