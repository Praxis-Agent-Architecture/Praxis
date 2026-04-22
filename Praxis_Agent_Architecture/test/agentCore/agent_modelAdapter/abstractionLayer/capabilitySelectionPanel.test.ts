import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  capabilitySelectionPanelDescriptor,
  createCapabilitySelectionPanel,
} from "../../../../src/agentCore/agent_modelAdapter/abstractionLayer/capabilitySelectionPanel.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/abstractionLayer/capabilitySelectionPanel.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/abstractionLayer/capabilitySelectionPanel.md",
  testFileUrl: import.meta.url,
});

test("createCapabilitySelectionPanel ranks abstracted model capabilities without provider calls", () => {
  const result = createCapabilitySelectionPanel({
    panelId: " panel:chat ",
    runtimeId: " runtime:one ",
    allowedScopes: ["chat", "vision"],
    intent: {
      requiredModalities: [" text ", "text"],
      requiredInterfaces: ["stream"],
      requiredScopes: ["chat"],
      preferredProviderId: "openai",
      priority: "quality",
    },
    candidates: [
      {
        capabilityId: "anthropic:sonnet",
        providerId: "anthropic",
        modelId: "sonnet",
        modalities: ["text"],
        interfaces: ["stream"],
        scopes: ["chat"],
        qualityScore: 8,
        costScore: 7,
        latencyScore: 5,
        stabilityScore: 7,
      },
      {
        capabilityId: "openai:gpt",
        providerId: "openai",
        modelId: "gpt",
        modalities: ["text", "image"],
        interfaces: ["single", "stream"],
        scopes: ["chat", "vision"],
        qualityScore: 9,
        costScore: 6,
        latencyScore: 6,
        stabilityScore: 8,
      },
    ],
  });

  assert.equal(capabilitySelectionPanelDescriptor.providerCallPlanned, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected capability selection panel to be created");
  }

  assert.equal(result.panel.kind, "capability-selection-panel");
  assert.equal(result.panel.panelId, "panel:chat");
  assert.equal(result.panel.runtimeId, "runtime:one");
  assert.equal(result.panel.providerRawShapeExposed, false);
  assert.equal(result.panel.providerCallPlanned, false);
  assert.equal(result.panel.unsafeSideEffects, false);
  assert.equal(result.panel.bridgeReady, true);
  assert.equal(result.panel.selected?.capabilityId, "openai:gpt");
  assert.equal(result.panel.selected?.rank, 1);
  assert.deepEqual(result.panel.intent.requiredScopes, ["chat"]);
});

test("createCapabilitySelectionPanel filters incompatible candidates by intent and scope", () => {
  const result = createCapabilitySelectionPanel({
    panelId: "panel:audio",
    allowedScopes: ["audio"],
    intent: {
      requiredModalities: ["audio"],
      requiredScopes: ["audio"],
      priority: "latency",
    },
    candidates: [
      {
        capabilityId: "text-only",
        providerId: "provider",
        modalities: ["text"],
        scopes: ["audio"],
        latencyScore: 10,
      },
      {
        capabilityId: "audio-fast",
        providerId: "provider",
        modalities: ["audio"],
        scopes: ["audio"],
        compatibility: "partial",
        gaps: ["missing batch output"],
        latencyScore: 9,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected partial audio capability to be selectable");
  }

  assert.equal(result.panel.options.length, 1);
  assert.equal(result.panel.selected?.capabilityId, "audio-fast");
  assert.equal(result.panel.selected?.compatibility, "partial");
  assert.deepEqual(result.panel.selected?.gaps, ["missing batch output"]);
});

test("createCapabilitySelectionPanel rejects missing input, denied scopes, and no compatible candidate", () => {
  const missingPanel = createCapabilitySelectionPanel();
  assert.equal(missingPanel.ok, false);
  if (missingPanel.ok) {
    throw new Error("expected missing panel rejection");
  }
  assert.equal(missingPanel.error.code, "MISSING_PANEL_ID");
  assert.equal(missingPanel.error.safeForRuntimeInspection, true);

  const deniedScope = createCapabilitySelectionPanel({
    panelId: "panel",
    intent: { requiredScopes: ["private"] },
    allowedScopes: ["chat"],
    candidates: [{ capabilityId: "cap", providerId: "provider", scopes: ["private"] }],
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");

  const noMatch = createCapabilitySelectionPanel({
    panelId: "panel",
    intent: { requiredModalities: ["image"] },
    candidates: [{ capabilityId: "text", providerId: "provider", modalities: ["text"] }],
  });
  assert.equal(noMatch.ok, false);
  if (noMatch.ok) {
    throw new Error("expected no compatible capability rejection");
  }
  assert.equal(noMatch.error.code, "NO_COMPATIBLE_CAPABILITY");
});
