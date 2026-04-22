import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  harnessReceiverInterfaceDescriptor,
  receiveHarnessReceiverInterface,
} from "../../../../src/agentCore/agent_modelAdapter/abstractionLayer/harnessReceiverInterface.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_modelAdapter/abstractionLayer/harnessReceiverInterface.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_modelAdapter/abstractionLayer/harnessReceiverInterface.md",
  testFileUrl: import.meta.url,
});

test("receiveHarnessReceiverInterface accepts a guarded provider capability signal", () => {
  const result = receiveHarnessReceiverInterface({
    receiverId: " receiver:model ",
    harnessId: " harness:registry ",
    runtimeId: " runtime:one ",
    allowedSources: ["provider-carrier", "custom-format"],
    requestedScopes: ["chat"],
    allowedScopes: ["chat", "vision"],
    signal: {
      providerId: " openai ",
      modelId: " gpt-capability ",
      source: "provider-carrier",
      capabilities: ["chat", "chat", "vision"],
      scopes: [" chat "],
      formatHints: ["responses", "responses"],
      rawShapeRef: "carrier:openai:v1-responses",
      outputInterfaces: [
        {
          interfaceId: " text-stream ",
          modality: " text ",
          channels: ["stream", "single", "stream"],
          scopes: ["chat"],
        },
      ],
    },
  });

  assert.equal(harnessReceiverInterfaceDescriptor.networkCalled, false);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected harness receiver interface to accept signal");
  }

  assert.equal(result.received.kind, "harness-receiver-interface");
  assert.equal(result.received.receiverId, "receiver:model");
  assert.equal(result.received.harnessId, "harness:registry");
  assert.equal(result.received.providerId, "openai");
  assert.equal(result.received.modelId, "gpt-capability");
  assert.equal(result.received.source, "provider-carrier");
  assert.equal(result.received.providerRawShapeExposed, false);
  assert.equal(result.received.networkCalled, false);
  assert.equal(result.received.providerCallPlanned, false);
  assert.equal(result.received.unsafeSideEffects, false);
  assert.deepEqual(result.received.capabilities, ["chat", "vision"]);
  assert.deepEqual(result.received.outputInterfaces[0]?.channels, ["stream", "single"]);
});

test("receiveHarnessReceiverInterface can receive custom-format hints without freezing provider schema", () => {
  const result = receiveHarnessReceiverInterface({
    receiverId: "receiver",
    harnessId: "custom",
    allowedSources: ["custom-format"],
    signal: {
      providerId: "local-gateway",
      source: "custom-format",
      formatHints: ["openai-compatible-json"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected custom-format signal to be accepted");
  }

  assert.equal(result.received.source, "custom-format");
  assert.deepEqual(result.received.formatHints, ["openai-compatible-json"]);
  assert.deepEqual(result.received.capabilities, []);
  assert.deepEqual(result.received.outputInterfaces, []);
  assert.equal(result.received.providerRawShapeExposed, false);
});

test("receiveHarnessReceiverInterface rejects empty input, source drift, and scope drift", () => {
  const missingReceiver = receiveHarnessReceiverInterface();
  assert.equal(missingReceiver.ok, false);
  if (missingReceiver.ok) {
    throw new Error("expected missing receiver rejection");
  }
  assert.equal(missingReceiver.error.code, "MISSING_RECEIVER_ID");
  assert.equal(missingReceiver.error.providerRawShapeExposed, false);

  const deniedSource = receiveHarnessReceiverInterface({
    receiverId: "receiver",
    harnessId: "harness",
    allowedSources: ["provider-carrier"],
    signal: { providerId: "provider", source: "custom-format", capabilities: ["chat"] },
  });
  assert.equal(deniedSource.ok, false);
  if (deniedSource.ok) {
    throw new Error("expected source rejection");
  }
  assert.equal(deniedSource.error.code, "SOURCE_DENIED");

  const deniedScope = receiveHarnessReceiverInterface({
    receiverId: "receiver",
    harnessId: "harness",
    requestedScopes: ["private"],
    allowedScopes: ["chat"],
    signal: { providerId: "provider", source: "provider-carrier", capabilities: ["chat"] },
  });
  assert.equal(deniedScope.ok, false);
  if (deniedScope.ok) {
    throw new Error("expected scope rejection");
  }
  assert.equal(deniedScope.error.code, "SCOPE_DENIED");

  const emptySignal = receiveHarnessReceiverInterface({
    receiverId: "receiver",
    harnessId: "harness",
    signal: { providerId: "provider", source: "provider-carrier" },
  });
  assert.equal(emptySignal.ok, false);
  if (emptySignal.ok) {
    throw new Error("expected empty signal rejection");
  }
  assert.equal(emptySignal.error.code, "EMPTY_CAPABILITY_SIGNAL");
});
