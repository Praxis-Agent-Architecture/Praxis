import type { AgentManifest } from "@praxis-ai/praxis";

export const topology = {
  topologyId: "topology.raxode.dualAgent",
  status: "primary-plus-tui-auxiliary",
  agents: ["agent.raxode.coding", "agent.raxode.tui"],
  primaryAgent: "agent.raxode.coding",
  auxiliaryAgents: {
    tui: "agent.raxode.tui",
  },
  futureAgents: [],
} as const;

export type RaxodeMultiagentTopologyInspection = {
  readonly status: "ready" | "missing";
  readonly topologyId: typeof topology.topologyId;
  readonly primaryAgent: typeof topology.primaryAgent;
  readonly expectedAgents: readonly string[];
  readonly compiledAgents: readonly string[];
  readonly missingAgents: readonly string[];
  readonly auxiliaryAgents: readonly string[];
};

export function inspectRaxodeMultiagentTopology(input: {
  primaryManifest: AgentManifest;
  auxiliaryManifests?: readonly AgentManifest[];
}): RaxodeMultiagentTopologyInspection {
  const compiledAgents = [
    input.primaryManifest.identity.id,
    ...(input.auxiliaryManifests ?? []).map((manifest) => manifest.identity.id),
  ];
  const compiledAgentIds = new Set(compiledAgents);
  const missingAgents = topology.agents.filter((agentId) => !compiledAgentIds.has(agentId));
  const primaryReady = input.primaryManifest.identity.id === topology.primaryAgent;

  return {
    status: primaryReady && missingAgents.length === 0 ? "ready" : "missing",
    topologyId: topology.topologyId,
    primaryAgent: topology.primaryAgent,
    expectedAgents: topology.agents,
    compiledAgents,
    missingAgents: primaryReady ? missingAgents : [topology.primaryAgent, ...missingAgents],
    auxiliaryAgents: Object.values(topology.auxiliaryAgents),
  };
}
