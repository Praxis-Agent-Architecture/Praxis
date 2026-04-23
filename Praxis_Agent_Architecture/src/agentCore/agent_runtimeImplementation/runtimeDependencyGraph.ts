/*
 * 文件定位：Agent 运行态实现层。
 * 核心目的：承载 runtime Dependency Graph 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeDependencyGraphNodeKind =
  | "application-surface"
  | "official-module-surface"
  | "contract-surface"
  | "governance-plane"
  | "invocation-method"
  | "inspection-surface"
  | "debug-surface"
  | "runtime-extension";

export type RuntimeDependencyGraphBoundary = "input" | "contract" | "governance" | "runtime-state" | "graph";

export type RuntimeDependencyGraphErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_GRAPH_INPUT"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "MISSING_NODE_ID"
  | "MISSING_NODE_KIND"
  | "DUPLICATE_NODE_ID"
  | "UNKNOWN_DEPENDENCY"
  | "SELF_DEPENDENCY"
  | "CYCLIC_DEPENDENCY";

export type RuntimeDependencyGraphGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeDependencyGraphNodeDescriptor = {
  nodeId?: string;
  kind?: RuntimeDependencyGraphNodeKind;
  label?: string;
  dependsOn?: readonly string[];
  ready?: boolean;
  required?: boolean;
};

export type RuntimeDependencyGraphNode = {
  nodeId: string;
  kind: RuntimeDependencyGraphNodeKind;
  label?: string;
  dependsOn: readonly string[];
  ready: boolean;
  required: boolean;
};

export type RuntimeDependencyGraphEdge = {
  fromNodeId: string;
  toNodeId: string;
};

export type RuntimeDependencyGraphIssue = {
  nodeId: string;
  reason: string;
};

export type RuntimeDependencyGraphSnapshot = {
  runtimeId: string;
  graphSurface: "runtime.runtimeDependencyGraph";
  nodes: readonly RuntimeDependencyGraphNode[];
  edges: readonly RuntimeDependencyGraphEdge[];
  evaluationOrder: readonly string[];
  blockingIssues: readonly RuntimeDependencyGraphIssue[];
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeDependencyGraphRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  nodes?: readonly RuntimeDependencyGraphNodeDescriptor[];
  contract?: RuntimeDependencyGraphGate;
  governance?: RuntimeDependencyGraphGate;
};

export type RuntimeDependencyGraphError = {
  code: RuntimeDependencyGraphErrorCode;
  message: string;
  boundary: RuntimeDependencyGraphBoundary;
  safeForRuntimeInspection: true;
};

export type RuntimeDependencyGraphResult =
  | {
      ok: true;
      graph: RuntimeDependencyGraphSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeDependencyGraphError;
      events: readonly string[];
    };

export const runtimeDependencyGraphDescriptor = {
  surface: "runtime.runtimeDependencyGraph",
  capability: "runtimeDependencyGraph",
  purpose: "normalize runtime dependency declarations into a readonly graph for inspection and invocation planning",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeDependencyGraphErrorCode,
  message: string,
  boundary: RuntimeDependencyGraphBoundary,
): RuntimeDependencyGraphResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["runtime.dependencyGraph.rejected"],
  };
}

function normalizeNode(descriptor: RuntimeDependencyGraphNodeDescriptor): RuntimeDependencyGraphNode | RuntimeDependencyGraphError {
  if (isBlank(descriptor.nodeId)) {
    return {
      code: "MISSING_NODE_ID",
      message: "runtime dependency graph nodes require a nodeId",
      boundary: "input",
      safeForRuntimeInspection: true,
    };
  }

  if (descriptor.kind === undefined) {
    return {
      code: "MISSING_NODE_KIND",
      message: "runtime dependency graph nodes require an explicit kind",
      boundary: "input",
      safeForRuntimeInspection: true,
    };
  }

  return {
    nodeId: (descriptor.nodeId ?? "").trim(),
    kind: descriptor.kind,
    label: descriptor.label?.trim() || undefined,
    dependsOn: cleanList(descriptor.dependsOn),
    ready: descriptor.ready !== false,
    required: descriptor.required !== false,
  };
}

function toFailure(error: RuntimeDependencyGraphError): RuntimeDependencyGraphResult {
  return {
    ok: false,
    error,
    events: ["runtime.dependencyGraph.rejected"],
  };
}

function resolveEvaluationOrder(
  nodes: readonly RuntimeDependencyGraphNode[],
): readonly string[] | RuntimeDependencyGraphError {
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  const byNodeId = new Map(nodes.map((node) => [node.nodeId, node] as const));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  const visit = (nodeId: string, trail: readonly string[]): RuntimeDependencyGraphError | undefined => {
    if (visited.has(nodeId)) {
      return undefined;
    }

    if (visiting.has(nodeId)) {
      return {
        code: "CYCLIC_DEPENDENCY",
        message: `runtime dependency graph contains a cycle: ${[...trail, nodeId].join(" -> ")}`,
        boundary: "graph",
        safeForRuntimeInspection: true,
      };
    }

    const node = byNodeId.get(nodeId);
    if (node === undefined) {
      return {
        code: "UNKNOWN_DEPENDENCY",
        message: `runtime dependency graph references unknown dependency: ${nodeId}`,
        boundary: "graph",
        safeForRuntimeInspection: true,
      };
    }

    visiting.add(nodeId);
    for (const dependencyId of node.dependsOn) {
      if (!nodeIds.has(dependencyId)) {
        return {
          code: "UNKNOWN_DEPENDENCY",
          message: `runtime dependency graph references unknown dependency: ${dependencyId}`,
          boundary: "graph",
          safeForRuntimeInspection: true,
        };
      }

      if (dependencyId === nodeId) {
        return {
          code: "SELF_DEPENDENCY",
          message: `runtime dependency graph node ${nodeId} cannot depend on itself`,
          boundary: "graph",
          safeForRuntimeInspection: true,
        };
      }

      const dependencyError = visit(dependencyId, [...trail, nodeId]);
      if (dependencyError !== undefined) {
        return dependencyError;
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
    return undefined;
  };

  for (const node of nodes) {
    const error = visit(node.nodeId, []);
    if (error !== undefined) {
      return error;
    }
  }

  return order;
}

export function buildRuntimeDependencyGraph(
  request: RuntimeDependencyGraphRequest = {},
): RuntimeDependencyGraphResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime dependency graph requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime dependency graph requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime dependency graph was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime dependency graph was rejected by governance",
      "governance",
    );
  }

  if ((request.nodes ?? []).length === 0) {
    return failure("MISSING_GRAPH_INPUT", "runtime dependency graph requires at least one node", "input");
  }

  const seenNodeIds = new Set<string>();
  const nodes: RuntimeDependencyGraphNode[] = [];

  for (const descriptor of request.nodes ?? []) {
    const normalized = normalizeNode(descriptor);
    if ("code" in normalized) {
      return toFailure(normalized);
    }

    if (seenNodeIds.has(normalized.nodeId)) {
      return failure(
        "DUPLICATE_NODE_ID",
        `runtime dependency graph received duplicate nodeId: ${normalized.nodeId}`,
        "graph",
      );
    }

    seenNodeIds.add(normalized.nodeId);
    nodes.push(normalized);
  }

  const evaluationOrder = resolveEvaluationOrder(nodes);
  if ("code" in evaluationOrder) {
    return toFailure(evaluationOrder);
  }

  const edges = nodes.flatMap((node) =>
    node.dependsOn.map((dependencyId) => ({
      fromNodeId: node.nodeId,
      toNodeId: dependencyId,
    })),
  );
  const blockingIssues = nodes
    .filter((node) => node.required && !node.ready)
    .map((node) => ({ nodeId: node.nodeId, reason: `${node.nodeId} is required but not ready` }));

  return {
    ok: true,
    graph: {
      runtimeId: (request.runtimeId ?? "").trim(),
      graphSurface: "runtime.runtimeDependencyGraph",
      nodes,
      edges,
      evaluationOrder,
      blockingIssues,
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: [
      blockingIssues.length > 0 ? "runtime.dependencyGraph.blocked" : "runtime.dependencyGraph.ready",
    ],
  };
}
