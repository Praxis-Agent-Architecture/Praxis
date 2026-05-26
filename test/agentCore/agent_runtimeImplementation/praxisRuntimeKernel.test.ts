import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";
import { createApiKeyAuthEnvelope } from "../../../src/modelAdapter/authProfileLayer/authEnvelope.js";
import { createChatGPTCodexAuthEnvelope } from "../../../src/modelAdapter/authProfileLayer/codexAuth.js";
import { createCredentialRef } from "../../../src/modelAdapter/authProfileLayer/credentialRef.js";
import { createRuntimeBaseToolExecutorPort } from "../../../src/runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.js";
import {
  PraxisAgent,
  PromptPack,
  compileAgent,
  harness,
  loop,
  model,
  policy,
  sandbox as sandboxHelper,
  session,
  storage as storageHelper,
  tool,
  toolPolicies,
  tools,
} from "../../../src/runtimeImplementation/runtimeAgentManifest.js";
import { createPraxisRuntimeKernel } from "../../../src/runtimeImplementation/praxisRuntimeKernel.js";
import { createInMemorySessionStateEventStore } from "../../../src/runtimeImplementation/runtimeSessionStateEventStore.js";
import {
  bindRuntimeAuthRole,
  createInMemoryRuntimeAuthSecretVault,
  createRuntimeAuthModelEntry,
  createRuntimeAuthProviderProfile,
  createRuntimeAuthRegistry,
  createRuntimeAuthResolver,
  createRuntimeAuthSecretRecord,
  runtimeAuthCredentialRef,
} from "../../../src/runtimeImplementation/runtime.authPlane/index.js";

defineAgentCoreContractTest({
  sourcePath: "src/runtimeImplementation/praxisRuntimeKernel.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.md",
  testFileUrl: import.meta.url,
});

function authEnvelope() {
  const ref = createCredentialRef({
    id: "chatgpt",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) throw new Error("expected credential ref");

  return createChatGPTCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "codex-access-token-secret",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "workspace-secret-id",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

class PlainAgent extends PraxisAgent {
  identity = "agent.plain";
  model = model("gpt-5.4", { carrierId: "carrier.plain" });
  harness = harness({
    policy: policy({ allowProviderCall: true }),
    loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
  });
}

function apiKeyAuthEnvelope(input: {
  provider: "openai" | "anthropic";
  credentialType: "openai_api_key" | "anthropic_api_key";
  apiKey: string;
}) {
  const ref = createCredentialRef({
    id: `${input.provider}-api`,
    provider: input.provider,
    credentialType: input.credentialType,
    source: { kind: "test", label: "unit" },
  });
  assert.equal(ref.ok, true);
  if (!ref.ok) throw new Error("expected credential ref");
  return createApiKeyAuthEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: input.apiKey,
    ...(input.provider === "anthropic"
      ? { headerName: "x-api-key", extraHeaders: { "anthropic-version": "2023-06-01" } }
    : {}),
  }).envelope;
}

