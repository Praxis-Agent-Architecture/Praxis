import { praxis } from "@praxis-ai/framework";
import type { ModelFleetSpec, ModelSpec } from "@praxis-ai/framework";
import { createModelMetadataRecord } from "../../../../../src/agentCore/agent_modelAdapter/providerAccessLayer/modelMetadataRegistry.js";

import type { NormalizedRaxodeTuiOptions } from "./options.js";

export function createRaxodeTuiModel(options: NormalizedRaxodeTuiOptions): ModelSpec {
  const metadata = createModelMetadataRecord({ provider: "openai", model: options.model });
  return praxis.model(options.model, {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.raxode.tui.primary",
    reasoning: {
      effort: options.reasoningEffort,
      summary: "concise",
    },
    metadata,
  });
}

export function createRaxodeTuiModelFleet(options: NormalizedRaxodeTuiOptions): ModelFleetSpec {
  const metadata = createModelMetadataRecord({ provider: "openai", model: options.model });
  return praxis.modelFleet.auto({
    primary: praxis.endpoint("/v1/responses", {
      role: "background",
      provider: "openai",
      model: options.model,
      carrierId: "carrier.raxode.tui.primary",
      capabilityMatrix: { text: true, reasoning: true, metadata },
      failurePolicy: { onUnavailable: "degrade", maxRetries: 0, timeoutMs: options.timeoutMs },
      metadata,
    }),
  }, {
    probeStrategy: "lazy",
    primaryRef: "primary",
  });
}
