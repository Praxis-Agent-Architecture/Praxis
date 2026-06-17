import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationApprovalSummary,
  type PraxisApplicationGovernanceReportOutput,
  type PraxisApplicationEvent,
  type PraxisApplicationToolCallReportOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationApprovalSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
  };
  providerCalls: number;
  approval: {
    requested: boolean;
    decided: boolean;
    pendingApprovalId: string | undefined;
    feature: string | undefined;
    featureKey: string | undefined;
    riskLevel: string | undefined;
    requestedScopes: readonly string[];
    finalDecision: string | undefined;
  };
  providerRoundTrip: {
    toolOutputFedBack: boolean;
    outputIncludesStdout: boolean;
    callId: string | undefined;
  };
  toolEvent: {
    toolId: string | undefined;
    toolStatus: string | undefined;
    policyProfile: string | undefined;
    governanceStatus: string | undefined;
    sandboxMode: string | undefined;
    commandSandboxApplied: boolean | undefined;
  };
  governance: {
    applicationCommandKind: PraxisApplicationGovernanceReportOutput["kind"];
    applicationQueryItems: number;
    reportStatus: "ok" | "failed";
    decisionCount: number;
    pendingApprovals: number;
    approvedApprovals: number;
    policyDecisions: number;
    interfaceApprovalEnvelopes: number;
    shellPolicyDecisions: number;
    approvalQueryItems: number;
    publicSafe: boolean;
  };
  toolCallReport: {
    applicationCommandKind: PraxisApplicationToolCallReportOutput["kind"];
    applicationQueryToolCalls: number;
    reportStatus: "ok" | "failed";
    toolInvocations: number;
    completed: number;
    policyDecisions: number;
    dependencyPreflights: number;
    approvals: number;
    shellToolCalls: number;
    approvedToolCalls: number;
    workspaceRollbackRequired: number;
    sandboxMode: string | undefined;
    policyProfile: string | undefined;
    approvalStatus: string | undefined;
    publicSafe: boolean;
  };
  events: readonly string[];
};

export type RuntimeApplicationApprovalSmokeInput = {
  now?: () => string;
  projectRoot?: string;
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function governanceReportOutput(value: unknown): PraxisApplicationGovernanceReportOutput {
  if (record(value).kind !== "praxis.application.governanceReport") {
    throw new Error("application inspectGovernance did not return a governance report output.");
  }
  return value as PraxisApplicationGovernanceReportOutput;
}

function toolCallReportOutput(value: unknown): PraxisApplicationToolCallReportOutput {
  if (record(value).kind !== "praxis.application.toolCallReport") {
    throw new Error("application inspectToolCalls did not return a tool-call report output.");
  }
  return value as PraxisApplicationToolCallReportOutput;
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-approval-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-approval-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application approval smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-approval-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-approval-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationApprovalSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationApprovalSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationApprovalSmoke",
  });
  sandbox = praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
  });
  toolPolicy = praxis.toolPolicies.standard({
    matrixId: "toolPolicy.example.applicationApprovalSmoke.standard",
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.tool("shell.run", {
        family: "coreBase",
        group: "shell",
        description: "Run a governed shell command after application approval.",
      }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 2,
      maxToolCalls: 1,
    }),
  });
}

export default ApplicationApprovalSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-approval-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationApprovalSmokeAgent",
    application: { id: "application.approval-smoke" },
    agent: { id: "agent.example.applicationApprovalSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind === "tool") {
    const metadata = record(event.metadata);
    return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
  }
  if (event.kind === "approval") {
    const metadata = record(event.metadata);
    return `approval:${String(metadata.approvalId ?? "unknown")}:${String(metadata.decision ?? event.status)}`;
  }
  return event.kind;
}

async function waitForPendingApproval(input: {
  getView: () => Promise<PraxisApplicationViewModel>;
  timeoutMs: number;
}): Promise<PraxisApplicationApprovalSummary> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    const pending = (await input.getView()).approvals.find((approval) => approval.status === "pending");
    if (pending !== undefined) return pending;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for application approval request");
}

