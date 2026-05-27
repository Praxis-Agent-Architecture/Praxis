export const multiagentTopologyContract = {
  topologyId: "topology.example.fullstack.projectMeshReady",
  status: "contract-only",
  primaryAgentRef: "agents/repoInspector",
  meshScope: "project-local-session-mesh",
  suggestedAgents: ["planner", "executor", "reviewer"],
  routing: "single-agent-default-with-agentCore-mesh-tools",
} as const;
