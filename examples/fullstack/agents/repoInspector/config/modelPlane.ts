import { praxis } from "@praxis-ai/praxis";
import type { ModelFleetSpec, ModelSpec } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "./repoInspectorOptions.js";

export function createRepoInspectorModel(options: NormalizedRepoInspectorOptions): ModelSpec {
  return praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: `carrier.example.repoInspector.${options.mode}.${options.policyProfile}`,
    reasoning: {
      effort: options.mode === "deep" ? "high" : "low",
      summary: "concise",
    },
  });
}

export function createRepoInspectorModelFleet(options: NormalizedRepoInspectorOptions): ModelFleetSpec {
  return praxis.modelFleet.auto({
    primary: praxis.endpoint("/v1/responses", {
      role: "background",
      provider: "openai",
      model: "gpt-5.5",
      carrierId: `carrier.example.repoInspector.${options.mode}.${options.policyProfile}`,
      capabilityMatrix: { text: true, toolCalling: true },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 1, timeoutMs: 20_000 },
    }),
    reasoning: praxis.endpoint("/v1/messages", {
      role: "reasoning",
      provider: "anthropic-compatible",
      model: "claude-opus-style",
      capabilityMatrix: { text: true, reasoning: true, metadata: { longContext: true } },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 1 },
    }),
    image: praxis.endpoint("/v1/images", {
      role: "image-generation",
      provider: "openai",
      model: "gpt-image-style",
      capabilityMatrix: { imageGeneration: true },
      failurePolicy: { onUnavailable: "skip" },
    }),
    batch: praxis.endpoint("/v1/batches", {
      role: "batch",
      provider: "openai",
      model: "gpt-batch-style",
      capabilityMatrix: { batch: true },
      failurePolicy: { onUnavailable: "skip", maxRetries: 1 },
    }),
    realtime: praxis.endpoint("/v1/realtime", {
      role: "realtime",
      provider: "openai",
      model: "gpt-realtime-style",
      capabilityMatrix: { realtime: true },
      failurePolicy: { onUnavailable: "degrade" },
    }),
  }, {
    probeStrategy: "lazy",
    primaryRef: "primary",
    failurePolicy: {
      onUnavailable: "degrade",
      fallbackEndpointRef: "primary",
      maxRetries: 1,
      metadata: {
        optionalEndpointPolicy: "record-and-continue",
      },
    },
  });
}