test("PraxisRuntimeKernel.run compiles an Agent and returns a codex responses text output", async () => {
  const store = createInMemorySessionStateEventStore();
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-test", store });
  const result = await kernel.run(new PlainAgent(), "say hello", {
    sessionId: "session-plain",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async () => ({
      output_text: "hello from live model shim",
      usage: {
        input_tokens: 21,
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 3 },
      },
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(result.finalOutput, "hello from live model shim");
  assert.equal(result.modelCalls.length, 1);
  assert.equal(result.modelCalls[0]?.usage?.inputTokens, 21);
  assert.equal(result.modelCalls[0]?.usage?.outputTokens, 5);
  assert.equal(result.modelCalls[0]?.usage?.thinkingTokens, 3);
  assert.equal(result.toolCalls.length, 0);
  assert.equal(result.state.session?.status, "completed");
  assert.equal(result.state.events.some((event) => event.type === "runtime.output.final"), true);
  const mainLoopBudgetState = result.state.states.find((stateRecord) => stateRecord.stateId.startsWith("state:mainLoopEngine:") && stateRecord.phase === "completed");
  assert.equal((mainLoopBudgetState?.metadata.budgetUsage as { totalTokens?: number } | undefined)?.totalTokens, 26);
});

test("PraxisRuntimeKernel.runManifest executes compact at a prompt boundary and rebuilds before model invocation", async () => {
  class CompactAgent extends PraxisAgent {
    identity = "agent.compact-boundary";
    model = model("gpt-5.4", {
      carrierId: "carrier.compact-boundary",
      metadata: {
        contextWindowTokens: 100_000,
        maxOutputTokens: 16,
      },
    });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const compiled = compileAgent(new CompactAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const compactCalls: unknown[] = [];
  const providerBodies: unknown[] = [];
  const store = createInMemorySessionStateEventStore();
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-compact-boundary", store }).runManifest(
    compiled.manifest,
    "say hello after compact",
    {
      sessionId: "session-compact-boundary",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      compactContextWindowTokens: 100_000,
      compactThresholdRatio: 0.0001,
      compactExecutor: {
        compact: async (request) => {
          compactCalls.push(request);
          return {
            ok: true,
            sessionSummaryText: "Compacted prompt history summary for the next model call.",
            recentConversationText: "runtime-summary: keep the active focus after compact.",
            record: {
              kind: "praxis.contextCompact.record",
              compactId: "compact.boundary.1",
              sessionId: request.sessionId,
              trigger: request.trigger,
              thresholdRatio: request.thresholdRatio ?? 0.95,
              before: {
                estimatedTokens: request.estimatedTokens,
                materialRefs: request.materialRefs,
              },
              after: {
                estimatedTokens: 24,
                sessionSummaryRef: "summary.compact.boundary.1",
                recentConversationRefs: ["recent.compact.boundary.1"],
              },
              compactedMaterialRefs: request.materialRefs,
              artifactRefs: [],
              createdAt: "2026-05-26T00:00:00.000Z",
              executor: "application",
              metadata: {},
              publicSafe: true,
            },
            events: ["contextCompact.application.completed"],
          };
        },
      },
      providerCaller: async (request) => {
        providerBodies.push(request.body);
        return {
          output_text: "hello after compact",
          usage: { input_tokens: 11, output_tokens: 3 },
        };
      },
      now: () => "2026-05-26T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(result.finalOutput, "hello after compact");
  assert.equal(compactCalls.length, 1);
  assert.equal(providerBodies.length, 1);
  const providerBodyText = JSON.stringify(providerBodies[0]);
  assert.match(providerBodyText, /Compacted prompt history summary/);
  assert.match(providerBodyText, /keep the active focus after compact/);
  assert.equal(result.mainLoopSteps.filter((step) => step.actionPrimitive === "lowerPrompt").length >= 2, true);
  assert.equal(result.mainLoopSteps.some((step) =>
    step.actionPrimitive === "lowerPrompt" && step.metadata.compactRecordRef === "compact.boundary.1"
  ), true);
  assert.equal(result.state.events.some((record) => record.type === "runtime.contextCompact.thresholdDecision"), true);
  assert.equal(result.state.states.some((record) => record.stateId === "state:contextCompact:1" && record.phase === "summarizing"), true);
});

test("PraxisRuntimeKernel.runManifest applies preCompactGovernance before compact and rebuilds governed PromptPack", async () => {
  class GovernancePromptPack extends PromptPack {
    base = { kind: "markdown" as const, text: "Stable system core remains untouched." };
    inherits = ["repo-structure"];
    materials = ["project-conventions"];
  }

  class GovernanceAgent extends PraxisAgent {
    identity = "agent.pre-compact-governance";
    model = model("gpt-5.4", {
      carrierId: "carrier.pre-compact-governance",
      metadata: {
        contextWindowTokens: 100_000,
        maxOutputTokens: 16,
      },
    });
    promptPack = new GovernancePromptPack();
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const compiled = compileAgent(new GovernanceAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const compactCalls: unknown[] = [];
  const governancePackets: unknown[] = [];
  const providerBodies: unknown[] = [];
  const store = createInMemorySessionStateEventStore();
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-pre-compact-governance", store }).runManifest(
    compiled.manifest,
    "keep the current governance task",
    {
      sessionId: "session-pre-compact-governance",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      compactContextWindowTokens: 100_000,
      compactThresholdRatio: 0.0001,
      preCompactGovernanceExecutor: {
        govern: async (request) => {
          governancePackets.push(request.packet);
          return {
            ok: true,
            result: {
              kind: "praxis.preCompactGovernance.result",
              version: 1,
              sessionSummaryCandidate: {
                text: "Governed session summary keeps only current preCompactGovernance facts.",
                mode: "replace",
              },
              projectContextUpdates: [{
                id: "project.context.governed",
                text: "Governed project context update for Praxis compact-before-governance.",
                reason: "current task evidence",
                evidenceRefs: ["runtime.input.currentUserTurn"],
                confidence: 0.95,
              }],
              staleClaims: [{ text: "old compact design is still authoritative" }],
              preservedFacts: [{ text: "current task is preCompactGovernance" }],
              removedNoise: [{ text: "obsolete failed experiment", reason: "stale" }],
              uncertainty: [{ text: "future CMP remains out of scope" }],
              evidenceRefs: ["runtime.input.currentUserTurn"],
            },
            record: {
              kind: "praxis.preCompactGovernance.record",
              governanceId: "governance.precompact.1",
              sessionId: request.packet.sessionId,
              turnIndex: request.packet.turnIndex,
              trigger: request.packet.trigger,
              status: "completed",
              packetMaterialRefs: [
                ...request.packet.projectContext.map((material) => material.id),
                ...request.packet.sessionSummary.map((material) => material.id),
                ...request.packet.recentConversation.map((material) => material.id),
                "runtime.input.currentUserTurn",
              ],
              appliedSessionSummary: true,
              appliedProjectContextUpdates: 1,
              staleClaims: [{ text: "old compact design is still authoritative" }],
              preservedFacts: [{ text: "current task is preCompactGovernance" }],
              removedNoise: [{ text: "obsolete failed experiment", reason: "stale" }],
              uncertainty: [{ text: "future CMP remains out of scope" }],
              evidenceRefs: ["runtime.input.currentUserTurn"],
              createdAt: "2026-05-27T00:00:00.000Z",
              metadata: {},
              publicSafe: true,
            },
            events: ["preCompactGovernance.completed"],
          };
        },
      },
      compactExecutor: {
        compact: async (request) => {
          compactCalls.push(request);
          const materialText = JSON.stringify(request.materials);
          assert.match(materialText, /Governed session summary keeps only current/);
          assert.match(materialText, /Governed project context update/);
          assert.equal(request.materialRefs.includes("preCompactGovernance.sessionSummaryCandidate"), true);
          assert.equal(request.materialRefs.includes("project.context.governed"), true);
          return {
            ok: true,
            sessionSummaryText: "Compact executor summary after governance.",
            recentConversationText: "runtime-summary: keep current governance focus.",
            record: {
              kind: "praxis.contextCompact.record",
              compactId: "compact.pregovernance.1",
              sessionId: request.sessionId,
              trigger: request.trigger,
              thresholdRatio: request.thresholdRatio ?? 0.95,
              before: {
                estimatedTokens: request.estimatedTokens,
                materialRefs: request.materialRefs,
              },
              after: {
                estimatedTokens: 30,
                sessionSummaryRef: "summary.pregovernance.1",
                recentConversationRefs: ["recent.pregovernance.1"],
              },
              compactedMaterialRefs: request.materialRefs,
              artifactRefs: [],
              createdAt: "2026-05-27T00:00:00.000Z",
              executor: "application",
              metadata: {},
              publicSafe: true,
            },
            events: ["contextCompact.application.completed"],
          };
        },
      },
      providerCaller: async (request) => {
        providerBodies.push(request.body);
        return {
          output_text: "hello after governed compact",
          usage: { input_tokens: 13, output_tokens: 4 },
        };
      },
      now: () => "2026-05-27T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(compactCalls.length, 1);
  assert.equal(governancePackets.length, 1);
  const packetText = JSON.stringify(governancePackets[0]);
  assert.match(packetText, /repo-structure/);
  assert.match(packetText, /keep the current governance task/);
  const governancePacket = governancePackets[0] as {
    projectContext?: readonly { segmentKind?: string }[];
    sessionSummary?: readonly { segmentKind?: string }[];
    recentConversation?: readonly { segmentKind?: string }[];
    memoryContext?: readonly { segmentKind?: string }[];
    retrievedContext?: readonly { segmentKind?: string }[];
    observations?: readonly { segmentKind?: string }[];
  };
  const governedSegmentKinds = [
    ...(governancePacket.projectContext ?? []),
    ...(governancePacket.sessionSummary ?? []),
    ...(governancePacket.recentConversation ?? []),
    ...(governancePacket.memoryContext ?? []),
    ...(governancePacket.retrievedContext ?? []),
    ...(governancePacket.observations ?? []),
  ].map((material) => material.segmentKind);
  assert.equal(governedSegmentKinds.includes("toolDeclarations"), false);
  assert.equal(governedSegmentKinds.includes("assistantScratchpadPlan"), false);
  const providerBodyText = JSON.stringify(providerBodies[0]);
  assert.match(providerBodyText, /Governed session summary keeps only current/);
  assert.match(providerBodyText, /Compact executor summary after governance/);
  assert.match(providerBodyText, /Governed project context update/);
  assert.equal(result.state.events.some((record) => record.type === "runtime.preCompactGovernance.result"), true);
  assert.equal(result.state.states.some((record) => record.stateId === "state:preCompactGovernance:1" && record.phase === "completed"), true);
});

test("PraxisRuntimeKernel.runManifest falls back to normal compact when preCompactGovernance fails", async () => {
  const compiled = compileAgent(new PlainAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const compactCalls: unknown[] = [];
  const providerBodies: unknown[] = [];
  const store = createInMemorySessionStateEventStore();
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-pre-compact-governance-fail", store }).runManifest(
    compiled.manifest,
    "continue even if governance fails",
    {
      sessionId: "session-pre-compact-governance-fail",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      compactContextWindowTokens: 100_000,
      compactThresholdRatio: 0.0001,
      preCompactGovernanceExecutor: {
        govern: async (request) => ({
          ok: false,
          record: {
            kind: "praxis.preCompactGovernance.record",
            governanceId: "governance.failed.1",
            sessionId: request.packet.sessionId,
            turnIndex: request.packet.turnIndex,
            trigger: request.packet.trigger,
            status: "failed",
            packetMaterialRefs: [],
            appliedSessionSummary: false,
            appliedProjectContextUpdates: 0,
            staleClaims: [],
            preservedFacts: [],
            removedNoise: [],
            uncertainty: [],
            evidenceRefs: [],
            error: { code: "TEST_GOVERNANCE_FAILED", message: "simulated failure", publicSafe: true },
            createdAt: "2026-05-27T00:00:00.000Z",
            metadata: {},
            publicSafe: true,
          },
          events: ["preCompactGovernance.failed"],
        }),
      },
      compactExecutor: {
        compact: async (request) => {
          compactCalls.push(request);
          return {
            ok: true,
            sessionSummaryText: "Fallback compact summary without governance.",
            recentConversationText: "runtime-summary: keep focus after failed governance.",
            record: {
              kind: "praxis.contextCompact.record",
              compactId: "compact.governance-fallback.1",
              sessionId: request.sessionId,
              trigger: request.trigger,
              thresholdRatio: request.thresholdRatio ?? 0.95,
              before: {
                estimatedTokens: request.estimatedTokens,
                materialRefs: request.materialRefs,
              },
              after: {
                estimatedTokens: 20,
                sessionSummaryRef: "summary.governance-fallback.1",
                recentConversationRefs: ["recent.governance-fallback.1"],
              },
              compactedMaterialRefs: request.materialRefs,
              artifactRefs: [],
              createdAt: "2026-05-27T00:00:00.000Z",
              executor: "application",
              metadata: {},
              publicSafe: true,
            },
            events: ["contextCompact.application.completed"],
          };
        },
      },
      providerCaller: async (request) => {
        providerBodies.push(request.body);
        return {
          output_text: "hello after fallback compact",
          usage: { input_tokens: 12, output_tokens: 3 },
        };
      },
      now: () => "2026-05-27T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(compactCalls.length, 1);
  assert.equal(providerBodies.length, 1);
  assert.equal(result.finalOutput, "hello after fallback compact");
  assert.equal(result.events.includes("preCompactGovernance.failed"), true);
  assert.equal(result.state.events.some((record) => record.type === "runtime.preCompactGovernance.result"), true);
  assert.equal(result.state.states.some((record) => record.stateId === "state:preCompactGovernance:1" && record.phase === "failed"), true);
});

test("PraxisRuntimeKernel.runManifest fails before provider invocation when boundary compact fails", async () => {
  const compiled = compileAgent(new PlainAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-compact-fail" }).runManifest(
    compiled.manifest,
    "say hello after failed compact",
    {
      sessionId: "session-compact-fail",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      compactContextWindowTokens: 100_000,
      compactThresholdRatio: 0.0001,
      compactExecutor: {
        compact: async () => ({
          ok: false,
          error: {
            code: "COMPACT_ENDPOINT_FAILED",
            message: "compact endpoint failed",
            publicSafe: true,
          },
          events: ["contextCompact.application.failed"],
        }),
      },
      providerCaller: async () => assert.fail("provider should not be called when required compact fails"),
      now: () => "2026-05-26T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "PROMPT_PACK_FAILED");
  assert.equal(result.error.boundary, "runtime-state");
  assert.match(result.error.message, /compact endpoint failed/);
  assert.equal(result.events.includes("contextCompact.application.failed"), true);
});

test("PraxisRuntimeKernel.runManifest can interrupt before provider invocation", async () => {
  const store = createInMemorySessionStateEventStore();
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-interrupt", store });
  const compiled = compileAgent(new PlainAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const controller = new AbortController();
  controller.abort();
  const result = await kernel.runManifest(compiled.manifest, "stop now", {
    sessionId: "session-kernel-interrupt",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    interruptSignal: controller.signal,
    providerCaller: async () => assert.fail("provider should not be called after interrupt"),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MAIN_LOOP_INTERRUPTED");
  assert.notEqual(result.state, undefined);
  if (result.state === undefined) return;
  assert.equal(result.state.session?.status, "interrupted");
  assert.equal(result.state.states.some((stateRecord) => stateRecord.phase === "interrupted"), true);
});

test("PraxisRuntimeKernel.runManifest treats in-flight provider abort as interrupted", async () => {
  const store = createInMemorySessionStateEventStore();
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-interrupt-in-flight", store });
  const compiled = compileAgent(new PlainAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const controller = new AbortController();
  const result = await kernel.runManifest(compiled.manifest, "stop during call", {
    sessionId: "session-kernel-interrupt-in-flight",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    interruptSignal: controller.signal,
    providerCaller: async () => {
      controller.abort();
      const error = new Error("provider call aborted");
      error.name = "AbortError";
      throw error;
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MAIN_LOOP_INTERRUPTED");
  assert.notEqual(result.state, undefined);
  if (result.state === undefined) return;
  assert.equal(result.state.session?.status, "interrupted");
  assert.equal(result.state.states.some((stateRecord) => stateRecord.phase === "interrupted"), true);
});

test("PraxisRuntimeKernel.runManifest resolves manifest auth refs through runtime authPlane", async () => {
  class RuntimeAuthAgent extends PraxisAgent {
    identity = "agent.kernel-runtime-auth";
    model = model("gpt-5.5", {
      provider: "openai",
      endpointShape: "responses",
      carrierId: "carrier.kernel-runtime-auth",
      providerProfileRef: "profile.openai.kernel-runtime",
      modelEntryRef: "model.gpt-5.5.kernel-runtime",
      metadata: { providerRoute: "openai_responses" },
    });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.openai.kernel-runtime",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: "sk-runtime-kernel-secret" },
    keyProvider: () => "kernel-runtime-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;
  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.openai.kernel-runtime",
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://api.openai.com",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.openai.kernel-runtime",
      secretId: "secret.openai.kernel-runtime",
      provider: "openai",
      credentialType: "openai_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const modelEntry = createRuntimeAuthModelEntry({
    modelEntryId: "model.gpt-5.5.kernel-runtime",
    providerProfileRef: "profile.openai.kernel-runtime",
    model: "gpt-5.5",
  });
  assert.equal(profile.ok, true);
  assert.equal(modelEntry.ok, true);
  if (!profile.ok || !modelEntry.ok) return;

  const baseResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], modelEntries: [modelEntry.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "kernel-runtime-master-key",
  });
  const authSelections: unknown[] = [];
  const runtimeAuthResolver = {
    resolve: async (request: Parameters<typeof baseResolver.resolve>[0]) => {
      authSelections.push(request);
      return await baseResolver.resolve(request);
    },
  };

  const compiled = compileAgent(new RuntimeAuthAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-runtime-auth" }).runManifest(
    compiled.manifest,
    "say hello",
    {
      sessionId: "session-kernel-runtime-auth",
      dryRun: false,
      allowProviderCall: true,
      runtimeAuthResolver,
      openaiResponsesCaller: async (request) => {
        assert.equal(request.endpoint, "/v1/responses");
        assert.equal(request.url, "https://api.openai.com/v1/responses");
        return {
          id: "resp_runtime_auth",
          output_text: "hello from runtime authPlane",
          usage: { input_tokens: 7, output_tokens: 5 },
        };
      },
      now: () => "2026-05-25T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(authSelections, [{
    providerProfileRef: "profile.openai.kernel-runtime",
    modelEntryRef: "model.gpt-5.5.kernel-runtime",
  }]);
  assert.equal(result.finalOutput, "hello from runtime authPlane");
  assert.equal(result.modelCalls[0]?.usage?.inputTokens, 7);
  assert.equal(result.modelCalls[0]?.usage?.outputTokens, 5);
  assert.equal(JSON.stringify(result).includes("sk-runtime-kernel-secret"), false);

  class CredentialRefAuthAgent extends PraxisAgent {
    identity = "agent.kernel-runtime-auth-credential";
    model = model("gpt-5.5", {
      provider: "openai",
      endpointShape: "responses",
      carrierId: "carrier.kernel-runtime-auth-credential",
      credentialRefId: "credential.openai.kernel-runtime",
      modelEntryRef: "model.gpt-5.5.kernel-runtime",
      metadata: { providerRoute: "openai_responses" },
    });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }
  const credentialAuthSelections: unknown[] = [];
  const credentialRuntimeAuthResolver = {
    resolve: async (request: Parameters<typeof baseResolver.resolve>[0]) => {
      credentialAuthSelections.push(request);
      return await baseResolver.resolve(request);
    },
  };
  const credentialCompiled = compileAgent(new CredentialRefAuthAgent());
  assert.equal(credentialCompiled.ok, true);
  if (!credentialCompiled.ok) return;
  const credentialResult = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-runtime-auth-credential" }).runManifest(
    credentialCompiled.manifest,
    "say hello again",
    {
      sessionId: "session-kernel-runtime-auth-credential",
      dryRun: false,
      allowProviderCall: true,
      runtimeAuthResolver: credentialRuntimeAuthResolver,
      openaiResponsesCaller: async () => ({
        id: "resp_runtime_auth_credential",
        output_text: "hello from credential ref authPlane",
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
      now: () => "2026-05-25T00:00:00.000Z",
    },
  );

  assert.equal(credentialResult.ok, true);
  assert.deepEqual(credentialAuthSelections, [{
    credentialRefId: "credential.openai.kernel-runtime",
    modelEntryRef: "model.gpt-5.5.kernel-runtime",
  }]);
  assert.equal(credentialResult.ok ? credentialResult.finalOutput : undefined, "hello from credential ref authPlane");
  assert.equal(JSON.stringify(credentialResult).includes("sk-runtime-kernel-secret"), false);
});

test("PraxisRuntimeKernel.run routes OpenAI chat completions with chat tool schemas", async () => {
  class ChatCompletionsAgent extends PraxisAgent {
    identity = "agent.kernel-chat";
    model = model("deepseek-v4-pro", {
      provider: "openai",
      endpointShape: "chat_completions",
      carrierId: "carrier.kernel-chat",
      baseURL: "https://gateway.example.com/v1",
      reasoning: { effort: "high" },
      metadata: { providerRoute: "openai_chat_completions" },
    });
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-chat" }).run(
    new ChatCompletionsAgent(),
    "say hello",
    {
      sessionId: "session-kernel-chat",
      dryRun: false,
      allowProviderCall: true,
      auth: apiKeyAuthEnvelope({ provider: "openai", credentialType: "openai_api_key", apiKey: "sk-chat-secret" }),
      openaiChatCompletionsCaller: async (request) => {
        const body = request.requestBody as {
          messages?: unknown[];
          tools?: { type?: string; function?: { name?: string } }[];
          stream?: boolean;
          stream_options?: { include_usage?: boolean };
          thinking?: { type?: string };
          reasoning_effort?: string;
        };
        assert.equal(request.url, "https://gateway.example.com/v1/chat/completions");
        assert.equal(body.stream, true);
        assert.equal(body.stream_options?.include_usage, true);
        assert.deepEqual(body.thinking, { type: "enabled" });
        assert.equal(body.reasoning_effort, "max");
        assert.ok((body.messages?.length ?? 0) > 0);
        assert.equal(body.tools?.[0]?.type, "function");
        assert.equal(body.tools?.[0]?.function?.name, "praxis_tool_file_read");
        return {
          choices: [{ message: { role: "assistant", content: "hello from chat completions" } }],
          usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
        };
      },
      now: () => "2026-05-16T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "hello from chat completions");
  assert.equal(result.modelCalls[0]?.usage?.source, "openai.chat_completions.usage");
  assert.equal(result.modelCalls[0]?.usage?.totalTokens, 13);
});

test("PraxisRuntimeKernel.run replays OpenAI chat completions assistant tool calls before tool results", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-chat-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from chat completions tool\n", "utf8");

  class ChatCompletionsToolAgent extends PraxisAgent {
    identity = "agent.kernel-chat-tool";
    model = model("compatible-chat", {
      provider: "openai",
      endpointShape: "chat_completions",
      carrierId: "carrier.kernel-chat-tool",
      baseURL: "https://gateway.example.com/v1",
      metadata: { providerRoute: "openai_chat_completions" },
    });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  const providerBodies: unknown[] = [];
  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-kernel-chat-tool",
    sessionId: "session-kernel-chat-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-chat-tool" }).run(
    new ChatCompletionsToolAgent(),
    "read notes",
    {
      sessionId: "session-kernel-chat-tool",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: apiKeyAuthEnvelope({ provider: "openai", credentialType: "openai_api_key", apiKey: "sk-chat-secret" }),
      executor,
      openaiChatCompletionsCaller: async (request) => {
        calls += 1;
        providerBodies.push(request.requestBody);
        if (calls === 1) {
          const toolArguments = JSON.stringify({
            workspaceRoot: workspace,
            path: "notes.txt",
            dryRun: false,
            context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
          });
          return [
            `data: ${JSON.stringify({ choices: [{ delta: { content: "I will inspect the file." } }] })}`,
            "",
            `data: ${JSON.stringify({
              choices: [{
                delta: {
                  tool_calls: [{
                    index: 0,
                    id: "chat-tool-call-1",
                    type: "function",
                    function: {
                      name: "praxis_tool_file_read",
                      arguments: toolArguments.slice(0, 30),
                    },
                  }],
                },
                finish_reason: null,
              }],
            })}`,
            "",
            `data: ${JSON.stringify({
              choices: [{
                delta: {
                  tool_calls: [{
                    index: 0,
                    function: { arguments: toolArguments.slice(30) },
                  }],
                },
                finish_reason: "tool_calls",
              }],
            })}`,
            "",
            `data: ${JSON.stringify({
              choices: [],
              usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
            })}`,
            "",
            "data: [DONE]",
            "",
          ].join("\n");
        }

        const body = request.requestBody as {
          stream?: boolean;
          stream_options?: { include_usage?: boolean };
          messages?: Array<{ role?: string; tool_calls?: Array<{ id?: string }>; tool_call_id?: string }>;
        };
        assert.equal(body.stream, true);
        assert.equal(body.stream_options?.include_usage, true);
        const messages = body.messages ?? [];
        const assistantIndex = messages.findIndex((message) =>
          message.role === "assistant" &&
          (message.tool_calls ?? []).some((toolCall) => toolCall.id === "chat-tool-call-1")
        );
        const toolIndex = messages.findIndex((message) =>
          message.role === "tool" &&
          message.tool_call_id === "chat-tool-call-1"
        );
        assert.notEqual(assistantIndex, -1);
        assert.notEqual(toolIndex, -1);
        assert.ok(assistantIndex < toolIndex);
        return {
          choices: [{ message: { role: "assistant", content: "found needle from chat completions tool" } }],
          usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
        };
      },
      now: () => "2026-05-16T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.toolId, "file.read");
  assert.equal(result.finalOutput, "found needle from chat completions tool");
  assert.equal(providerBodies.length, 2);
});

test("PraxisRuntimeKernel.run routes OpenAI API responses separately from Codex", async () => {
  class OpenAIResponsesAgent extends PraxisAgent {
    identity = "agent.kernel-openai-responses";
    model = model("gpt-5.5", {
      provider: "openai",
      endpointShape: "responses",
      carrierId: "carrier.kernel-openai-responses",
      metadata: { providerRoute: "openai_responses" },
    });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-openai-responses" }).run(
    new OpenAIResponsesAgent(),
    "say hello",
    {
      sessionId: "session-kernel-openai-responses",
      dryRun: false,
      allowProviderCall: true,
      auth: apiKeyAuthEnvelope({ provider: "openai", credentialType: "openai_api_key", apiKey: "sk-openai-secret" }),
      openaiResponsesCaller: async (request) => {
        assert.equal(request.endpoint, "/v1/responses");
        assert.equal(request.url, "https://api.openai.com/v1/responses");
        assert.equal(request.headers.authorization, "[redacted:23]");
        return {
          id: "resp_1",
          output_text: "hello from openai api responses",
          usage: { input_tokens: 10, output_tokens: 4 },
        };
      },
      now: () => "2026-05-16T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "hello from openai api responses");
  assert.equal(result.modelCalls[0]?.usage?.source, "openai.responses.usage");
  assert.equal(result.modelCalls[0]?.usage?.inputTokens, 10);
});

test("PraxisRuntimeKernel.run routes Anthropic messages and reads message text", async () => {
  class AnthropicMessagesAgent extends PraxisAgent {
    identity = "agent.kernel-anthropic";
    model = model("claude-sonnet", {
      provider: "anthropic",
      endpointShape: "messages",
      carrierId: "carrier.kernel-anthropic",
      metadata: { providerRoute: "anthropic_messages" },
    });
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-anthropic" }).run(
    new AnthropicMessagesAgent(),
    "say hello",
    {
      sessionId: "session-kernel-anthropic",
      dryRun: false,
      allowProviderCall: true,
      auth: apiKeyAuthEnvelope({ provider: "anthropic", credentialType: "anthropic_api_key", apiKey: "sk-ant-secret" }),
      anthropicMessagesCaller: async (request) => {
        const body = request.body as { system?: string; messages?: unknown[]; tools?: { name?: string }[] };
        assert.equal(request.urlPath, "/v1/messages");
        assert.equal(body.tools?.[0]?.name, "praxis_tool_file_read");
        assert.ok((body.messages?.length ?? 0) > 0);
        assert.match(body.system ?? "", /PraxisRuntimeKernel/u);
        return {
          id: "msg_1",
          content: [{ type: "text", text: "hello from anthropic messages" }],
          usage: { input_tokens: 11, output_tokens: 5 },
        };
      },
      now: () => "2026-05-16T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "hello from anthropic messages");
  assert.equal(result.modelCalls[0]?.usage?.source, "anthropic.messages.usage");
  assert.equal(result.modelCalls[0]?.usage?.inputTokens, 11);
});

test("PraxisRuntimeKernel.run routes Gemini generateContent with native contents, tools, and tool-result replay", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-gemini-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from gemini tool\n", "utf8");

  class GeminiToolAgent extends PraxisAgent {
    identity = "agent.kernel-gemini-tool";
    model = model("gemini-3.5-flash", {
      provider: "gemini",
      endpointShape: "gemini_generate_content",
      carrierId: "carrier.kernel-gemini-tool",
      baseURL: "https://generativelanguage.googleapis.com",
    });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const bodies: unknown[] = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-kernel-gemini-tool",
    sessionId: "session-kernel-gemini-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const secret = await createRuntimeAuthSecretRecord({
    secretId: "secret.kernel.gemini-tool",
    provider: "gemini",
    secretKind: "api_key",
    plaintext: { apiKey: "gemini-kernel-secret" },
    keyProvider: () => "kernel-gemini-master-key",
  });
  assert.equal(secret.ok, true);
  if (!secret.ok) return;
  const profile = createRuntimeAuthProviderProfile({
    profileId: "profile.kernel.gemini-tool",
    provider: "gemini",
    endpointShape: "gemini_generate_content",
    baseURL: "https://generativelanguage.googleapis.com",
    credentialRef: runtimeAuthCredentialRef({
      credentialRefId: "credential.kernel.gemini-tool",
      secretId: "secret.kernel.gemini-tool",
      provider: "gemini",
      credentialType: "gemini_api_key",
      secretKind: "api_key",
      publicSafe: true,
    }),
  });
  const modelEntry = createRuntimeAuthModelEntry({
    modelEntryId: "model.kernel.gemini-tool",
    providerProfileRef: "profile.kernel.gemini-tool",
    model: "gemini-3.5-flash",
  });
  const binding = bindRuntimeAuthRole({
    role: "primary",
    providerProfileRef: "profile.kernel.gemini-tool",
    modelEntryRef: "model.kernel.gemini-tool",
  });
  assert.equal(profile.ok, true);
  assert.equal(modelEntry.ok, true);
  assert.equal(binding.ok, true);
  if (!profile.ok || !modelEntry.ok || !binding.ok) return;
  const runtimeAuthResolver = createRuntimeAuthResolver({
    registry: createRuntimeAuthRegistry({ profiles: [profile.value], modelEntries: [modelEntry.value], roleBindings: [binding.value] }),
    vault: createInMemoryRuntimeAuthSecretVault([secret.value]),
    keyProvider: () => "kernel-gemini-master-key",
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-gemini-tool" }).run(
    new GeminiToolAgent(),
    "read notes",
    {
      sessionId: "session-kernel-gemini-tool",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      runtimeAuthResolver,
      authSelection: { role: "primary" },
      executor,
      geminiGenerateContentTransport: (envelope) => {
        calls += 1;
        bodies.push(envelope.body);
        assert.equal(envelope.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent");
        assert.equal(envelope.headers["x-goog-api-key"], "gemini-kernel-secret");

        const body = envelope.body as {
          contents?: Array<{ role?: string; parts?: Array<Record<string, unknown>> }>;
          config?: { tools?: Array<{ functionDeclarations?: Array<{ name?: string }> }> };
          input?: unknown;
          tools?: unknown;
        };
        assert.equal(body.input, undefined);
        assert.equal(body.tools, undefined);
        assert.equal(body.config?.tools?.[0]?.functionDeclarations?.some((declaration) => declaration.name === "praxis_tool_file_read"), true);
        assert.ok((body.contents?.length ?? 0) > 0);

        if (calls === 1) {
          return {
            statusCode: 200,
            body: {
              candidates: [{
                content: {
                  role: "model",
                  parts: [
                    { text: "I will inspect the file." },
                    {
                      functionCall: {
                        id: "gemini-tool-call-1",
                        name: "praxis_tool_file_read",
                        args: {
                          workspaceRoot: workspace,
                          path: "notes.txt",
                          dryRun: false,
                          context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
                        },
                      },
                    },
                  ],
                },
              }],
            },
          };
        }

        const contents = body.contents ?? [];
        const modelFunctionCallIndex = contents.findIndex((content) =>
          content.role === "model" &&
          (content.parts ?? []).some((part) =>
            typeof part.functionCall === "object" &&
            part.functionCall !== null &&
            !Array.isArray(part.functionCall) &&
            (part.functionCall as { id?: unknown }).id === "gemini-tool-call-1"
          )
        );
        const functionResponseIndex = contents.findIndex((content) =>
          content.role === "user" &&
          (content.parts ?? []).some((part) =>
            typeof part.functionResponse === "object" &&
            part.functionResponse !== null &&
            !Array.isArray(part.functionResponse) &&
            (part.functionResponse as { id?: unknown }).id === "gemini-tool-call-1"
          )
        );
        assert.notEqual(modelFunctionCallIndex, -1);
        assert.notEqual(functionResponseIndex, -1);
        assert.ok(modelFunctionCallIndex < functionResponseIndex);
        return {
          statusCode: 200,
          body: {
            candidates: [{
              content: { role: "model", parts: [{ text: "found needle from gemini tool" }] },
            }],
          },
        };
      },
      now: () => "2026-05-25T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.toolId, "file.read");
  assert.equal(result.finalOutput, "found needle from gemini tool");
  assert.equal(bodies.length, 2);
});

test("PraxisRuntimeKernel.run replays Anthropic assistant tool_use before tool_result", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-anthropic-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from anthropic tool\n", "utf8");

  class AnthropicToolAgent extends PraxisAgent {
    identity = "agent.kernel-anthropic-tool";
    model = model("deepseek-v4-pro", {
      provider: "anthropic",
      endpointShape: "messages",
      carrierId: "carrier.kernel-anthropic-tool",
      baseURL: "https://gateway.example.com/anthropic",
      metadata: { providerRoute: "anthropic_messages" },
    });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  const providerBodies: unknown[] = [];
  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-kernel-anthropic-tool",
    sessionId: "session-kernel-anthropic-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-anthropic-tool" }).run(
    new AnthropicToolAgent(),
    "read notes",
    {
      sessionId: "session-kernel-anthropic-tool",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: apiKeyAuthEnvelope({ provider: "anthropic", credentialType: "anthropic_api_key", apiKey: "sk-ant-secret" }),
      executor,
      anthropicMessagesCaller: async (request) => {
        calls += 1;
        providerBodies.push(request.body);
        if (calls === 1) {
          const toolArguments = JSON.stringify({
            workspaceRoot: workspace,
            path: "notes.txt",
            dryRun: false,
            context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
          });
          return [
            `data: ${JSON.stringify({
              type: "message_start",
              message: {
                id: "msg_anthropic_tool_1",
                type: "message",
                role: "assistant",
                model: "deepseek-v4-pro",
                content: [],
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_start",
              index: 0,
              content_block: {
                type: "thinking",
                thinking: "",
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "thinking_delta", thinking: "I need to inspect the file before answering." },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "signature_delta", signature: "sig-ant-tool-call-1" },
            })}`,
            "",
            `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_start",
              index: 1,
              content_block: {
                type: "tool_use",
                id: "ant-tool-call-1",
                name: "praxis_tool_file_read",
                input: {},
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 1,
              delta: { type: "input_json_delta", partial_json: toolArguments.slice(0, 40) },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 1,
              delta: { type: "input_json_delta", partial_json: toolArguments.slice(40) },
            })}`,
            "",
            `data: ${JSON.stringify({ type: "content_block_stop", index: 1 })}`,
            "",
            `data: ${JSON.stringify({ type: "message_stop" })}`,
            "",
          ].join("\n");
        }

        const body = request.body as {
          stream?: boolean;
          messages?: Array<{ role?: string; content?: unknown }>;
        };
        assert.equal(body.stream, true);
        const messages = body.messages ?? [];
        const assistantWithTool = messages.find((message) =>
          message.role === "assistant" &&
          Array.isArray(message.content) &&
          message.content.some((block) =>
            typeof block === "object" &&
            block !== null &&
            !Array.isArray(block) &&
            (block as { type?: unknown; id?: unknown }).type === "tool_use" &&
            (block as { id?: unknown }).id === "ant-tool-call-1"
          )
        );
        const assistantIndex = messages.findIndex((message) =>
          message === assistantWithTool
        );
        const toolResultIndex = messages.findIndex((message) =>
          message.role === "user" &&
          Array.isArray(message.content) &&
          message.content.some((block) =>
            typeof block === "object" &&
            block !== null &&
            !Array.isArray(block) &&
            (block as { type?: unknown; tool_use_id?: unknown }).type === "tool_result" &&
            (block as { tool_use_id?: unknown }).tool_use_id === "ant-tool-call-1"
          )
        );
        assert.notEqual(assistantIndex, -1);
        assert.notEqual(toolResultIndex, -1);
        assert.ok(assistantIndex < toolResultIndex);
        assert.ok(assistantWithTool !== undefined);
        assert.deepEqual((assistantWithTool.content as unknown[])[0], {
          type: "thinking",
          thinking: "I need to inspect the file before answering.",
          signature: "sig-ant-tool-call-1",
        });
        return {
          id: "msg_2",
          content: [{ type: "text", text: "found needle from anthropic tool" }],
          usage: { input_tokens: 12, output_tokens: 6 },
        };
      },
      now: () => "2026-05-16T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.toolId, "file.read");
  assert.equal(result.finalOutput, "found needle from anthropic tool");
  assert.equal(providerBodies.length, 2);
});

test("PraxisRuntimeKernel.run merges Anthropic tool_results immediately after multi-tool assistant message", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-anthropic-multi-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from anthropic multi tool\n", "utf8");

  class AnthropicMultiToolAgent extends PraxisAgent {
    identity = "agent.kernel-anthropic-multi-tool";
    model = model("deepseek-v4-pro", {
      provider: "anthropic",
      endpointShape: "messages",
      carrierId: "carrier.kernel-anthropic-multi-tool",
      baseURL: "https://gateway.example.com/anthropic",
      metadata: { providerRoute: "anthropic_messages" },
    });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read"), tool("file.search")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-kernel-anthropic-multi-tool",
    sessionId: "session-kernel-anthropic-multi-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-anthropic-multi-tool" }).run(
    new AnthropicMultiToolAgent(),
    "read and scan",
    {
      sessionId: "session-kernel-anthropic-multi-tool",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: apiKeyAuthEnvelope({ provider: "anthropic", credentialType: "anthropic_api_key", apiKey: "sk-ant-secret" }),
      executor,
      anthropicMessagesCaller: async (request) => {
        calls += 1;
        if (calls === 1) {
          const readArguments = JSON.stringify({
            workspaceRoot: workspace,
            path: "notes.txt",
            dryRun: false,
            context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
          });
          const scanArguments = JSON.stringify({
            query: "needle", cwd: ".",
            glob: "*",
          });
          return [
            `data: ${JSON.stringify({
              type: "message_start",
              message: {
                id: "msg_anthropic_multi_tool_1",
                type: "message",
                role: "assistant",
                model: "deepseek-v4-pro",
                content: [],
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_start",
              index: 0,
              content_block: {
                type: "tool_use",
                id: "ant-tool-read-1",
                name: "praxis_tool_file_read",
                input: {},
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "input_json_delta", partial_json: readArguments },
            })}`,
            "",
            `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_start",
              index: 1,
              content_block: {
                type: "tool_use",
                id: "ant-tool-scan-1",
                name: "praxis_tool_file_search",
                input: {},
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 1,
              delta: { type: "input_json_delta", partial_json: scanArguments },
            })}`,
            "",
            `data: ${JSON.stringify({ type: "content_block_stop", index: 1 })}`,
            "",
            `data: ${JSON.stringify({ type: "message_stop" })}`,
            "",
          ].join("\n");
        }

        const body = request.body as {
          messages?: Array<{ role?: string; content?: unknown }>;
        };
        const messages = body.messages ?? [];
        const assistantIndex = messages.findIndex((message) =>
          message.role === "assistant" &&
          Array.isArray(message.content) &&
          message.content.some((block) =>
            typeof block === "object" &&
            block !== null &&
            !Array.isArray(block) &&
            (block as { type?: unknown; id?: unknown }).type === "tool_use" &&
            (block as { id?: unknown }).id === "ant-tool-read-1"
          ) &&
          message.content.some((block) =>
            typeof block === "object" &&
            block !== null &&
            !Array.isArray(block) &&
            (block as { type?: unknown; id?: unknown }).type === "tool_use" &&
            (block as { id?: unknown }).id === "ant-tool-scan-1"
          )
        );
        assert.notEqual(assistantIndex, -1);
        const nextMessage = messages[assistantIndex + 1];
        assert.equal(nextMessage?.role, "user");
        assert.ok(Array.isArray(nextMessage.content));
        const resultIds = nextMessage.content
          .map((block) =>
            typeof block === "object" && block !== null && !Array.isArray(block)
              ? (block as { type?: unknown; tool_use_id?: unknown })
              : undefined
          )
          .filter((block): block is { type?: unknown; tool_use_id?: unknown } => block?.type === "tool_result")
          .map((block) => block.tool_use_id);
        assert.deepEqual(resultIds, ["ant-tool-read-1", "ant-tool-scan-1"]);
        return {
          id: "msg_multi_tool_2",
          content: [{ type: "text", text: "multi tool replay valid" }],
          usage: { input_tokens: 12, output_tokens: 6 },
        };
      },
      now: () => "2026-05-17T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.finalOutput, "multi tool replay valid");
});

test("PraxisRuntimeKernel.run replays Anthropic EphemeralProcedure tool_result immediately after tool_use", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-anthropic-procedure-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from anthropic procedure\n", "utf8");

  class AnthropicProcedureAgent extends PraxisAgent {
    identity = "agent.kernel-anthropic-procedure";
    model = model("deepseek-v4-pro", {
      provider: "anthropic",
      endpointShape: "messages",
      carrierId: "carrier.kernel-anthropic-procedure",
      baseURL: "https://gateway.example.com/anthropic",
      metadata: { providerRoute: "anthropic_messages" },
    });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read"), tool("file.search")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 3 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-kernel-anthropic-procedure",
    sessionId: "session-kernel-anthropic-procedure",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-anthropic-procedure" }).run(
    new AnthropicProcedureAgent(),
    "read and scan by procedure",
    {
      sessionId: "session-kernel-anthropic-procedure",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: apiKeyAuthEnvelope({ provider: "anthropic", credentialType: "anthropic_api_key", apiKey: "sk-ant-secret" }),
      executor,
      anthropicMessagesCaller: async (request) => {
        calls += 1;
        if (calls === 1) {
          const procedureArguments = JSON.stringify({
            procedureId: "anthropic-procedure-read-scan",
            purpose: "read notes.txt and scan workspace through mounted BaseTools",
            executionMode: "serial",
            steps: [
              {
                stepId: "read",
                baseToolId: "file.read",
                input: {
                  workspaceRoot: workspace,
                  path: "notes.txt",
                  dryRun: false,
                  context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
                },
                riskLevel: "low",
              },
              {
                stepId: "scan",
                baseToolId: "file.search",
                input: {
                  query: "needle", cwd: ".",
                  glob: "*",
                },
                dependsOn: ["read"],
                riskLevel: "low",
              },
            ],
          });
          return [
            `data: ${JSON.stringify({
              type: "message_start",
              message: {
                id: "msg_anthropic_procedure_1",
                type: "message",
                role: "assistant",
                model: "deepseek-v4-pro",
                content: [],
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_start",
              index: 0,
              content_block: {
                type: "tool_use",
                id: "ant-procedure-call-1",
                name: "praxis_ephemeral_procedure",
                input: {},
              },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "input_json_delta", partial_json: procedureArguments.slice(0, 200) },
            })}`,
            "",
            `data: ${JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: { type: "input_json_delta", partial_json: procedureArguments.slice(200) },
            })}`,
            "",
            `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
            "",
            `data: ${JSON.stringify({ type: "message_stop" })}`,
            "",
          ].join("\n");
        }

        const body = request.body as {
          messages?: Array<{ role?: string; content?: unknown }>;
        };
        const messages = body.messages ?? [];
        const assistantIndex = messages.findIndex((message) =>
          message.role === "assistant" &&
          Array.isArray(message.content) &&
          message.content.some((block) =>
            typeof block === "object" &&
            block !== null &&
            !Array.isArray(block) &&
            (block as { type?: unknown; id?: unknown }).type === "tool_use" &&
            (block as { id?: unknown }).id === "ant-procedure-call-1"
          )
        );
        assert.notEqual(assistantIndex, -1);
        const nextMessage = messages[assistantIndex + 1];
        assert.equal(nextMessage?.role, "user");
        assert.ok(Array.isArray(nextMessage.content));
        assert.equal(
          nextMessage.content.some((block) =>
            typeof block === "object" &&
            block !== null &&
            !Array.isArray(block) &&
            (block as { type?: unknown; tool_use_id?: unknown }).type === "tool_result" &&
            (block as { tool_use_id?: unknown }).tool_use_id === "ant-procedure-call-1"
          ),
          true,
        );
        return {
          id: "msg_anthropic_procedure_2",
          content: [{ type: "text", text: "anthropic procedure replay valid" }],
          usage: { input_tokens: 12, output_tokens: 6 },
        };
      },
      now: () => "2026-05-17T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls.some((record) => record.callId === "anthropic-procedure-read-scan:read"), true);
  assert.equal(result.toolCalls.some((record) => record.callId === "anthropic-procedure-read-scan:scan"), true);
  assert.equal(result.finalOutput, "anthropic procedure replay valid");
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "executeEphemeralProcedure"), true);
});

test("PraxisRuntimeKernel.run annotates cache debug with stable-prefix and observed-hit analysis", async () => {
  let completedCacheDebug: {
    providerBody?: {
      cacheShape?: {
        providerStablePrefixEstimatedTokens?: number;
        providerDynamicInputEstimatedTokens?: number;
        stablePrefixShare?: number;
        dynamicInputShare?: number;
        stablePrefixHash?: string;
        dynamicPayloadHash?: string;
      };
    };
    observedUsage?: {
      inputTokens?: number;
      cachedInputTokens?: number;
      nonCachedInputTokens?: number;
      cacheHitRate?: number;
      stablePrefixWarmthEstimate?: number;
      diagnosis?: string;
      reasons?: readonly string[];
    };
  } | undefined;

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-cache-analysis" }).run(
    new PlainAgent(),
    "say hello and keep the cache explanation visible",
    {
      sessionId: "session-cache-analysis",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async () => ({
        output_text: "hello with cache telemetry",
        usage: {
          input_tokens: 100,
          output_tokens: 5,
          input_tokens_details: { cached_tokens: 60 },
        },
      }),
      onModelCallProgress: async (progress) => {
        if (progress.phase === "completed") {
          completedCacheDebug = progress.cacheDebug;
        }
      },
      now: () => "2026-05-15T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  assert.ok((completedCacheDebug?.providerBody?.cacheShape?.providerStablePrefixEstimatedTokens ?? 0) > 0);
  assert.ok((completedCacheDebug?.providerBody?.cacheShape?.providerDynamicInputEstimatedTokens ?? 0) > 0);
  assert.ok((completedCacheDebug?.providerBody?.cacheShape?.stablePrefixShare ?? 0) > 0);
  assert.ok((completedCacheDebug?.providerBody?.cacheShape?.dynamicInputShare ?? 0) > 0);
  assert.match(completedCacheDebug?.providerBody?.cacheShape?.stablePrefixHash ?? "", /^[a-f0-9]{64}$/u);
  assert.match(completedCacheDebug?.providerBody?.cacheShape?.dynamicPayloadHash ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(completedCacheDebug?.observedUsage?.inputTokens, 100);
  assert.equal(completedCacheDebug?.observedUsage?.cachedInputTokens, 60);
  assert.equal(completedCacheDebug?.observedUsage?.nonCachedInputTokens, 40);
  assert.equal(completedCacheDebug?.observedUsage?.cacheHitRate, 0.6);
  assert.ok((completedCacheDebug?.observedUsage?.stablePrefixWarmthEstimate ?? 0) > 0);
  assert.ok((completedCacheDebug?.observedUsage?.reasons?.length ?? 0) > 0);
});

test("PraxisRuntimeKernel.runManifest uses .rax_workspace SQLite storage by default", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-storage-"));

  class SqliteAgent extends PraxisAgent {
    identity = "agent.kernel-sqlite";
    model = model("gpt-5.4", { carrierId: "carrier.kernel-sqlite" });
    session = session({ persistence: "sqlite", resume: "auto", thread: "durable", logs: "full" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const compiled = compileAgent(SqliteAgent, {
    compiledAt: "2026-05-05T00:00:00.000Z",
    manifestId: "manifest.kernel-sqlite",
  });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-kernel-sqlite" }).runManifest(
    compiled.manifest,
    "say hello",
    {
      sessionId: "session-kernel-sqlite",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async () => ({ output_text: "hello from sqlite-backed run" }),
      storage: {
        cwd: workspace,
        homeDir: path.join(workspace, "home"),
        initMode: "on-run",
      },
      now: () => "2026-05-05T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const sqlitePath = path.join(workspace, ".rax_workspace", "sessions", "praxis.sqlite");
  const storageMetadata = result.state.session?.metadata.storage as Record<string, unknown> | undefined;
  assert.equal(existsSync(sqlitePath), true);
  assert.equal(storageMetadata?.workspaceRef, "rax.workspace");
  assert.equal(JSON.stringify(result.state.session?.metadata).includes("codex-access-token-secret"), false);
});

test("PraxisRuntimeKernel.runManifest fails before model invocation when sandbox provider is unavailable", async () => {
  class MissingSandboxAgent extends PraxisAgent {
    identity = "agent.missing-sandbox";
    model = model("gpt-5.4", { carrierId: "carrier.missing-sandbox" });
    storage = storageHelper.memory();
    sandbox = sandboxHelper.linuxBubblewrap({
      dependencyRefs: ["binary:praxis-missing-bwrap-for-test"],
    });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  let providerCalls = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-missing-sandbox" }).run(
    new MissingSandboxAgent(),
    "say hello",
    {
      sessionId: "session-missing-sandbox",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async () => {
        providerCalls += 1;
        return { output_text: "should not run" };
      },
      sandbox: { failOnUnavailable: true },
      now: () => "2026-05-06T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, false);
  assert.equal(providerCalls, 0);
  if (result.ok) return;
  assert.equal(result.error.code, "SANDBOX_UNAVAILABLE");
  assert.equal(result.state?.events.some((event) => event.type === "runtime.sandboxPlane.prepared"), true);
  assert.equal(result.state?.session?.status, "failed");
});

test("PraxisRuntimeKernel routes pending approvals through interface envelopes", async () => {
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-approval-interface" }).run(
    new PlainAgent(),
    "ask for approval",
    {
      sessionId: "session-approval-interface",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async () => ({
        output: [{
          type: "function_call",
          name: "praxis_request_approval",
          call_id: "approval-call-1",
          arguments: JSON.stringify({
            reason: "need a human decision",
            requestedScopes: ["tool.shell.run"],
            riskLevel: "high",
          }),
        }],
      }),
      now: () => "2026-05-06T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.approvals.length, 1);
  const interfaceEvent = result.state?.events.find((event) => event.type === "runtime.interfaceAdapter.approval.envelope");
  assert.notEqual(interfaceEvent, undefined);
  assert.equal(JSON.stringify(interfaceEvent?.payload).includes("\"kind\":\"approval\""), true);
});

test("PraxisRuntimeKernel.run extracts final text from real codex responses SSE shape", async () => {
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-sse" });
  const result = await kernel.run(new PlainAgent(), "say hello", {
    sessionId: "session-sse",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async () =>
      [
        'event: response.created',
        'data: {"type":"response.created","response":{"output":[]}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"praxis-runtime-real-ok"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"praxis-runtime-real-ok"}]}]}}',
        '',
      ].join("\n"),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "praxis-runtime-real-ok");
});

test("PraxisRuntimeKernel.run extracts tool calls from codex responses SSE completion output", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-sse-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from sse tool\n", "utf8");

  class ToolAgent extends PraxisAgent {
    identity = "agent.sse-tool";
    model = model("gpt-5.4", { carrierId: "carrier.sse-tool" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-sse-tool",
    sessionId: "session-sse-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-sse-tool" }).run(new ToolAgent(), "read notes", {
    sessionId: "session-sse-tool",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return [
          "event: response.output_item.added",
          `data: ${JSON.stringify({
            type: "response.output_item.added",
            item: {
              type: "function_call",
              name: "praxis_tool_file_read",
              call_id: "sse-tool-call-incomplete",
              arguments: "",
            },
          })}`,
          "",
          "event: response.function_call_arguments.delta",
          'data: {"type":"response.function_call_arguments.delta","delta":"{\\"targetPath\\":\\"wrong.txt\\"}"}',
          "",
          "event: response.completed",
          `data: ${JSON.stringify({
            type: "response.completed",
            response: {
              output: [{
                type: "function_call",
                name: "file.read",
                call_id: "sse-tool-call-1",
                arguments: JSON.stringify({
                  workspaceRoot: workspace,
                  path: "notes.txt",
                  dryRun: false,
                  context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
                }),
              }],
            },
          })}`,
          "",
        ].join("\n");
      }
      return [
        "event: response.output_text.delta",
        'data: {"type":"response.output_text.delta","delta":"read needle from sse tool"}',
        "",
      ].join("\n");
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.equal(result.finalOutput, "read needle from sse tool");
});

test("PraxisRuntimeKernel.run deduplicates streamed tool calls by call id", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-sse-dedupe-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from deduped sse tool\n", "utf8");

  class ToolAgent extends PraxisAgent {
    identity = "agent.sse-dedupe-tool";
    model = model("gpt-5.4", { carrierId: "carrier.sse-dedupe-tool" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-sse-dedupe-tool",
    sessionId: "session-sse-dedupe-tool",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const completedToolCall = {
    type: "function_call",
    name: "praxis_tool_file_read",
    call_id: "sse-tool-call-1",
    arguments: JSON.stringify({
      workspaceRoot: workspace,
      path: "notes.txt",
      dryRun: false,
      context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
    }),
  };
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-sse-dedupe-tool" }).run(new ToolAgent(), "read notes", {
    sessionId: "session-sse-dedupe-tool",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return [
          "event: response.output_item.done",
          `data: ${JSON.stringify({ type: "response.output_item.done", item: completedToolCall })}`,
          "",
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [completedToolCall] } })}`,
          "",
        ].join("\n");
      }
      return { output_text: "read deduped sse tool once" };
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.callId, "sse-tool-call-1");
  assert.equal(result.finalOutput, "read deduped sse tool once");
});

test("PraxisRuntimeKernel.runManifest gives colliding tool ids unique provider names", async () => {
  class ToolAgent extends PraxisAgent {
    identity = "agent.tool-name-collision";
    model = model("gpt-5.4", { carrierId: "carrier.tool-name-collision" });
    harness = harness({
      tools: tools([
        tool("file.read"),
      ]),
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const compiled = compileAgent(new ToolAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const manifestWithLegacyCollision = {
    ...compiled.manifest,
    harness: {
      ...compiled.manifest.harness,
      tools: [
        ...compiled.manifest.harness.tools,
        tool("code_read", { family: "coreBase", group: "filesystem" }),
      ],
    },
  };

  let capturedBody: unknown;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-name-collision" }).runManifest(manifestWithLegacyCollision, "list tools", {
    sessionId: "session-tool-name-collision",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async (envelope) => {
      capturedBody = envelope.body;
      return { output_text: "tools listed" };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(typeof capturedBody, "object");
  assert.notEqual(capturedBody, null);
  const body = capturedBody as {
    instructions?: string;
    input?: readonly {
      role?: string;
      content?: readonly { text?: string }[];
    }[];
    tools?: readonly { name?: string }[];
  };
  const providerBodyText = JSON.stringify(body);
  assert.match(providerBodyText, /Praxis BaseTool calling protocol/);
  assert.match(providerBodyText, /declared function calls/);
  assert.match(providerBodyText, /runtime mounted BaseTools=file\.read, code_read/);
  assert.match(providerBodyText, /baseTool context mode=intelligent/);
  assert.match(providerBodyText, /stable manual index and compact tool summary layer/);
  assert.match(providerBodyText, /BaseTool family: coreBase/);
  assert.match(body.instructions ?? "", /Praxis PromptPack stable context follows/u);
  assert.match(body.instructions ?? "", /stable manual index and compact tool summary layer/u);
  assert.match(body.input?.[0]?.content?.[0]?.text ?? "", /list tools/u);
  assert.doesNotMatch(body.input?.[0]?.content?.[0]?.text ?? "", /BaseTool family: coreBase/u);
  assert.deepEqual(body.tools?.map((item) => item.name), [
    "praxis_tool_code_read",
    "praxis_tool_file_read",
    "praxis_ephemeral_procedure",
    "praxis_request_approval",
    "praxis_expand_tool_context",
  ]);
});

test("PraxisRuntimeKernel.runManifest lets the model expand folded BaseTool context", async () => {
  class ExpandContextAgent extends PraxisAgent {
    identity = "agent.expand-context";
    model = model("gpt-5.4", { carrierId: "carrier.expand-context" });
    harness = harness({
      tools: tools([
        tool("shell.run", {
          family: "coreBase",
          group: "shell",
          description: "Run a governed shell command.",
        }),
      ]),
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  const compiled = compileAgent(ExpandContextAgent, {
    compiledAt: "2026-05-09T00:00:00.000Z",
    manifestId: "manifest.expand-context",
  });
  assert.equal(compiled.ok, true, compiled.ok ? undefined : JSON.stringify(compiled.error));
  if (!compiled.ok) return;

  const bodies: unknown[] = [];
  let callCount = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-expand-context" }).runManifest(
    compiled.manifest,
    "find the right shell tool manual",
    {
      sessionId: "session-expand-context",
      dryRun: false,
      allowProviderCall: true,
      auth: authEnvelope(),
      providerCaller: async (envelope) => {
        callCount += 1;
        bodies.push(envelope.body);
        if (callCount === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_expand_tool_context",
              call_id: "expand-shell-execution",
              arguments: JSON.stringify({
                targetKind: "tool",
                toolId: "shell.run",
                reason: "need the concrete shell execution manual",
              }),
            }],
          };
        }
        return { output_text: "expanded shell context was visible" };
      },
    },
  );

  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (!result.ok) return;
  assert.equal(result.finalOutput, "expanded shell context was visible");
  const firstBody = bodies[0] as { tools?: readonly { name?: string }[] };
  const secondBody = bodies[1] as { tools?: readonly { name?: string }[] };
  assert.equal(firstBody.tools?.some((item) => item.name === "praxis_expand_tool_context"), true);
  assert.equal(firstBody.tools?.some((item) => item.name === "praxis_tool_shell_run"), true);
  assert.equal(secondBody.tools?.some((item) => item.name === "praxis_tool_shell_run"), true);
  const secondBodyText = JSON.stringify(bodies[1]);
  assert.match(secondBodyText, /baseTool:manual:tool:shell\.run/);
  assert.match(secondBodyText, /shell\.run/);
  assert.match(secondBodyText, /function_call_output/);
  assert.match(secondBodyText, /expand-shell-execution/);
  assert.equal(result.mainLoopSteps.some((step) => step.metadata.runtimeDecision === "expandToolContext"), true);
});

test("PraxisRuntimeKernel.runManifest can execute a model requested baseTool and feed the result back", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from runtime kernel\n", "utf8");

  class ToolAgent extends PraxisAgent {
    identity = "agent.tool";
    model = model("gpt-5.4", { carrierId: "carrier.tool" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const providerBodies: unknown[] = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool",
    sessionId: "session-tool",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const kernel = createPraxisRuntimeKernel({ runtimeId: "runtime-tool" });
  const result = await kernel.run(new ToolAgent(), "read notes.txt", {
    sessionId: "session-tool",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async (envelope) => {
      calls += 1;
      providerBodies.push(envelope.body);
      if (calls === 1) {
        const toolItem = {
            type: "function_call",
            name: "file.read",
            call_id: "tool-call-1",
            arguments: JSON.stringify({
              workspaceRoot: workspace,
              path: "notes.txt",
              dryRun: false,
              context: {
                workspaceRoot: workspace,
                allowedRoots: [workspace],
                dryRun: false,
              },
            }),
          };
        return [
          "event: response.output_item.done",
          `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "reasoning", id: "rs_test_not_persisted", summary: [] } })}`,
          "event: response.output_item.done",
          `data: ${JSON.stringify({ type: "response.output_item.done", item: toolItem })}`,
          "event: response.completed",
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [{ type: "reasoning", id: "rs_test_not_persisted", summary: [] }, toolItem] } })}`,
          "data: [DONE]",
        ].join("\n\n");
      }
      return { output_text: "The file contains needle from runtime kernel." };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "The file contains needle from runtime kernel.");
  assert.equal(result.modelCalls.length, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.equal(result.toolCalls[0]?.toolId, "file.read");
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "prepareTurn"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "assemblePromptPack"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "buildCachePlan"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "interpretModelDecision"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "adjudicateDecision"), true);
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "invokeBaseTool"), true);
  const buildCacheStep = result.mainLoopSteps.find((step) => step.actionPrimitive === "buildCachePlan");
  assert.equal(Array.isArray(buildCacheStep?.metadata.cacheablePrefixSegmentKinds), true);
  assert.equal(result.mainLoopSteps.some((step) => step.timestamps.plannedAt.startsWith("1970-")), false);
  assert.equal(result.state.invocations.some((record) => record.kind === "tool" && record.ok), true);
  const heatState = result.state.states.find((record) => record.phase === "toolContextHeat");
  assert.deepEqual(heatState?.metadata.usage, [{ toolId: "file.read", count: 1 }]);
  assert.equal(result.state.events.some((record) => record.type === "runtime.baseTool.dependencies.preflight"), true);
  const firstProviderBodyText = JSON.stringify(providerBodies[0]);
  const secondProviderBodyText = JSON.stringify(providerBodies[1]);
  assert.match(firstProviderBodyText, /runtime:base-tool-protocol/u);
  assert.match(secondProviderBodyText, /runtime:base-tool-protocol/u);
  assert.doesNotMatch(firstProviderBodyText, /runtime:base-tool-protocol:\d+/u);
  assert.doesNotMatch(secondProviderBodyText, /runtime:base-tool-protocol:\d+/u);
  const secondProviderBody = providerBodies[1] as {
    input?: readonly { type?: string; call_id?: string; output?: string; role?: string; content?: unknown }[];
  };
  const secondProviderInput = secondProviderBody.input ?? [];
  const nativeFunctionCallIndex = secondProviderInput.findIndex((item) => item.type === "function_call");
  const nativeToolResultIndex = secondProviderInput.findIndex((item) => item.type === "function_call_output");
  const dynamicPromptIndex = secondProviderInput.findIndex((item) => item.role === "user");
  const nativeFunctionCall = secondProviderInput[nativeFunctionCallIndex];
  const nativeToolResult = secondProviderInput[nativeToolResultIndex];
  const dynamicPrompt = secondProviderInput[dynamicPromptIndex];
  assert.equal(secondProviderInput.some((item) => item.type === "reasoning"), false);
  assert.equal(nativeFunctionCallIndex >= 0, true);
  assert.equal(nativeToolResultIndex > nativeFunctionCallIndex, true);
  assert.equal(dynamicPromptIndex > nativeToolResultIndex, true);
  assert.equal(nativeFunctionCall?.call_id, "tool-call-1");
  assert.equal(nativeToolResult?.call_id, "tool-call-1");
  assert.match(nativeToolResult?.output ?? "", /needle from runtime kernel/);
  const dynamicPromptText = JSON.stringify(dynamicPrompt) ?? "";
  assert.match(dynamicPromptText, /nativeToolResult: call_id=tool-call-1/u);
  assert.doesNotMatch(dynamicPromptText, /needle from runtime kernel/u);
});

test("PraxisRuntimeKernel.runManifest uses runtime cwd as default baseTool workspace root", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-runtime-cwd-"));
  await writeFile(path.join(workspace, "workspace-only.txt"), "needle from runtime cwd\n", "utf8");

  class RuntimeCwdToolAgent extends PraxisAgent {
    identity = "agent.runtime-cwd-tool";
    model = model("gpt-5.4", { carrierId: "carrier.runtime-cwd-tool" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-cwd-tool" }).run(
    new RuntimeCwdToolAgent(),
    "read workspace-only.txt",
    {
      sessionId: "session-cwd-tool",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      storage: { cwd: workspace },
      sandbox: { cwd: workspace },
      providerCaller: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "file.read",
              call_id: "runtime-cwd-code-read",
              arguments: JSON.stringify({
                path: "workspace-only.txt",
                dryRun: false,
              }),
            }],
          };
        }
        return { output_text: "read complete" };
      },
      now: () => "2026-05-18T00:00:00.000Z",
    },
  );

  await rm(workspace, { recursive: true, force: true });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.arguments), new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /needle from runtime cwd/u);
});

test("PraxisRuntimeKernel.runManifest gives EphemeralProcedure steps the runtime workspace root", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-procedure-cwd-"));
  await writeFile(path.join(workspace, "procedure-only.txt"), "needle from procedure runtime cwd\n", "utf8");

  class ProcedureRuntimeCwdAgent extends PraxisAgent {
    identity = "agent.procedure-runtime-cwd";
    model = model("gpt-5.4", { carrierId: "carrier.procedure-runtime-cwd" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-procedure-cwd" }).run(
    new ProcedureRuntimeCwdAgent(),
    "read procedure-only.txt by procedure",
    {
      sessionId: "session-procedure-cwd",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      storage: { cwd: workspace },
      sandbox: { cwd: workspace },
      providerCaller: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "praxis_ephemeral_procedure",
              call_id: "procedure-runtime-cwd-call",
              arguments: JSON.stringify({
                procedureId: "procedure-runtime-cwd",
                purpose: "read an existing file through file.read",
                executionMode: "serial",
                steps: [{
                  stepId: "read",
                  baseToolId: "file.read",
                  input: {
                    path: "procedure-only.txt",
                    dryRun: false,
                  },
                  riskLevel: "low",
                }],
              }),
            }],
          };
        }
        return { output_text: "procedure read complete" };
      },
      now: () => "2026-05-18T00:00:00.000Z",
    },
  );

  await rm(workspace, { recursive: true, force: true });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.callId, "procedure-runtime-cwd:read");
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.arguments), new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /needle from procedure runtime cwd/u);
});

test("PraxisRuntimeKernel.runManifest reuses same-turn full file.read observations for repeated range reads", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-read-reuse-"));
  await writeFile(path.join(workspace, "index.html"), "<main>already read once</main>\n", "utf8");

  class ReadReuseAgent extends PraxisAgent {
    identity = "agent.read-reuse";
    model = model("gpt-5.4", { carrierId: "carrier.read-reuse" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 3, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-read-reuse",
    sessionId: "session-read-reuse",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-read-reuse" }).run(new ReadReuseAgent(), "read index twice", {
    sessionId: "session-read-reuse",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "file.read",
            call_id: "read-full",
            arguments: JSON.stringify({
              path: "index.html",
              includeLineNumbers: true,
              maxBytes: 50000,
              context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
            }),
          }],
        };
      }
      if (calls === 2) {
        return {
          output: [{
            type: "function_call",
            name: "file.read",
            call_id: "read-range",
            arguments: JSON.stringify({
              path: "index.html",
              includeLineNumbers: true,
              range: { startLine: 1, endLine: 20 },
              maxBytes: 20000,
              context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
            }),
          }],
        };
      }
      return { output_text: "duplicate read reused previous observation" };
    },
    now: () => "2026-05-15T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 2);
  assert.equal(result.toolCalls[0]?.callId, "read-full");
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /already read once/);
  assert.equal(result.toolCalls[1]?.callId, "read-range");
  assert.equal((result.toolCalls[1]?.output as { kind?: string }).kind, "agentCore.basicTool.file.read.cachedObservation");
  assert.doesNotMatch(JSON.stringify(result.toolCalls[1]?.output), /already read once/);
  assert.equal(result.mainLoopSteps.some((step) => step.metadata.duplicateObservationReuse === true), true);
});

test("PraxisRuntimeKernel.runManifest enriches skill.load permissions and relative roots for model tool calls", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-skill-"));
  await writeFile(path.join(workspace, "skill.md"), "RepoInspectorAgent appears in this local skill fixture\n", "utf8");

  class SkillAgent extends PraxisAgent {
    identity = "agent.skill";
    model = model("gpt-5.4", { carrierId: "carrier.skill" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("skill.load")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-skill",
    sessionId: "session-skill",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
    adapters: {
      skill: {
        async load(request) {
          return { ok: true as const, output: { name: request?.name, path: request?.path, content: "RepoInspectorAgent appears in this local skill fixture" } };
        },
      },
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-skill" }).run(new SkillAgent(), "search local skill fixture", {
    sessionId: "session-skill",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "skill.load",
            call_id: "skill-load-call",
            arguments: JSON.stringify({
              path: "skill.md",
              context: {
                grantedPermissions: ["tool.execute"],
              },
            }),
          }],
        };
      }
      return { output_text: "skill search found RepoInspectorAgent" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /RepoInspectorAgent/);
});

test("PraxisRuntimeKernel.runManifest adds a default local MCP server for model MCP resource calls", async () => {
  class McpAgent extends PraxisAgent {
    identity = "agent.mcp";
    model = model("gpt-5.4", { carrierId: "carrier.mcp" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("mcp.resources")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-mcp",
    sessionId: "session-mcp",
    adapters: {
      mcp: {
        async listResources(request) {
          return { ok: true as const, output: { serverId: request?.serverId, resources: [{ uri: "local-mcp://echo", name: "echo" }] } };
        },
      },
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-mcp" }).run(new McpAgent(), "list local MCP resources", {
    sessionId: "session-mcp",
    dryRun: false,
    allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "mcp.resources",
            call_id: "mcp-resources-call",
            arguments: JSON.stringify({
              operation: "list",
              context: { grantedPermissions: ["tool.execute"] },
            }),
          }],
        };
      }
      return { output_text: "local MCP tools were listed" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /local-mcp|echo/);
});

test("PraxisRuntimeKernel.runManifest sanitizes invalid governance context before file.read dispatch", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-file-read-context-"));
  await writeFile(path.join(workspace, "image.txt"), "text fixture for invalid governance context\n", "utf8");

  class FileReadContextAgent extends PraxisAgent {
    identity = "agent.file-read-context";
    model = model("gpt-5.4", { carrierId: "carrier.file-read-context" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-file-read-context",
    sessionId: "session-file-read-context",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-file-read-context" }).run(new FileReadContextAgent(), "read image.txt", {
    sessionId: "session-file-read-context",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "file.read",
            call_id: "file-read-invalid-governance-call",
            arguments: JSON.stringify({
              path: "image.txt",
              context: {
                governance: "model-supplied-invalid-governance",
                grantedPermissions: ["tool.execute"],
              },
            }),
          }],
        };
      }
      return { output_text: "file read succeeded despite invalid model governance context" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /text fixture/u);
  assert.doesNotMatch(JSON.stringify(result.toolCalls[0]), /INVALID_CONTEXT|malformed governance/);
});

test("PraxisRuntimeKernel.runManifest defaults patch.apply permissions for permissive runtime profiles", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-patch-permissions-"));

  class PatchApplyAgent extends PraxisAgent {
    identity = "agent.patch-permissions";
    model = model("gpt-5.4", { carrierId: "carrier.patch-permissions" });
    toolPolicy = toolPolicies.permissive();
    harness = harness({
      tools: tools([tool("patch.apply")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-patch-permissions",
    sessionId: "session-patch-permissions",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowFilesystemWrite: true,
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-patch-permissions" }).run(
    new PatchApplyAgent(),
    "apply a test patch",
    {
      sessionId: "session-patch-permissions",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      approvalResolver: async () => ({ status: "approved", reason: "unit test approves patch.apply" }),
      providerCaller: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "patch.apply",
              call_id: "patch-apply-call",
              arguments: JSON.stringify({
                patch: "*** Begin Patch\n*** Add File: generated.txt\n+generated by patch.apply\n*** End Patch\n",
                context: { grantedPermissions: ["tool.execute"] },
              }),
            }],
          };
        }
        return { output_text: "patch provider was reached" };
      },
      now: () => "2026-05-09T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  const grantedPermissions = (result.toolCalls[0]?.arguments as { context?: { grantedPermissions?: readonly string[] } } | undefined)
    ?.context
    ?.grantedPermissions;
  assert.equal(grantedPermissions?.includes("filesystem:write"), true);
  assert.equal(grantedPermissions?.includes("patch:apply"), true);
});

test("PraxisRuntimeKernel wraps patch.apply with workspace rollback in yolo profile", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-patch-rollback-"));

  class PatchRollbackAgent extends PraxisAgent {
    identity = "agent.patch-rollback";
    model = model("gpt-5.4", { carrierId: "carrier.patch-rollback" });
    toolPolicy = toolPolicies.yolo();
    sandbox = sandboxHelper.hostObserved();
    harness = harness({
      tools: tools([tool("patch.apply")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-patch-rollback",
    sessionId: "session-patch-rollback",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowFilesystemWrite: true,
    },
    sandboxSpec: sandboxHelper.hostObserved(),
    policyProfile: "yolo",
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-patch-rollback" }).run(
    new PatchRollbackAgent(),
    "apply a partially failing patch",
    {
      sessionId: "session-patch-rollback",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      approvalResolver: async () => ({ status: "approved", reason: "unit test approves yolo patch.apply" }),
      providerCaller: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "patch.apply",
              call_id: "patch-rollback-call",
              arguments: JSON.stringify({
                patch: [
                  "*** Begin Patch",
                  "*** Add File: generated.txt",
                  "+generated before failure",
                  "*** Update File: missing.txt",
                  "@@",
                  "-before",
                  "+after",
                  "*** End Patch",
                  "",
                ].join("\n"),
              }),
            }],
          };
        }
        return { output_text: "patch rollback provider was reached" };
      },
      now: () => "2026-05-09T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  assert.equal(existsSync(path.join(workspace, "generated.txt")), false);
  const rollbackEvents = result.events.filter((item) => item.includes("workspaceRollback"));
  assert.ok(rollbackEvents.length > 0);
  await assert.rejects(readFile(path.join(workspace, "generated.txt"), "utf8"));
});

test("PraxisRuntimeKernel.runManifest grants shell.run runtime permissions", async () => {
  class ShellRunAgent extends PraxisAgent {
    identity = "agent.shell-run";
    model = model("gpt-5.4", { carrierId: "carrier.shell-run" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("shell.run")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  const baseExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-shell-run",
    sessionId: "session-shell-run",
    policy: {
      allowShellExecution: true,
    },
  });

  let calls = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-shell-run" }).run(
    new ShellRunAgent(),
    "run shell command",
    {
      sessionId: "session-shell-run",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor: baseExecutor,
      providerCaller: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "shell.run",
              call_id: "shell-run-call",
              arguments: JSON.stringify({
                command: "printf",
                context: {
                  grantedPermissions: ["tool.execute"],
                },
              }),
            }],
          };
        }
        return { output_text: "shell command completed" };
      },
      now: () => "2026-05-15T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.match(JSON.stringify(result.toolCalls[0]?.output), /exitCode/u);
  const grantedPermissions = (result.toolCalls[0]?.arguments as { context?: { grantedPermissions?: readonly string[] } } | undefined)
    ?.context
    ?.grantedPermissions;
  assert.equal(grantedPermissions?.includes("shell:execute"), true);
  assert.equal(grantedPermissions?.includes("process:spawn"), true);
});

test("PraxisRuntimeKernel.runManifest keeps shell.run permissions stable for repeated shell tools", async () => {
  class ShellServiceAgent extends PraxisAgent {
    identity = "agent.shell-service";
    model = model("gpt-5.4", { carrierId: "carrier.shell-service" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("shell.run")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  const baseExecutor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-shell-service",
    sessionId: "session-shell-service",
    policy: {
      allowShellExecution: true,
    },
  });

  let calls = 0;
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-shell-service" }).run(
    new ShellServiceAgent(),
    "start and verify service",
    {
      sessionId: "session-shell-service",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor: baseExecutor,
      providerCaller: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "shell.run",
              call_id: "shell-service-call",
              arguments: JSON.stringify({
                command: "printf",
                context: {
                  grantedPermissions: ["tool.execute"],
                },
              }),
            }],
          };
        }
        return { output_text: "shell service-style command completed" };
      },
      now: () => "2026-05-15T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.doesNotMatch(JSON.stringify(result.toolCalls[0]?.output), /PERMISSION_DENIED/u);
  const grantedPermissions = (result.toolCalls[0]?.arguments as { context?: { grantedPermissions?: readonly string[] } } | undefined)
    ?.context
    ?.grantedPermissions;
  assert.equal(grantedPermissions?.includes("shell:execute"), true);
  assert.equal(grantedPermissions?.includes("shell:validate"), true);
});

test("PraxisRuntimeKernel.runManifest feeds non-approval tool failures back for replanning", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-failure-"));

  class ToolFailureAgent extends PraxisAgent {
    identity = "agent.tool-failure";
    model = model("gpt-5.4", { carrierId: "carrier.tool-failure" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const providerBodies: unknown[] = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool-failure",
    sessionId: "session-tool-failure",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-failure" }).run(
    new ToolFailureAgent(),
    "read missing.txt",
    {
      sessionId: "session-tool-failure",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      providerCaller: async (envelope) => {
        calls += 1;
        providerBodies.push(envelope.body);
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "file.read",
              call_id: "tool-call-missing",
              arguments: JSON.stringify({
                workspaceRoot: workspace,
                path: "missing.txt",
                dryRun: false,
                context: {
                  workspaceRoot: workspace,
                  allowedRoots: [workspace],
                  dryRun: false,
                },
              }),
            }],
          };
        }
        return { output_text: "missing.txt could not be read, so I need another path." };
      },
      now: () => "2026-04-30T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "missing.txt could not be read, so I need another path.");
  assert.equal(result.modelCalls.length, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  const secondProviderBody = providerBodies[1] as { input?: readonly { type?: string; call_id?: string; output?: string }[] };
  const nativeToolResult = secondProviderBody.input?.find((item) => item.type === "function_call_output");
  assert.equal(nativeToolResult?.call_id, "tool-call-missing");
  assert.match(nativeToolResult?.output ?? "", /missing\.txt|ENOENT|failed|READER_REJECTED|RUNTIME_PORT_THROWN/i);
  assert.equal(result.mainLoopSteps.some((step) => step.observationRefs.includes("session-tool-failure:observation:tool-call-missing")), true);
});

test("PraxisRuntimeKernel.runManifest degrades unavailable strong sandbox shell calls to workspace rollback observations", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-sandbox-tool-"));

  class SandboxToolBlockedAgent extends PraxisAgent {
    identity = "agent.sandbox-tool-blocked";
    model = model("gpt-5.4", { carrierId: "carrier.sandbox-tool-blocked" });
    toolPolicy = toolPolicies.permissive();
    harness = harness({
      tools: tools([tool("shell.run")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const providerBodies: unknown[] = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-sandbox-tool-blocked",
    sessionId: "session-sandbox-tool-blocked",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
      allowShellExecution: true,
      allowProcessExecution: true,
    },
    sandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "workspace-only",
      isolationLevel: "process-namespace",
      ready: false,
      probe: {
        status: "missing-dependency",
        publicSafeMessage: "linux-bubblewrap is not installed in this test runtime",
      },
    },
  });

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-sandbox-tool-blocked" }).run(
    new SandboxToolBlockedAgent(),
    "run a safe pwd command",
    {
      sessionId: "session-sandbox-tool-blocked",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      providerCaller: async (envelope) => {
        calls += 1;
        providerBodies.push(envelope.body);
        if (calls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "shell.run",
              call_id: "tool-call-sandbox-blocked",
              arguments: JSON.stringify({
                command: "pwd",
                args: [],
                cwd: workspace,
                timeoutMs: 1000,
                context: {
                  dryRun: false,
                  workspaceRoot: workspace,
                  allowedRoots: [workspace],
                },
              }),
            }],
          };
        }
        return { output_text: "The sandbox degraded to workspace rollback and returned the shell observation." };
      },
      now: () => "2026-05-09T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "The sandbox degraded to workspace rollback and returned the shell observation.");
  assert.equal(result.modelCalls.length, 2);
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, true);
  const secondProviderBody = providerBodies[1] as { input?: readonly { type?: string; call_id?: string; output?: string }[] };
  const nativeToolResult = secondProviderBody.input?.find((item) => item.type === "function_call_output");
  assert.equal(nativeToolResult?.call_id, "tool-call-sandbox-blocked");
  assert.match(nativeToolResult?.output ?? "", /workspace-rollback|exitCode|stdout/i);
  assert.equal(result.mainLoopSteps.some((step) => step.observationRefs.includes("session-sandbox-tool-blocked:observation:tool-call-sandbox-blocked")), true);
});

test("PraxisRuntimeKernel.runManifest exposes model approval requests to application surface", async () => {
  class ApprovalAgent extends PraxisAgent {
    identity = "agent.model-approval";
    model = model("gpt-5.4", { carrierId: "carrier.model-approval" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const store = createInMemorySessionStateEventStore();
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-model-approval", store }).run(new ApprovalAgent(), "ask approval", {
    sessionId: "session-model-approval",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    providerCaller: async () => ({
      output: [{
        type: "function_call",
        name: "praxis_request_approval",
        call_id: "approval-call-1",
        arguments: JSON.stringify({
          reason: "need human approval for risky continuation",
          requestedScopes: ["runtime.continue"],
          riskLevel: "risky",
        }),
      }],
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.session?.status, "waitingApproval");
  assert.equal(result.state?.approvals[0]?.status, "pending");
  assert.equal(result.state?.approvals[0]?.interfaceSurface, "application");
  assert.equal(result.mainLoopSteps?.some((step) => step.status === "waitingApproval"), true);
});

test("PraxisRuntimeKernel.runManifest lets an approval resolver continue a model request", async () => {
  class ApprovalAgent extends PraxisAgent {
    identity = "agent.model-approval-resolved";
    model = model("gpt-5.4", { carrierId: "carrier.model-approval-resolved" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2 }),
    });
  }

  let calls = 0;
  const providerBodies: unknown[] = [];
  const store = createInMemorySessionStateEventStore();
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-model-approval-resolved", store }).run(new ApprovalAgent(), "ask approval", {
    sessionId: "session-model-approval-resolved",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    approvalResolver: async (approval) => ({
      status: "approved",
      resolvedBy: "unit-test",
      reason: `approved ${approval.approvalId}`,
    }),
    providerCaller: async (envelope) => {
      calls += 1;
      providerBodies.push(envelope.body);
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "praxis_request_approval",
            call_id: "approval-call-1",
            arguments: JSON.stringify({
              reason: "need human approval for risky continuation",
              requestedScopes: ["runtime.continue"],
              riskLevel: "risky",
            }),
          }],
        };
      }
      return { output_text: "approval resolved and run continued" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "approval resolved and run continued");
  assert.equal(result.state.approvals[0]?.status, "approved");
  assert.equal(result.state.approvals[0]?.interfaceSurface, "test-harness");
  const secondProviderBody = providerBodies[1] as {
    input?: readonly { type?: string; call_id?: string; output?: string; role?: string; content?: unknown }[];
  };
  const secondProviderInput = secondProviderBody.input ?? [];
  const nativeFunctionCallIndex = secondProviderInput.findIndex((item) => item.type === "function_call");
  const nativeToolResultIndex = secondProviderInput.findIndex((item) => item.type === "function_call_output");
  const dynamicPromptIndex = secondProviderInput.findIndex((item) => item.role === "user");
  const nativeFunctionCall = secondProviderInput[nativeFunctionCallIndex];
  const nativeToolResult = secondProviderInput[nativeToolResultIndex];
  assert.equal(nativeFunctionCall?.call_id, "approval-call-1");
  assert.equal(nativeToolResultIndex > nativeFunctionCallIndex, true);
  assert.equal(dynamicPromptIndex > nativeToolResultIndex, true);
  assert.equal(nativeToolResult?.call_id, "approval-call-1");
  assert.match(nativeToolResult?.output ?? "", /"status":"approved"/u);
  assert.match(nativeToolResult?.output ?? "", /runtime\.continue/u);
});

test("PraxisRuntimeKernel.runManifest maps approval resolver failures to public-safe pending surface result", async () => {
  class ApprovalAgent extends PraxisAgent {
    identity = "agent.model-approval-resolver-failure";
    model = model("gpt-5.4", { carrierId: "carrier.model-approval-resolver-failure" });
    harness = harness({
      policy: policy({ allowProviderCall: true }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1 }),
    });
  }

  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-model-approval-resolver-failure" }).run(new ApprovalAgent(), "ask approval", {
    sessionId: "session-model-approval-resolver-failure",
    dryRun: false,
    allowProviderCall: true,
    auth: authEnvelope(),
    approvalResolver: async () => {
      throw new Error("ui bridge crashed with private detail");
    },
    providerCaller: async () => ({
      output: [{
        type: "function_call",
        name: "praxis_request_approval",
        call_id: "approval-call-1",
        arguments: JSON.stringify({
          reason: "need human approval for risky continuation",
          requestedScopes: ["runtime.continue"],
          riskLevel: "risky",
        }),
      }],
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.approvals[0]?.status, "denied");
  assert.equal(result.state?.approvals[0]?.resolution?.reason, "approval resolver failed");
  assert.equal(JSON.stringify(result.state).includes("private detail"), false);
});

test("PraxisRuntimeKernel.runManifest gates BaseTool calls through tool policy approval", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-approval-"));
  await writeFile(path.join(workspace, "notes.txt"), "approval gate should stop before read\n", "utf8");

  class ToolApprovalAgent extends PraxisAgent {
    identity = "agent.tool-approval";
    model = model("gpt-5.4", { carrierId: "carrier.tool-approval" });
    toolPolicy = toolPolicies.restricted();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1, maxToolCalls: 1 }),
    });
  }

  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool-approval",
    sessionId: "session-tool-approval",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-approval" }).run(new ToolApprovalAgent(), "read notes", {
    sessionId: "session-tool-approval",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => ({
      output: [{
        type: "function_call",
        name: "praxis_tool_file_read",
        call_id: "tool-approval-call-1",
        arguments: JSON.stringify({
          workspaceRoot: workspace,
          path: "notes.txt",
          dryRun: false,
          context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
        }),
      }],
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "APPROVAL_REQUIRED");
  assert.equal(result.state?.session?.status, "waitingApproval");
  assert.equal(result.state?.approvals[0]?.source, "baseTool");
  assert.equal(result.state?.invocations.some((record) => record.kind === "tool" && !record.ok), true);
});

test("PraxisRuntimeKernel.runManifest executes governed BaseTool after approval resolver", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-approved-"));
  await writeFile(path.join(workspace, "notes.txt"), "approval resolver allows read\n", "utf8");

  class ToolApprovalAgent extends PraxisAgent {
    identity = "agent.tool-approved";
    model = model("gpt-5.4", { carrierId: "carrier.tool-approved" });
    toolPolicy = toolPolicies.restricted();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 1 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool-approved",
    sessionId: "session-tool-approved",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-approved" }).run(new ToolApprovalAgent(), "read notes", {
    sessionId: "session-tool-approved",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    approvalResolver: async () => ({ status: "approved", resolvedBy: "unit-test" }),
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "praxis_tool_file_read",
            call_id: "tool-approved-call-1",
            arguments: JSON.stringify({
              workspaceRoot: workspace,
              path: "notes.txt",
              dryRun: false,
              context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
            }),
          }],
        };
      }
      return { output_text: "approval resolver allowed the file read" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls[0]?.ok, true);
  assert.equal(result.state.approvals[0]?.status, "approved");
  assert.equal(result.finalOutput, "approval resolver allowed the file read");
});

test("PraxisRuntimeKernel.runManifest executes EphemeralProcedure through mounted BaseTools", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-procedure-"));
  await writeFile(path.join(workspace, "notes.txt"), "needle from ephemeral procedure\n", "utf8");

  class ProcedureAgent extends PraxisAgent {
    identity = "agent.procedure";
    model = model("gpt-5.4", { carrierId: "carrier.procedure" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-procedure",
    sessionId: "session-procedure",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const providerBodies: unknown[] = [];
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-procedure" }).run(new ProcedureAgent(), "read notes by procedure", {
    sessionId: "session-procedure",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async (envelope) => {
      calls += 1;
      providerBodies.push(envelope.body);
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "praxis_ephemeral_procedure",
            call_id: "procedure-call-1",
            arguments: JSON.stringify({
              procedureId: "procedure-read",
              purpose: "read an existing file through file.read",
              executionMode: "serial",
              steps: [{
                stepId: "read",
                baseToolId: "file.read",
                input: {
                  workspaceRoot: workspace,
                  path: "notes.txt",
                  dryRun: false,
                  context: {
                    workspaceRoot: workspace,
                    allowedRoots: [workspace],
                    dryRun: false,
                  },
                },
                riskLevel: "low",
              }],
            }),
          }],
        };
      }
      return { output_text: "procedure read needle from ephemeral procedure" };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.callId, "procedure-read:read");
  assert.equal(result.toolCalls[0]?.toolId, "file.read");
  assert.equal(result.finalOutput, "procedure read needle from ephemeral procedure");
  assert.equal(result.mainLoopSteps.some((step) => step.actionPrimitive === "executeEphemeralProcedure"), true);
  assert.equal(result.state.invocations.some((record) => record.summary.procedureId === "procedure-read"), true);
  assert.match(JSON.stringify(providerBodies[1]), /procedure-call-1/);
  assert.match(JSON.stringify(providerBodies[1]), /function_call_output/);
});

test("PraxisRuntimeKernel.runManifest compacts large function call arguments before provider history replay", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-compact-call-"));
  const marker = "RAXODE_LARGE_FUNCTION_CALL_ARGUMENT_";
  const largeContent = `${marker}${"markdown line\n".repeat(900)}`;

  class LargeProcedureAgent extends PraxisAgent {
    identity = "agent.large-procedure-args";
    model = model("gpt-5.4", { carrierId: "carrier.large-procedure-args" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("patch.apply")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const providerBodies: unknown[] = [];
  const cacheDebugs: Array<{
    comparisonToPrevious?: {
      stablePrefixChanged?: boolean;
      dynamicPayloadChanged?: boolean;
      changedFingerprintKeys?: readonly string[];
    };
  }> = [];
  const providerResponseIds: Array<{
    providerResponseId?: string;
    previousProviderResponseId?: string;
  }> = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-compact-call",
    sessionId: "session-compact-call",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-compact-call" }).run(
    new LargeProcedureAgent(),
    "write a large markdown file",
    {
      sessionId: "session-compact-call",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      allowPreviousResponseId: true,
      auth: authEnvelope(),
      executor,
      providerCaller: async (envelope) => {
        calls += 1;
        providerBodies.push(envelope.body);
        if (calls === 1) {
          return {
            id: "resp-compact-call-1",
            output: [{
              type: "function_call",
              name: "praxis_ephemeral_procedure",
              call_id: "procedure-large-args",
              arguments: JSON.stringify({
                procedureId: "write-large-note",
                purpose: "write a large markdown file",
                executionMode: "serial",
                steps: [{
                  stepId: "write-large",
                  baseToolId: "patch.apply",
                  input: {
                    path: "large.md",
                    content: largeContent,
                    maxBytes: 50_000,
                    context: {
                      workspaceRoot: workspace,
                      guard: { accepted: true, allowed: true, reason: "test write" },
                    },
                  },
                  riskLevel: "medium",
                }],
              }),
            }],
          };
        }
        return { id: "resp-compact-call-2", output_text: "large markdown file was written" };
      },
      onModelCallProgress: async (progress) => {
        if (progress.phase === "completed" && progress.cacheDebug !== undefined) {
          cacheDebugs.push(progress.cacheDebug);
          providerResponseIds.push({
            providerResponseId: progress.providerResponseId,
            previousProviderResponseId: progress.previousProviderResponseId,
          });
        }
      },
      now: () => "2026-05-15T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "large markdown file was written");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.toolId, "patch.apply");

  const secondProviderBody = providerBodies[1] as {
    previous_response_id?: string;
    input?: readonly { type?: string; call_id?: string; arguments?: string; output?: string }[];
  };
  assert.equal((providerBodies[0] as { previous_response_id?: string }).previous_response_id, undefined);
  assert.equal(secondProviderBody.previous_response_id, "resp-compact-call-1");
  const replayedFunctionCall = secondProviderBody.input?.find((item) =>
    item.type === "function_call" && item.call_id === "procedure-large-args"
  );
  assert.notEqual(replayedFunctionCall, undefined);
  const replayedArgumentsText = replayedFunctionCall?.arguments ?? "";
  const replayedArguments = JSON.parse(replayedArgumentsText) as {
    kind?: string;
    originalArgumentsBytes?: number;
    arguments?: Record<string, unknown>;
  };
  assert.equal(replayedArguments.kind, "praxis.compactedFunctionCallArguments");
  assert.ok((replayedArguments.originalArgumentsBytes ?? 0) > 4 * 1024);
  assert.equal(replayedArgumentsText.includes(marker), false);
  assert.match(replayedArgumentsText, /large\.md/u);
  assert.match(replayedArgumentsText, /praxis\.compactedLargeString/u);
  assert.match(JSON.stringify(secondProviderBody.input), /function_call_output/u);
  assert.equal(cacheDebugs.length, 2);
  assert.equal(cacheDebugs[0]?.comparisonToPrevious, undefined);
  assert.equal(cacheDebugs[1]?.comparisonToPrevious?.stablePrefixChanged, false);
  assert.equal(cacheDebugs[1]?.comparisonToPrevious?.dynamicPayloadChanged, true);
  assert.ok(cacheDebugs[1]?.comparisonToPrevious?.changedFingerprintKeys?.includes("inputHash"));
  assert.deepEqual(providerResponseIds, [
    { providerResponseId: "resp-compact-call-1", previousProviderResponseId: undefined },
    { providerResponseId: "resp-compact-call-2", previousProviderResponseId: "resp-compact-call-1" },
  ]);
});

test("PraxisRuntimeKernel.runManifest budgets accumulated tool result history before provider replay", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-tool-result-budget-"));
  const files = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
    const fileName = `budget-${index}.txt`;
    const marker = `RAXODE_BUDGET_FILE_${index}_`;
    await writeFile(path.join(workspace, fileName), `${marker}${"payload line\n".repeat(2_500)}`, "utf8");
    return { fileName, marker };
  }));

  class ToolResultBudgetAgent extends PraxisAgent {
    identity = "agent.tool-result-budget";
    model = model("gpt-5.4", { carrierId: "carrier.tool-result-budget" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 8 }),
    });
  }

  let calls = 0;
  const providerBodies: unknown[] = [];
  const cacheDebugs: Array<{
    providerBody?: {
      toolResultBudget?: {
        budgetBytes?: number;
        originalToolResultBytes?: number;
        replayedToolResultBytes?: number;
        fullToolResults?: number;
        compactedToolResults?: number;
      };
    };
  }> = [];
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-tool-result-budget",
    sessionId: "session-tool-result-budget",
    policy: { workspaceRoot: workspace, allowedRoots: [workspace] },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-tool-result-budget" }).run(
    new ToolResultBudgetAgent(),
    "read several medium files",
    {
      sessionId: "session-tool-result-budget",
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      providerCaller: async (envelope) => {
        calls += 1;
        providerBodies.push(envelope.body);
        if (calls === 1) {
          return {
            output: files.map((file, index) => ({
              type: "function_call",
              name: "praxis_tool_file_read",
              call_id: `read-budget-${index}`,
              arguments: JSON.stringify({
                workspaceRoot: workspace,
                path: file.fileName,
                dryRun: false,
                context: { workspaceRoot: workspace, allowedRoots: [workspace], dryRun: false },
              }),
            })),
          };
        }
        return { output_text: "medium files were read" };
      },
      onModelCallProgress: async (progress) => {
        if (progress.phase === "completed" && progress.cacheDebug !== undefined) {
          cacheDebugs.push(progress.cacheDebug);
        }
      },
      now: () => "2026-05-15T00:00:00.000Z",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "medium files were read");
  assert.equal(result.toolCalls.length, files.length);
  const secondProviderBody = providerBodies[1] as { input?: unknown };
  const replayedInput = JSON.stringify(secondProviderBody.input);
  assert.match(replayedInput, /payloadArtifact/u);
  assert.ok((cacheDebugs[1]?.providerBody?.toolResultBudget?.originalToolResultBytes ?? 0) > 0);
  assert.ok((cacheDebugs[1]?.providerBody?.toolResultBudget?.replayedToolResultBytes ?? 0) > 0);
  assert.ok((cacheDebugs[1]?.providerBody?.toolResultBudget?.fullToolResults ?? 0) > 0);
});

test("PraxisRuntimeKernel.runManifest feeds EphemeralProcedure failures back for replanning", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-procedure-failure-"));

  class ProcedureFailureAgent extends PraxisAgent {
    identity = "agent.procedure-failure";
    model = model("gpt-5.4", { carrierId: "carrier.procedure-failure" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 }),
    });
  }

  let calls = 0;
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-procedure-failure",
    sessionId: "session-procedure-failure",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-procedure-failure" }).run(new ProcedureFailureAgent(), "read missing by procedure", {
    sessionId: "session-procedure-failure",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    providerCaller: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          output: [{
            type: "function_call",
            name: "praxis_ephemeral_procedure",
            call_id: "procedure-failure-call-1",
            arguments: JSON.stringify({
              procedureId: "procedure-read-missing",
              purpose: "read a missing file through file.read",
              executionMode: "serial",
              steps: [{
                stepId: "read-missing",
                baseToolId: "file.read",
                input: {
                  workspaceRoot: workspace,
                  path: "missing.txt",
                  dryRun: false,
                  context: {
                    workspaceRoot: workspace,
                    allowedRoots: [workspace],
                    dryRun: false,
                  },
                },
                riskLevel: "low",
              }],
            }),
          }],
        };
      }
      return { output_text: "procedure failed and I can replan from the observation." };
    },
    now: () => "2026-04-30T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.finalOutput, "procedure failed and I can replan from the observation.");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.ok, false);
  assert.equal(result.state.errors.some((record) => record.code === "PROCEDURE_INVOCATION_FAILED"), true);
});

test("PraxisRuntimeKernel.runManifest treats in-flight EphemeralProcedure abort as interrupted", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-procedure-interrupt-"));
  await writeFile(path.join(workspace, "a.txt"), "alpha", "utf8");

  class ProcedureInterruptAgent extends PraxisAgent {
    identity = "agent.procedure-interrupt";
    model = model("gpt-5.4", { carrierId: "carrier.procedure-interrupt" });
    toolPolicy = toolPolicies.bapr();
    harness = harness({
      tools: tools([tool("file.read")]),
      policy: policy({
        allowProviderCall: true,
        allowToolExecution: true,
        workspaceRoot: workspace,
        allowedRoots: [workspace],
      }),
      loop: loop({ strategy: "tool-calling-v1", maxModelTurns: 1, maxToolCalls: 2 }),
    });
  }

  const controller = new AbortController();
  const executor = createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime-procedure-interrupt",
    sessionId: "session-procedure-interrupt",
    policy: {
      workspaceRoot: workspace,
      allowedRoots: [workspace],
    },
  });
  const result = await createPraxisRuntimeKernel({ runtimeId: "runtime-procedure-interrupt" }).run(new ProcedureInterruptAgent(), "interrupt procedure", {
    sessionId: "session-procedure-interrupt",
    dryRun: false,
    allowProviderCall: true,
    allowToolExecution: true,
    auth: authEnvelope(),
    executor,
    interruptSignal: controller.signal,
    onToolCallProgress: async (progress) => {
      if (progress.phase === "completed") {
        controller.abort();
      }
    },
    providerCaller: async () => ({
      output: [{
        type: "function_call",
        name: "praxis_ephemeral_procedure",
        call_id: "procedure-interrupt-call-1",
        arguments: JSON.stringify({
          procedureId: "procedure-interrupt-read",
          purpose: "read files and interrupt",
          executionMode: "serial",
          steps: [
            {
              stepId: "read-a",
              baseToolId: "file.read",
              input: {
                workspaceRoot: workspace,
                path: "a.txt",
                dryRun: false,
                context: {
                  workspaceRoot: workspace,
                  allowedRoots: [workspace],
                  dryRun: false,
                },
              },
              riskLevel: "low",
            },
            {
              stepId: "read-b",
              baseToolId: "file.read",
              input: {
                workspaceRoot: workspace,
                path: "b.txt",
                dryRun: false,
                context: {
                  workspaceRoot: workspace,
                  allowedRoots: [workspace],
                  dryRun: false,
                },
              },
              riskLevel: "low",
            },
          ],
        }),
      }],
    }),
    now: () => "2026-04-30T00:00:00.000Z",
  });

  await rm(workspace, { recursive: true, force: true });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "MAIN_LOOP_INTERRUPTED");
  assert.notEqual(result.state, undefined);
  if (result.state === undefined) return;
  assert.equal(result.state.session?.status, "interrupted");
  assert.equal(result.state.states.some((stateRecord) => stateRecord.phase === "interrupted"), true);
});
