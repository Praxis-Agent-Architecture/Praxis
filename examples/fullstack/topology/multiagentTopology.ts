export const multiagentTopologyContract = {
  topologyId: "topology.example.fullstack.singleAgentNow",
  status: "contract-only",
  primaryAgentRef: "agents/repoInspector",
  futureAgents: ["planner", "executor", "reviewer"],
  routing: "single-agent-until-multiagentCore-is-enabled",
} as const;
