import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PraxisAgent,
  PraxisAgentArchetype,
  PraxisRuntimeKernel,
  authoringPrimitives,
  baseTool,
  compileAgent,
  createFrameworkInspectionReport,
  endpoint,
  harness,
  inspectAgentManifest,
  loop,
  mainLoop,
  markdown,
  model,
  modelAuth,
  modelFleet,
  policy,
  sandbox,
  session,
  statePlane,
  storage as storageHelpers,
  toolPolicies,
  toolSets,
  tools,
  validateAgentManifest,
  type RuntimeApprovalEnvelope,
  type RuntimeApprovalResolver,
  createStoragePlaneRuntime,
  praxis,
} from "../../src/agentCore/index.js";

import {
  authoringPrimitives as packageAuthoringPrimitives,
  baseTool as packageBaseTool,
  modelAuthoring as packageModelAuthoring,
  praxis as packagePraxis,
} from "@praxis-ai/praxis";

class MinimalDeveloperAgent extends PraxisAgent {
  identity = "agent.public.minimal";
  model = model("gpt-5.4");
  harness = harness({
    tools: tools([
      baseTool.basetool.core.fileRead({ profileName: "codingCore" }),
    ]),
    policy: policy({ allowProviderCall: true, allowToolExecution: true }),
    loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 1 }),
  });
}

class MatureDeveloperAgent extends PraxisAgentArchetype {
  identity = "agent.public.mature";
  model = model("gpt-5.4-nano");
  modelFleet = modelFleet.auto({
    primary: endpoint("/v1/responses", { role: "background", provider: "openai", model: "gpt-5.4-nano" }),
  });
  promptPack = {
    promptPackId: "prompt.public.mature",
    base: markdown("You are a public API Praxis agent.", "public.base"),
  };
  mainLoop = mainLoop.standard({
    hooks: {
      buildPrompt: { strategyRef: "public.prompt.strategy" },
      shouldContinue: { strategyRef: "public.loop.continue" },
    },
  });
  sandbox = sandbox.hostObserved();
  storage = storageHelpers.raxWorkspace();
  toolPolicy = toolPolicies.standard();
  session = session({ persistence: "sqlite", resume: "auto", thread: "durable", logs: "full" });
  statePlane = statePlane({ expose: ["phase", "toolCalls"], control: ["pause"] });
  harness = harness({
    tools: tools([
      baseTool.basetool.core.shellRun({ profileName: "codingCore" }),
      baseTool.basetool.core.fileSearch({ profileName: "codingCore" }),
    ]),
    loop: loop.standard({ maxModelTurns: 2, maxToolCalls: 2 }),
  });
}

