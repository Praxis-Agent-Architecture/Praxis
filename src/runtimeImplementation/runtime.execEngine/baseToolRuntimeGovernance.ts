/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / BaseTool 治理面。
 * 核心目的：按 family/group/toolId 与 policy matrix 解释一次 BaseTool 调用是否允许、需要审批或拒绝。
 * 能力要求1：把 BaseTool policy profile、sandbox、readiness 和 resource limit 合并成 public-safe 决策。
 * 能力要求2：让 Kernel 和 EphemeralProcedure 在 invokeMountedBaseTool 前走同一个治理入口。
 * 边界：只做 runtime 治理和审计解释，不替代 BaseTool handler 语义，不绕过 registry/handler/executor 链。
 * 对接：需要服务 PraxisRuntimeKernel、runtimeSessionStateEventStore、approval surface 和 BaseTool runtime mount。
 * 实现提示：先输出稳定 governance decision，再由 Kernel 负责 approval envelope、event/session persistence 和实际 mount 调用。
 */

import type { BaseToolRiskLevel } from "../../basetool/types.js";
import type {
  BaseToolPolicyDecision,
  BaseToolPolicyMatrixSpec,
  BaseToolPolicyRisk,
  BaseToolPolicyRule,
  SandboxResourceLimits,
  SandboxSpec,
} from "../runtimeAgentManifest.js";
import type {
  BaseToolRuntimeReadinessPreflight,
  BaseToolSupportCatalogEntry,
} from "./baseToolSupportCatalog.js";

export type BaseToolRuntimeGovernanceStatus = "allow" | "guarded" | "deny" | "requiresApproval";