export async function runApplicationApprovalSmoke(
  input: RuntimeApplicationApprovalSmokeInput = {},
): Promise<RuntimeApplicationApprovalSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-approval-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "standard",
      toolProfile: "codingCore",
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async (envelope) => {
          providerCalls += 1;
          providerBodies.push(envelope.body);
          if (providerCalls === 1) {
            return {
              output: [{
                type: "function_call",
                name: "shell.run",
                call_id: "application-approval-shell-call",
                arguments: JSON.stringify({
                  command: "printf application-approval-ok",
                  cwd: projectRoot,
                  dryRun: false,
                }),
              }],
            };
          }
          return { output_text: "application approval smoke completed" };
        },
      }),
    });
    if (!created.ok) throw new Error(created.error.message);
    const unsubscribe = created.runtime.subscribe((event) => events.push(event));
    try {
      const transport = createLocalApplicationTransport(created.runtime);
      await transport.dispatch({
        type: "application.start",
        cwd: projectRoot,
        mode: "live",
      });
      const submitTurn = transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        input: {
          type: "application.input",
          text: "Run the approval-gated shell smoke command.",
          cwd: projectRoot,
        },
      });
      const pendingApproval = await waitForPendingApproval({
        getView: () => transport.getView(),
        timeoutMs: 4000,
      });
      await transport.dispatch({
        type: "application.approvalDecision",
        approvalId: pendingApproval.approvalId,
        decision: "approve",
        note: "application approval smoke approves shell.run",
      });
      const result = await submitTurn;
      const view = result.view;
      const decidedApproval = view.approvals.find((approval) => approval.approvalId === pendingApproval.approvalId);
      const completedToolEvent = events.find((event) => {
        const metadata = record(event.metadata);
        return event.kind === "tool" && metadata.toolId === "shell.run" && metadata.toolStatus === "completed";
      });
      const toolMetadata = record(completedToolEvent?.metadata);
      const resultMetadata = record(toolMetadata.resultMetadata);
      const recordMetadata = record(toolMetadata.recordMetadata);
      const governanceMetadata = record(recordMetadata.governance);
      const secondProviderInput = Array.isArray(record(providerBodies[1]).input) ? record(providerBodies[1]).input as unknown[] : [];
      const toolResultInput = secondProviderInput.map((item) => record(item)).find((item) => item.type === "function_call_output");
      const toolResultOutput = typeof toolResultInput?.output === "string" ? toolResultInput.output : "";
      const governanceReportResult = await transport.dispatch({
        type: "application.inspectGovernance",
        query: { kinds: ["baseToolPolicy"], toolId: "shell.run", riskLevel: "dangerous" },
      });
      if (!governanceReportResult.ok) {
        throw new Error(governanceReportResult.error.message);
      }
      const applicationGovernanceReport = governanceReportOutput(governanceReportResult.output);
      const governanceReport = applicationGovernanceReport.report;
      const governanceIndex = applicationGovernanceReport.index;
      const shellPolicyDecisions = applicationGovernanceReport.query;
      const approvalQuery = praxis.runtime.queryRuntimeGovernance({
        report: governanceReport,
        query: { kinds: ["approval"], approvalId: pendingApproval.approvalId },
      });
      const serializedGovernance = JSON.stringify(governanceReport);
      const toolCallReportResult = await transport.dispatch({
        type: "application.inspectToolCalls",
        query: { toolId: "shell.run", sandboxMode: "workspace-rollback", policyProfile: "standard" },
      });
      if (!toolCallReportResult.ok) {
        throw new Error(toolCallReportResult.error.message);
      }
      const applicationToolCallReport = toolCallReportOutput(toolCallReportResult.output);
      const toolCallReport = applicationToolCallReport.report;
      const toolCallIndex = applicationToolCallReport.index;
      const shellToolCalls = applicationToolCallReport.query;
      const approvedToolCalls = praxis.runtime.queryRuntimeToolCalls({
        report: toolCallReport,
        query: { approvalStatus: "approved" },
      });
      const serializedToolCallReport = JSON.stringify(toolCallReport);
      const eventNames = [...new Set(events.map(eventSummary))];
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application approval smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 2 &&
          view.counters.toolCalls === 1 &&
          providerCalls === 2 &&
          pendingApproval.feature === "shell" &&
          pendingApproval.riskLevel === "dangerous" &&
          pendingApproval.requestedScopes?.includes("tool.shell.run") === true &&
          decidedApproval?.decision === "approve" &&
          toolResultInput !== undefined &&
          toolResultOutput.includes("application-approval-ok") &&
          stringValue(toolMetadata.toolId) === "shell.run" &&
          stringValue(toolMetadata.toolStatus) === "completed" &&
          stringValue(resultMetadata.policyProfile) === "standard" &&
          stringValue(resultMetadata.sandboxMode) === "workspace-rollback" &&
          booleanValue(resultMetadata.commandSandboxApplied) === true &&
          governanceReport.counts.approvals === 1 &&
          governanceReport.counts.approvedApprovals === 1 &&
          governanceReport.counts.pendingApprovals === 0 &&
          governanceReport.counts.policyDecisions === 1 &&
          governanceReport.counts.interfaceApprovalEnvelopes === 1 &&
          governanceIndex.byToolId["shell.run"] >= 2 &&
          applicationGovernanceReport.kind === "praxis.application.governanceReport" &&
          applicationGovernanceReport.publicSafe &&
          applicationGovernanceReport.sessionId === view.sessionId &&
          applicationGovernanceReport.runtimeId === view.runtimeId &&
          shellPolicyDecisions.returnedDecisions === 1 &&
          approvalQuery.returnedDecisions === 1 &&
          !serializedGovernance.includes("application-approval-smoke-token") &&
          toolCallReport.counts.toolInvocations === 1 &&
          toolCallReport.counts.completed === 1 &&
          toolCallReport.counts.policyDecisions === 1 &&
          toolCallReport.counts.dependencyPreflights === 1 &&
          toolCallReport.counts.approvals === 1 &&
          toolCallIndex.byToolId["shell.run"] === 1 &&
          applicationToolCallReport.kind === "praxis.application.toolCallReport" &&
          applicationToolCallReport.publicSafe &&
          applicationToolCallReport.sessionId === view.sessionId &&
          applicationToolCallReport.runtimeId === view.runtimeId &&
          shellToolCalls.returnedToolCalls === 1 &&
          approvedToolCalls.returnedToolCalls === 1 &&
          shellToolCalls.toolCalls[0]?.sandbox.effectiveMode === "workspace-rollback" &&
          shellToolCalls.toolCalls[0]?.policy.policyProfile === "standard" &&
          shellToolCalls.toolCalls[0]?.approval.status === "approved" &&
          !serializedToolCallReport.includes("application-approval-smoke-token") &&
          eventNames.includes(`approval:${pendingApproval.approvalId}:awaiting-approval`) &&
          eventNames.includes(`approval:${pendingApproval.approvalId}:approve`) &&
          eventNames.includes("tool:shell.run:completed") &&
          eventNames.includes("final")
          ? "ok"
          : "failed",
        startedAt,
        finishedAt: now(),
        projectRoot,
        view: {
          status: view.status,
          finalOutput: view.finalOutput,
          counters: view.counters,
        },
        providerCalls,
        approval: {
          requested: pendingApproval !== undefined,
          decided: decidedApproval?.status === "decided",
          pendingApprovalId: pendingApproval.approvalId,
          feature: pendingApproval.feature,
          featureKey: pendingApproval.featureKey,
          riskLevel: pendingApproval.riskLevel,
          requestedScopes: pendingApproval.requestedScopes ?? [],
          finalDecision: decidedApproval?.decision,
        },
        providerRoundTrip: {
          toolOutputFedBack: toolResultInput !== undefined,
          outputIncludesStdout: toolResultOutput.includes("application-approval-ok"),
          callId: stringValue(toolResultInput?.call_id),
        },
        toolEvent: {
          toolId: stringValue(toolMetadata.toolId),
          toolStatus: stringValue(toolMetadata.toolStatus),
          policyProfile: stringValue(resultMetadata.policyProfile),
          governanceStatus: stringValue(governanceMetadata.status),
          sandboxMode: stringValue(resultMetadata.sandboxMode),
          commandSandboxApplied: booleanValue(resultMetadata.commandSandboxApplied),
        },
        governance: {
          applicationCommandKind: applicationGovernanceReport.kind,
          applicationQueryItems: applicationGovernanceReport.query.returnedDecisions,
          reportStatus: governanceReport.kind === "praxis.runtime.governance.report" ? "ok" : "failed",
          decisionCount: governanceReport.counts.decisions,
          pendingApprovals: governanceReport.counts.pendingApprovals,
          approvedApprovals: governanceReport.counts.approvedApprovals,
          policyDecisions: governanceReport.counts.policyDecisions,
          interfaceApprovalEnvelopes: governanceReport.counts.interfaceApprovalEnvelopes,
          shellPolicyDecisions: shellPolicyDecisions.returnedDecisions,
          approvalQueryItems: approvalQuery.returnedDecisions,
          publicSafe: !serializedGovernance.includes("application-approval-smoke-token"),
        },
        toolCallReport: {
          applicationCommandKind: applicationToolCallReport.kind,
          applicationQueryToolCalls: applicationToolCallReport.query.returnedToolCalls,
          reportStatus: toolCallReport.kind === "praxis.runtime.toolCall.report" ? "ok" : "failed",
          toolInvocations: toolCallReport.counts.toolInvocations,
          completed: toolCallReport.counts.completed,
          policyDecisions: toolCallReport.counts.policyDecisions,
          dependencyPreflights: toolCallReport.counts.dependencyPreflights,
          approvals: toolCallReport.counts.approvals,
          shellToolCalls: shellToolCalls.returnedToolCalls,
          approvedToolCalls: approvedToolCalls.returnedToolCalls,
          workspaceRollbackRequired: toolCallReport.counts.workspaceRollbackRequired,
          sandboxMode: shellToolCalls.toolCalls[0]?.sandbox.effectiveMode,
          policyProfile: shellToolCalls.toolCalls[0]?.policy.policyProfile,
          approvalStatus: shellToolCalls.toolCalls[0]?.approval.status,
          publicSafe: !serializedToolCallReport.includes("application-approval-smoke-token"),
        },
        events: eventNames,
      };
    } finally {
      unsubscribe();
    }
  } finally {
    if (ownsProjectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationApprovalSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