test("public agentCore API lets developers compile minimal and mature agents without runtime internals", async () => {
  assert.equal(authoringPrimitives.PraxisAgent, PraxisAgent);
  assert.equal(baseTool.basetool.core.fileRead().toolId, "file.read");
  assert.deepEqual(baseTool.profiles().map((profile) => profile.name), [
    "codingCore",
    "researchCore",
    "workCore",
    "runtimeCore",
    "agentCore",
    "fullCore",
  ]);
  assert.equal(packageAuthoringPrimitives.PraxisAgentArchetype.name, PraxisAgentArchetype.name);
  assert.equal(packageModelAuthoring.model("gpt-5.4").model, "gpt-5.4");
  assert.equal(packageBaseTool.basetool.core.fileSearch().toolId, "file.search");
  assert.equal(typeof modelAuth.credentialRef, "function");
  assert.equal(praxis.Agent, PraxisAgent);
  assert.equal(packagePraxis.AgentArchetype.name, PraxisAgentArchetype.name);
  assert.equal(packagePraxis.model("gpt-5.4").model, "gpt-5.4");
  const publicCredentialRef = packagePraxis.modelAuth.credentialRef({
    id: "public-api-auth",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "public-api" },
  });
  assert.equal(publicCredentialRef.ok, true);
  if (!publicCredentialRef.ok) return;
  const publicAuthEnvelope = packagePraxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: publicCredentialRef.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "public-api-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "public-api-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  });
  assert.equal(publicAuthEnvelope.envelope.present, true);
  assert.equal(publicAuthEnvelope.envelope.publicSafe, true);
  assert.equal(publicAuthEnvelope.envelope.headerPlan.some((header) => header.name === "authorization"), true);
  assert.equal(packagePraxis.basetool.core.fileRead().toolId, "file.read");
  assert.equal(packagePraxis.memory.describeRisk("search").risk, "safe");
  assert.equal(typeof packagePraxis.mcp.module, "function");
  assert.equal(typeof packagePraxis.mcpPlane.inspectMcpRuntimeMountMatrix, "function");
  assert.equal(typeof packagePraxis.buildMcpServerProfilesFromManifest, "function");
  assert.equal(typeof packagePraxis.createInMemoryMcpPlusSkillStore, "function");
  assert.equal(packagePraxis.sandbox.linuxBubblewrap().providerFamily, "linux-bubblewrap");
  assert.equal(packagePraxis.sandboxPlane.raxcellSandboxProviderDescriptor.providerFamily, "linux-bubblewrap");
  assert.equal(packagePraxis.toolPolicies.custom({ matrixId: "toolPolicy.public.custom" }).profile, "custom");
  assert.equal(typeof packagePraxis.runtime.createBaseToolExecutorPort, "function");
  assert.equal(typeof packagePraxis.runtime.inspectMcpMountMatrix, "function");
  assert.equal(typeof packagePraxis.runtime.inspectSandboxMountMatrix, "function");
  assert.equal(typeof packagePraxis.runtime.createInMemorySessionStateEventStore, "function");
  assert.equal(typeof packagePraxis.runtime.createSqliteSessionStateEventStore, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeTimelineReport, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeTimelineIndex, "function");
  assert.equal(typeof packagePraxis.runtime.queryRuntimeTimeline, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeTimelineReplayPlan, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeGovernanceReport, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeGovernanceIndex, "function");
  assert.equal(typeof packagePraxis.runtime.queryRuntimeGovernance, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeSessionReport, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeModelCallReport, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeModelCallIndex, "function");
  assert.equal(typeof packagePraxis.runtime.queryRuntimeModelCalls, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeToolCallReport, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeToolCallIndex, "function");
  assert.equal(typeof packagePraxis.runtime.queryRuntimeToolCalls, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeMultiagentReport, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeMultiagentIndex, "function");
  assert.equal(typeof packagePraxis.runtime.queryRuntimeMultiagent, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeOfficialAdapterReport, "function");
  assert.equal(typeof packagePraxis.runtime.createRuntimeOfficialAdapterIndex, "function");
  assert.equal(typeof packagePraxis.runtime.queryRuntimeOfficialAdapters, "function");
  const publicTimelineReport = packagePraxis.runtime.createRuntimeTimelineReport({
    sourceKind: "public-api-test",
    snapshot: {
      session: undefined,
      states: [],
      events: [],
      invocations: [],
      mainLoopSteps: [],
      procedures: [],
      approvals: [],
      errors: [],
    },
    foundationSnapshot: {
      session: {
        sessionId: "session.public.fork",
        projectId: "project.public",
        workspaceId: "workspace.main",
        agentId: "agent.public",
        parentSessionId: "session.public",
        forkedFromTurnId: "turn.1",
        status: "idle",
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
        metadata: { source: "application.rewind", accessToken: "secret-token" },
      },
      bindings: [],
      turns: [{
        turnId: "turn.1",
        projectId: "project.public",
        sessionId: "session.public.fork",
        turnIndex: 1,
        createdAt: "2026-06-09T00:00:00.000Z",
        checkpoint: true,
        metadata: { sourceSessionId: "session.public", sourceTurnId: "turn.1" },
      }],
      messages: [],
      summaries: [],
      artifacts: [],
    },
  });
  assert.equal(publicTimelineReport.kind, "praxis.runtime.timeline.report");
  assert.equal(publicTimelineReport.coverage.hasCheckpoints, true);
  assert.equal(publicTimelineReport.coverage.hasSessionForks, true);
  assert.deepEqual(publicTimelineReport.checkpointTurnIds, ["turn.1"]);
  assert.equal(publicTimelineReport.sessionForks[0]?.forkKind, "rewind");
  assert.equal(
    publicTimelineReport.timelineItems.find((item) => item.itemKind === "sessionFork")?.metadata.forkKind,
    "rewind",
  );
  const publicTimelineIndex = packagePraxis.runtime.createRuntimeTimelineIndex(publicTimelineReport);
  assert.equal(publicTimelineIndex.byItemKind.checkpoint, 1);
  assert.equal(publicTimelineIndex.byItemKind.sessionFork, 1);
  const publicTimelineQuery = packagePraxis.runtime.queryRuntimeTimeline({
    report: publicTimelineReport,
    query: { itemKinds: ["checkpoint"], turnId: "turn.1" },
  });
  assert.equal(publicTimelineQuery.returnedItems, 1);
  const publicReplayPlan = packagePraxis.runtime.createRuntimeTimelineReplayPlan({
    report: publicTimelineReport,
    checkpointTurnId: "turn.1",
    targetSessionId: "session.public.fork",
  });
  assert.equal(publicReplayPlan.status, "ready");
  assert.equal(publicReplayPlan.mode, "read-only-plan");
  assert.equal(publicReplayPlan.requiredPolicy.execution, "none");
  const publicSessionReport = packagePraxis.runtime.createRuntimeSessionReport({
    sourceKind: "public-api-test",
    foundationSnapshot: {
      session: {
        sessionId: "session.public.fork",
        projectId: "project.public",
        workspaceId: "workspace.main",
        agentId: "agent.public",
        parentSessionId: "session.public",
        forkedFromTurnId: "turn.1",
        status: "idle",
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
        metadata: { source: "application.rewind", token: "secret-session-token" },
      },
      bindings: [],
      turns: [{
        turnId: "turn.1",
        projectId: "project.public",
        sessionId: "session.public.fork",
        turnIndex: 1,
        createdAt: "2026-06-09T00:00:00.000Z",
        checkpoint: true,
        metadata: { sourceSessionId: "session.public", sourceTurnId: "turn.1" },
      }],
      messages: [{
        messageId: "message.public.user.1",
        projectId: "project.public",
        sessionId: "session.public.fork",
        turnId: "turn.1",
        role: "user",
        text: "private public api message",
        createdAt: "2026-06-09T00:00:00.000Z",
        artifactRefs: [],
        metadata: { sourceMessageId: "message.source.user.1", password: "secret-message" },
      }],
      summaries: [],
      artifacts: [],
    },
  });
  assert.equal(publicSessionReport.kind, "praxis.runtime.session.report");
  assert.equal(publicSessionReport.coverage.hasForkRelation, true);
  assert.equal(publicSessionReport.consistency.messageTurnIdsKnown, true);
  assert.deepEqual(publicSessionReport.checkpointTurnIds, ["turn.1"]);
  assert.deepEqual(publicSessionReport.roleCounts, { user: 1 });
  assert.equal(JSON.stringify(publicSessionReport).includes("private public api message"), false);
  assert.equal(JSON.stringify(publicSessionReport).includes("secret-message"), false);
  const publicGovernanceReport = packagePraxis.runtime.createRuntimeGovernanceReport({
    sourceKind: "public-api-test",
    snapshot: {
      session: undefined,
      states: [],
      events: [{
        sessionId: "session.public.governance",
        eventId: "event.public.policy",
        type: "runtime.baseTool.policy.adjudicated",
        createdAt: "2026-06-09T00:00:00.000Z",
        payload: {
          toolId: "shell.run",
          policyAdjudication: {
            action: "requiresApproval",
            risk: "dangerous",
            profile: "standard",
            humanApprovalScopeKey: "shell.run:command:public",
            accessToken: "secret-policy-token",
          },
          approvalScope: {
            scopeKey: "shell.run:command:public",
          },
        },
      }],
      invocations: [],
      mainLoopSteps: [],
      procedures: [],
      approvals: [{
        sessionId: "session.public.governance",
        approvalId: "approval.public.shell",
        status: "pending",
        reason: "shell.run requires approval",
        requestedScopes: ["tool.execute", "tool.shell.run"],
        riskLevel: "dangerous",
        source: "baseTool",
        interfaceSurface: "application",
        createdAt: "2026-06-09T00:00:00.000Z",
        metadata: {
          toolId: "shell.run",
          approvalScopeKey: "shell.run:command:public",
          authorization: "Bearer secret",
        },
      }],
      errors: [],
    },
  });
  assert.equal(publicGovernanceReport.kind, "praxis.runtime.governance.report");
  assert.equal(publicGovernanceReport.counts.pendingApprovals, 1);
  assert.equal(publicGovernanceReport.counts.policyDecisions, 1);
  const publicGovernanceIndex = packagePraxis.runtime.createRuntimeGovernanceIndex(publicGovernanceReport);
  assert.equal(publicGovernanceIndex.byToolId["shell.run"], 2);
  assert.deepEqual(publicGovernanceIndex.pendingApprovalIds, ["approval.public.shell"]);
  const publicGovernanceQuery = packagePraxis.runtime.queryRuntimeGovernance({
    report: publicGovernanceReport,
    query: { kinds: ["baseToolPolicy"], toolId: "shell.run", riskLevel: "dangerous" },
  });
  assert.equal(publicGovernanceQuery.returnedDecisions, 1);
  assert.equal(JSON.stringify(publicGovernanceReport).includes("secret-policy-token"), false);
  assert.equal(JSON.stringify(publicGovernanceReport).includes("Bearer secret"), false);
  const publicToolCallReport = packagePraxis.runtime.createRuntimeToolCallReport({
    sourceKind: "public-api-test",
    snapshot: {
      session: undefined,
      states: [],
      events: [{
        sessionId: "session.public.tool",
        eventId: "event:tool:public-tool-call:policy",
        type: "runtime.baseTool.policy.adjudicated",
        createdAt: "2026-06-09T00:00:00.000Z",
        payload: {
          toolId: "shell.run",
          approvalScope: { scopeKey: "shell.run:command:public" },
          policyAdjudication: {
            profile: "standard",
            risk: "dangerous",
            action: "requiresApproval",
            humanApprovalScopeKey: "shell.run:command:public",
            humanApprovalRequired: true,
            sandboxRequired: true,
            sandboxStrength: "workspace-rollback",
            token: "secret-tool-policy",
          },
          sandboxPlan: { effectiveMode: "workspace-rollback" },
          workspaceRollback: { status: "planned" },
        },
      }, {
        sessionId: "session.public.tool",
        eventId: "event:tool:public-tool-call:dependencies",
        type: "runtime.baseTool.dependencies.preflight",
        createdAt: "2026-06-09T00:00:00.000Z",
        payload: {
          toolId: "shell.run",
          dependencyPreflight: {
            status: "available",
            decision: "allow",
            credential: "secret-dependency",
          },
        },
      }],
      invocations: [{
        sessionId: "session.public.tool",
        invocationId: "public-tool-call",
        kind: "tool",
        target: "shell.run",
        ok: true,
        createdAt: "2026-06-09T00:00:00.000Z",
        summary: {
          decisionId: "decision.public.tool",
          governance: { status: "allow", policyProfile: "standard" },
          sandboxMode: "workspace-rollback",
          commandSandboxProviderFamily: "workspace-rollback",
          commandSandboxApplied: true,
          workspaceRollbackDiff: { restored: true, changedFiles: 1, password: "secret-rollback" },
        },
      }],
      mainLoopSteps: [],
      procedures: [],
      approvals: [{
        sessionId: "session.public.tool",
        approvalId: "public-tool-call:approval",
        status: "approved",
        reason: "public shell approval",
        requestedScopes: ["tool.execute", "tool.shell.run"],
        riskLevel: "dangerous",
        source: "baseTool",
        interfaceSurface: "application",
        createdAt: "2026-06-09T00:00:00.000Z",
        metadata: {
          toolCallId: "public-tool-call",
          toolId: "shell.run",
          accessToken: "secret-approval",
        },
      }],
      errors: [],
    },
  });
  assert.equal(publicToolCallReport.kind, "praxis.runtime.toolCall.report");
  assert.equal(publicToolCallReport.counts.toolInvocations, 1);
  assert.equal(publicToolCallReport.counts.policyDecisions, 1);
  assert.equal(publicToolCallReport.toolCalls[0]?.policy.policyProfile, "standard");
  assert.equal(publicToolCallReport.toolCalls[0]?.sandbox.effectiveMode, "workspace-rollback");
  assert.equal(publicToolCallReport.toolCalls[0]?.approval.status, "approved");
  const publicToolCallIndex = packagePraxis.runtime.createRuntimeToolCallIndex(publicToolCallReport);
  assert.equal(publicToolCallIndex.byToolId["shell.run"], 1);
  assert.equal(publicToolCallIndex.byApprovalStatus.approved, 1);
  const publicToolCallQuery = packagePraxis.runtime.queryRuntimeToolCalls({
    report: publicToolCallReport,
    query: { toolId: "shell.run", approvalStatus: "approved" },
  });
  assert.equal(publicToolCallQuery.returnedToolCalls, 1);
  assert.equal(JSON.stringify(publicToolCallReport).includes("secret-tool-policy"), false);
  assert.equal(JSON.stringify(publicToolCallReport).includes("secret-rollback"), false);
  assert.equal(JSON.stringify(publicToolCallReport).includes("secret-approval"), false);
  const publicModelCallReport = packagePraxis.runtime.createRuntimeModelCallReport({
    sourceKind: "public-api-test",
    snapshot: {
      session: undefined,
      states: [],
      events: [],
      invocations: [{
        sessionId: "session.public.model",
        invocationId: "public-model-call",
        kind: "model",
        target: "carrier.public.model",
        ok: true,
        createdAt: "2026-06-09T00:00:00.000Z",
        summary: {
          promptPackId: "prompt.public",
          loweringId: "lowering.public",
          modelFleetEndpointRef: "primary",
          token: "secret-model-invocation",
        },
      }],
      mainLoopSteps: [],
      procedures: [],
      approvals: [],
      errors: [],
    },
    applicationEvents: [{
      eventId: "event.public.model.completed",
      kind: "model",
      status: "running",
      message: "model request completed",
      createdAt: "2026-06-09T00:00:00.000Z",
      sessionId: "session.public.model",
      runtimeId: "runtime.public",
      turnId: "turn.1",
      publicSafe: true,
      metadata: {
        modelPhase: "completed",
        invocationId: "public-model-call",
        provider: "openai",
        carrierId: "carrier.public.model",
        model: "gpt-5.5",
        usage: {
          inputTokens: 10,
          cachedInputTokens: 4,
          outputTokens: 2,
          totalTokens: 12,
          source: "public.usage",
          estimated: false,
        },
        cacheDebug: {
          kind: "praxis.modelCall.cacheDebug",
          promptCacheKey: "public-cache-key",
          promptPack: {
            totalEstimatedTokens: 40,
            cacheablePrefixEstimatedTokens: 30,
            dynamicEstimatedTokens: 10,
            segmentCount: 2,
          },
          providerBody: {
            fingerprints: {
              instructionsHash: "public.instructions",
              inputHash: "public.input",
            },
            cacheShape: {
              stablePrefixHash: "public.stable",
              dynamicPayloadHash: "public.dynamic",
            },
          },
          observedUsage: {
            diagnosis: "partial-cache-hit",
            accessToken: "secret-cache",
          },
        },
        modelFleetEndpointRef: "primary",
        authorization: "Bearer secret-model-event",
      },
    }],
  });
  assert.equal(publicModelCallReport.kind, "praxis.runtime.modelCall.report");
  assert.equal(publicModelCallReport.counts.modelCalls, 1);
  assert.equal(publicModelCallReport.counts.completed, 1);
  assert.equal(publicModelCallReport.counts.withUsage, 1);
  assert.equal(publicModelCallReport.counts.withCacheDebug, 1);
  assert.equal(publicModelCallReport.usageTotals.weightedCacheHitRate, 0.4);
  assert.deepEqual(publicModelCallReport.providers, ["openai"]);
  assert.deepEqual(publicModelCallReport.promptCacheKeys, ["public-cache-key"]);
  const publicModelCallIndex = packagePraxis.runtime.createRuntimeModelCallIndex(publicModelCallReport);
  assert.equal(publicModelCallIndex.byProvider.openai, 1);
  assert.equal(publicModelCallIndex.byEndpointRef.primary, 1);
  const publicModelCallQuery = packagePraxis.runtime.queryRuntimeModelCalls({
    report: publicModelCallReport,
    query: { provider: "openai", hasCacheDebug: true },
  });
  assert.equal(publicModelCallQuery.returnedModelCalls, 1);
  assert.equal(JSON.stringify(publicModelCallReport).includes("secret-model-invocation"), false);
  assert.equal(JSON.stringify(publicModelCallReport).includes("secret-cache"), false);
  assert.equal(JSON.stringify(publicModelCallReport).includes("secret-model-event"), false);
  const publicMultiagentReport = packagePraxis.runtime.createRuntimeMultiagentReport({
    sourceKind: "public-api-test",
    smoke: {
      status: "ok",
      officialBridge: {
        ok: true,
        topology: "project-session-mesh",
        runtimeMediatedAccess: ["spawn", "message", "inbox", "wait", "list", "inspect"],
        unsafeSideEffects: false,
        events: ["runtime.officialModule.multiagentBridge.planned"],
      },
      baseTools: {
        mountedToolIds: ["agent.spawn", "agent.message", "agent.wait"],
        invokedToolIds: ["agent.spawn", "agent.message", "agent.wait"],
        runtimePortUsed: true,
      },
      mesh: {
        projectLocal: true,
        rootSessionId: "session.public.root",
        childSessionId: "agent-session.public.child",
        initialMessage: {
          messageId: "agent-message.public.initial",
          fromSessionId: "session.public.root",
          toSessionId: "agent-session.public.child",
        },
        waitReplyText: "public child completed with secret-token detail",
        listedSessionCount: 2,
        inspectStatus: "running",
        publicSafeSession: true,
      },
      guards: { workspaceEscapeRejected: true },
    },
    applicationEvents: [{
      eventId: "agent-session.public.child.multiagent.spawned",
      kind: "runtime",
      status: "running",
      message: "child",
      createdAt: "2026-06-09T00:00:00.000Z",
      sessionId: "session.public.root",
      publicSafe: true,
      metadata: {
        childSessionId: "agent-session.public.child",
        childAgentId: "agent.public.child",
        childLifecycle: "oneshot",
        token: "secret-multiagent-event",
      },
    }, {
      eventId: "agent-session.public.child.multiagent.completed",
      kind: "runtime",
      status: "completed",
      message: "child",
      createdAt: "2026-06-09T00:00:00.000Z",
      sessionId: "session.public.root",
      publicSafe: true,
      metadata: { childSessionId: "agent-session.public.child" },
    }, {
      eventId: "turn.public.tool.call.completed",
      kind: "tool",
      status: "completed",
      message: "agent.spawn completed",
      createdAt: "2026-06-09T00:00:00.000Z",
      sessionId: "session.public.root",
      publicSafe: true,
      metadata: {
        toolId: "agent.spawn",
        toolStatus: "completed",
        resultMetadata: { sessionId: "agent-session.public.child", password: "secret-tool-result" },
        familyKey: "agent",
      },
    }],
    applicationFacts: {
      providerToolExposure: {
        expectedProviderName: "praxis_tool_agent_spawn",
        exposesExpectedTool: true,
        exposedProviderNames: ["praxis_tool_agent_spawn"],
        toolCount: 1,
      },
      providerRoundTrip: {
        toolOutputFedBack: true,
        callId: "public-agent-spawn-call",
        outputIncludesChildSession: true,
        secondProviderInputItems: 2,
      },
      backgroundRun: {
        childProviderCalled: true,
        childRuntimeId: "runtime.public.multiagent.child",
        childReplyText: "public child reply with secret-password detail",
      },
      toolEvent: {
        toolId: "agent.spawn",
        toolStatus: "completed",
        childSessionId: "agent-session.public.child",
        familyKey: "agent",
      },
    },
  });
  assert.equal(publicMultiagentReport.kind, "praxis.runtime.multiagent.report");
  assert.equal(publicMultiagentReport.status, "ok");
  assert.equal(publicMultiagentReport.coverage.hasOfficialBridge, true);
  assert.equal(publicMultiagentReport.coverage.hasApplicationEventPath, true);
  assert.equal(publicMultiagentReport.coverage.hasBackgroundRuntime, true);
  assert.equal(publicMultiagentReport.counts.childSessions, 1);
  const publicMultiagentIndex = packagePraxis.runtime.createRuntimeMultiagentIndex(publicMultiagentReport);
  assert.equal(publicMultiagentIndex.byToolId["agent.spawn"], 1);
  assert.equal(publicMultiagentIndex.byEventKind.spawned, 1);
  const publicMultiagentQuery = packagePraxis.runtime.queryRuntimeMultiagent({
    report: publicMultiagentReport,
    query: { sessionId: "agent-session.public.child" },
  });
  assert.equal(publicMultiagentQuery.returnedSessions, 1);
  assert.equal(publicMultiagentQuery.returnedMessages, 3);
  assert.equal(JSON.stringify(publicMultiagentReport).includes("secret-token"), false);
  assert.equal(JSON.stringify(publicMultiagentReport).includes("secret-password"), false);
  assert.equal(JSON.stringify(publicMultiagentReport).includes("secret-tool-result"), false);
  const publicOfficialAdapterReport = packagePraxis.runtime.createRuntimeOfficialAdapterReport({
    sourceKind: "public-api-test",
    adapters: [{
      familyKey: "context",
      toolId: "context.load",
      toolStatus: "completed",
      expectedProviderName: "praxis_tool_context_load",
      providerToolExposed: true,
      exposedProviderNames: ["praxis_tool_context_load"],
      adapterCalls: 1,
      callId: "public-context-call",
      outputFedBack: true,
      outputIncludesEvidence: true,
      resultKind: "workspaceIndex",
      itemCount: 1,
      humanResultSummary: "public context summary with secret-token",
      metadata: { authorization: "Bearer secret-official-adapter" },
    }],
    composition: {
      callOrder: ["context.load"],
      expectedCallOrder: ["context.load"],
      providerCalls: 2,
      toolCalls: 1,
      finalEventSeen: true,
    },
    applicationEvents: [{
      eventId: "event.public.context.completed",
      kind: "tool",
      status: "completed",
      message: "context.load completed",
      createdAt: "2026-06-09T00:00:00.000Z",
      publicSafe: true,
      metadata: {
        toolId: "context.load",
        toolStatus: "completed",
        familyKey: "context",
        accessToken: "secret-event-token",
      },
    }],
  });
  assert.equal(publicOfficialAdapterReport.kind, "praxis.runtime.officialAdapter.report");
  assert.equal(publicOfficialAdapterReport.status, "ok");
  assert.equal(publicOfficialAdapterReport.coverage.hasProviderToolExposure, true);
  assert.equal(publicOfficialAdapterReport.coverage.hasProviderRoundTrip, true);
  assert.equal(publicOfficialAdapterReport.guardrails.executesAdapters, false);
  assert.equal(publicOfficialAdapterReport.guardrails.ownsContextRetrievalStrategy, false);
  const publicOfficialAdapterIndex = packagePraxis.runtime.createRuntimeOfficialAdapterIndex(publicOfficialAdapterReport);
  assert.equal(publicOfficialAdapterIndex.byFamilyKey.context, 1);
  assert.equal(publicOfficialAdapterIndex.byToolId["context.load"], 1);
  const publicOfficialAdapterQuery = packagePraxis.runtime.queryRuntimeOfficialAdapters({
    report: publicOfficialAdapterReport,
    query: { familyKey: "context", toolId: "context.load" },
  });
  assert.equal(publicOfficialAdapterQuery.returnedAdapters, 1);
  assert.equal(JSON.stringify(publicOfficialAdapterReport).includes("secret-token"), false);
  assert.equal(JSON.stringify(publicOfficialAdapterReport).includes("secret-official-adapter"), false);
  assert.equal(JSON.stringify(publicOfficialAdapterReport).includes("secret-event-token"), false);
  assert.equal(typeof packagePraxis.sandboxPlane.inspectSandboxRuntimeMountMatrix, "function");
  const publicSandboxMatrix = await packagePraxis.runtime.inspectSandboxMountMatrix({
    sandbox: packagePraxis.sandbox.hostObserved(),
    policyProfile: "standard",
    toolId: "shell.run",
  });
  assert.equal(publicSandboxMatrix.status, "degraded");
  assert.equal(publicSandboxMatrix.sandbox.hostObserved, true);
  assert.equal(publicSandboxMatrix.sandbox.isolationEvidence, "governed-host-observation");
  const publicRuntimePorts = new Set(packagePraxis.runtime.listBaseToolImplementedPortPaths({
    adapters: {
      skill: {
        load: async () => ({ ok: true, output: { loaded: true } }),
      },
    },
  }));
  assert.equal(publicRuntimePorts.has("filesystem.readText"), true);
  assert.equal(publicRuntimePorts.has("search.ripgrep"), true);
  assert.equal(publicRuntimePorts.has("skill.load"), true);
  const publicSurfaceRegistry = packagePraxis.runtime.createSurfaceRegistry({
    runtimeId: "runtime.public-api",
    surfaces: [
      {
        surfaceId: "runtime.applicationSurface",
        kind: "applicationSurface",
        scopes: ["runtime:invoke"],
        callers: ["application"],
      },
      {
        surfaceId: "runtime.contractSurface",
        kind: "contractSurface",
      },
      {
        surfaceId: "runtime.governancePlane",
        kind: "governancePlane",
      },
      {
        surfaceId: "runtime.invocationMethod",
        kind: "invocationMethod",
      },
      {
        surfaceId: "runtime.officialModuleSurface",
        kind: "officialModuleSurface",
        ready: false,
        required: false,
      },
    ],
  });
  assert.equal(publicSurfaceRegistry.ok, true);
  if (!publicSurfaceRegistry.ok) return;
  assert.equal(publicSurfaceRegistry.registry.resolve({
    surfaceId: "runtime.applicationSurface",
    caller: "application",
    requestedScopes: ["runtime:invoke"],
  }).ok, true);
  const publicSurfaceInspection = packagePraxis.inspection.inspectRuntimeSurfaces({
    runtimeId: "runtime.public-api",
    surfaces: publicSurfaceRegistry.registry.surfaces.map((surface) => ({
      surfaceId: surface.surfaceId,
      mounted: surface.mounted,
      ready: surface.ready,
      required: surface.required,
      exposedCapabilities: surface.capabilities,
    })),
  });
  assert.equal(publicSurfaceInspection.ok, true);
  if (!publicSurfaceInspection.ok) return;
  assert.equal(publicSurfaceInspection.inspection.status, "degraded");
  assert.deepEqual(publicSurfaceInspection.inspection.degradedSurfaceIds, ["runtime.officialModuleSurface"]);
  const publicCompositionRoot = packagePraxis.runtime.createCompositionRoot({
    runtimeId: "runtime.public-api",
    caller: { kind: "application", id: "public-api-test" },
    surfaces: [
      { surface: "runtime.applicationSurface", bindingId: "runtime.applicationSurface:binding" },
      { surface: "runtime.contractSurface", bindingId: "runtime.contractSurface:binding" },
      { surface: "runtime.governancePlane", bindingId: "runtime.governancePlane:binding" },
      { surface: "runtime.invocationMethod", bindingId: "runtime.invocationMethod:binding" },
    ],
  });
  assert.equal(publicCompositionRoot.ok, true);
  if (!publicCompositionRoot.ok) return;
  assert.equal(publicCompositionRoot.composition.surface, "runtime.compositionRoot");
  assert.equal(packagePraxis.interfaceAdapter.createInterfaceEnvelope({
    envelopeId: "event.public",
    kind: "event",
    surface: "application",
    runtimeId: "runtime.public-api",
    payload: {},
  }).ok, true);

  const minimal = compileAgent(MinimalDeveloperAgent, { compiledAt: "2026-05-04T00:00:00.000Z" });
  assert.equal(minimal.ok, true);
  if (!minimal.ok) return;
  assert.equal(minimal.manifest.sandbox.profile, "host-observed");
  assert.equal(minimal.manifest.toolPolicy.profile, "standard");
  assert.equal(minimal.manifest.harness.tools[0]?.family, "coreBase");
  assert.equal(minimal.manifest.harness.tools[0]?.group, "filesystem");

  const mature = compileAgent(MatureDeveloperAgent, { compiledAt: "2026-05-04T00:00:00.000Z" });
  assert.equal(mature.ok, true);
  if (!mature.ok) return;
  assert.equal(mature.manifest.promptPack.promptPackId, "prompt.public.mature");
  assert.equal(mature.manifest.harness.promptPack.promptPackId, "prompt.public.mature");
  assert.equal(mature.manifest.harness.toolPolicy.profile, "standard");
  assert.equal(mature.manifest.harness.sandbox.profile, "host-observed");
  assert.equal(mature.manifest.harness.storage.kind, "rax-workspace");
  assert.equal(mature.manifest.harness.storage.sessionStoreRef, "session.sqlite.workspace");
  assert.equal(mature.manifest.harness.tools.some((item) => item.toolId === "file.search"), true);
  const validation = validateAgentManifest(mature.manifest);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;
  assert.equal(inspectAgentManifest(validation.manifest).frameworkCore.mainLoopBindRef, "runtime.execEngine.bindCoreLogic");

  const runtime = new PraxisRuntimeKernel({ runtimeId: "runtime.public-api" });
  const result = await runtime.runManifest(minimal.manifest, "Say hello from public API.");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.finalOutput, "PraxisRuntimeKernel dry-run completed.");
  }

  const resolver: RuntimeApprovalResolver = async (approval: RuntimeApprovalEnvelope) => ({
    status: approval.publicSafe ? "approved" : "denied",
    resolvedBy: "public-api-test",
  });
  const approvalResolution = await resolver({
    approvalId: "approval.public",
    runtimeId: "runtime.public-api",
    sessionId: "session.public-api",
    source: "runtime",
    reason: "public API type smoke",
    requestedScopes: ["runtime.continue"],
    interfaceSurface: "application",
    metadata: {},
    publicSafe: true,
  });
  assert.equal(approvalResolution.status, "approved");

  const inspection = createFrameworkInspectionReport({
    runtimeId: "runtime.public-api",
    manifest: mature.manifest,
    providers: [{ providerId: "codex_responses", ready: true }],
  });
  assert.equal(inspection.ok, true);
  if (inspection.ok) {
    assert.equal(inspection.report.audit.reportSurface, "runtime.inspection.frameworkInspectionReport");
    assert.equal(inspection.report.storage.writesSecrets, false);
    assert.equal(inspection.report.toolReadiness.total, mature.manifest.harness.tools.length);
    assert.ok(inspection.report.toolReadiness.tools.some((tool) => tool.toolId === "shell.run"));
    assert.equal(
      inspection.report.toolReadiness.byDeveloperReadiness.adapterRequired > 0 ||
        inspection.report.toolReadiness.byDeveloperReadiness.usableWithApproval > 0 ||
        inspection.report.toolReadiness.byDeveloperReadiness.notLiveProven > 0,
      true,
    );
  }

  const storageRuntime = createStoragePlaneRuntime({
    cwd: process.cwd(),
    agentId: mature.manifest.identity.id,
  });
  assert.equal(storageRuntime.ok, true);
});

test("agentCore developer guide documents the public framework path", async () => {
  const guide = await readFile(
    new URL("../../docs/agentCore/agent_runtimeImplementation/agentCoreFrameworkDeveloperGuide.md", import.meta.url),
    "utf8",
  );

  assert.match(guide, /PraxisAgent class or instance/);
  assert.match(guide, /compileAgent\(\.\.\.\)/);
  assert.match(guide, /AgentManifest/);
  assert.match(guide, /PraxisRuntimeKernel\.runManifest/);
  assert.match(guide, /src\/agentCore\/index\.ts/);
  assert.match(guide, /praxis\.storage\.raxWorkspace\(\)/);
  assert.match(guide, /family \/ group \/ toolId/);
});