export type BaseToolRuntimeGovernanceRequest = {
  toolId: string;
  policyMatrix: BaseToolPolicyMatrixSpec;
  sandbox: SandboxSpec;
  readiness?: BaseToolRuntimeReadinessPreflight;
  catalogEntry?: BaseToolSupportCatalogEntry;
  resourceLimits?: SandboxResourceLimits;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolRuntimeGovernanceDecision = {
  kind: "runtime.execEngine.baseTool.governanceDecision";
  toolId: string;
  family?: string;
  group?: string;
  risk: "safe" | "risky" | "dangerous";
  status: BaseToolRuntimeGovernanceStatus;
  policyProfile: BaseToolPolicyMatrixSpec["profile"];
  policyMatrixId: string;
  matchedRule?: BaseToolPolicyRule;
  approvalRequired: boolean;
  approvalReason?: string;
  sandbox: {
    sandboxId: string;
    profile: SandboxSpec["profile"];
    providerFamily?: SandboxSpec["providerFamily"];
    isolationLevel?: SandboxSpec["isolationLevel"];
    filesystem: SandboxSpec["filesystem"];
    network: SandboxSpec["network"];
    shell: SandboxSpec["shell"];
    hostObserved: boolean;
    dependencyRefs: readonly string[];
  };
  readiness?: BaseToolRuntimeReadinessPreflight;
  resourceLimits: SandboxResourceLimits;
  publicSafe: true;
  events: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

function riskFromBaseToolRisk(risk: BaseToolRiskLevel | BaseToolPolicyRisk | undefined): "safe" | "risky" | "dangerous" {
  if (risk === "dangerous" || risk === "destructive" || risk === "high") return "dangerous";
  if (risk === "risky" || risk === "medium") return "risky";
  return "safe";
}

function storageFamilyAliases(entry: BaseToolSupportCatalogEntry | undefined): readonly string[] {
  if (entry === undefined) return [];
  return [...new Set([entry.family, entry.storageFamily].filter(Boolean))];
}

function ruleSpecificity(rule: BaseToolPolicyRule): number {
  if (rule.scope === "toolId") return 40;
  if (rule.scope === "group") return 30;
  if (rule.scope === "family") return 20;
  return 10;
}

function ruleMatches(input: {
  rule: BaseToolPolicyRule;
  toolId: string;
  risk: "safe" | "risky" | "dangerous";
  entry?: BaseToolSupportCatalogEntry;
}): boolean {
  const rule = input.rule;
  if (rule.scope === "toolId") return rule.toolId === input.toolId;
  if (rule.scope === "family") return rule.family !== undefined && storageFamilyAliases(input.entry).includes(rule.family);
  if (rule.scope === "group") {
    return (
      rule.family !== undefined &&
      rule.group !== undefined &&
      storageFamilyAliases(input.entry).includes(rule.family) &&
      input.entry?.group === rule.group
    );
  }
  return rule.action === input.risk;
}

function matchingRule(input: {
  toolId: string;
  risk: "safe" | "risky" | "dangerous";
  entry?: BaseToolSupportCatalogEntry;
  policyMatrix: BaseToolPolicyMatrixSpec;
}): BaseToolPolicyRule | undefined {
  const rules = [
    ...input.policyMatrix.toolRules,
    ...input.policyMatrix.groupRules,
    ...input.policyMatrix.familyRules,
    ...input.policyMatrix.actionRules,
  ];
  return rules
    .filter((rule) => ruleMatches({ ...input, rule }))
    .sort((left, right) => ruleSpecificity(right) - ruleSpecificity(left))[0];
}

function statusFromDecision(
  decision: BaseToolPolicyDecision,
  risk: "safe" | "risky" | "dangerous",
): BaseToolRuntimeGovernanceStatus {
  if (decision === "deny") return "deny";
  if (decision === "approval") return "requiresApproval";
  if (decision === "approval-on-destructive") return risk === "dangerous" ? "requiresApproval" : "allow";
  if (decision === "guarded") return "guarded";
  return "allow";
}

function filesystemCreateCanRelaxApproval(request: BaseToolRuntimeGovernanceRequest, matchedRule: BaseToolPolicyRule | undefined): boolean {
  if (request.metadata?.filesystemAction !== "create") return false;
  if (request.policyMatrix.profile === "restricted") return false;
  if (matchedRule !== undefined && matchedRule.scope !== "action") return false;
  return true;
}

export function evaluateBaseToolRuntimeGovernance(
  request: BaseToolRuntimeGovernanceRequest,
): BaseToolRuntimeGovernanceDecision {
  const toolId = request.toolId.trim();
  const risk = riskFromBaseToolRisk(request.catalogEntry?.riskLevel);
  const matchedRule = matchingRule({
    toolId,
    risk,
    entry: request.catalogEntry,
    policyMatrix: request.policyMatrix,
  });
  const decision = matchedRule?.decision ?? request.policyMatrix.defaultDecision;
  let status = statusFromDecision(decision, risk);
  if (status === "requiresApproval" && filesystemCreateCanRelaxApproval(request, matchedRule)) {
    status = "allow";
  }
  if (request.readiness?.decision === "blocked") {
    status = "deny";
  }

  const approvalRequired = status === "requiresApproval";
  const approvalReason =
    approvalRequired
      ? request.readiness?.decision === "requiresApproval"
        ? request.readiness.reason
        : `BaseTool ${toolId} requires approval under ${request.policyMatrix.profile} policy`
      : undefined;

  return {
    kind: "runtime.execEngine.baseTool.governanceDecision",
    toolId,
    family: request.catalogEntry?.storageFamily ?? request.catalogEntry?.family,
    group: request.catalogEntry?.group,
    risk,
    status,
    policyProfile: request.policyMatrix.profile,
    policyMatrixId: request.policyMatrix.matrixId,
    matchedRule,
    approvalRequired,
    approvalReason,
    sandbox: {
      sandboxId: request.sandbox.sandboxId,
      profile: request.sandbox.profile,
      providerFamily: request.sandbox.providerFamily,
      isolationLevel: request.sandbox.isolationLevel,
      filesystem: request.sandbox.filesystem,
      network: request.sandbox.network,
      shell: request.sandbox.shell,
      hostObserved: request.sandbox.profile === "host-observed",
      dependencyRefs: request.sandbox.dependencyRefs ?? [],
    },
    readiness: request.readiness,
    resourceLimits: request.resourceLimits ?? request.sandbox.resourceLimits,
    publicSafe: true,
    events: [
      status === "allow"
        ? "runtime.execEngine.baseTool.governance.allowed"
        : status === "guarded"
          ? "runtime.execEngine.baseTool.governance.guarded"
        : status === "requiresApproval"
          ? "runtime.execEngine.baseTool.governance.requiresApproval"
          : "runtime.execEngine.baseTool.governance.denied",
    ],
    metadata: request.metadata ?? {},
  };
}
