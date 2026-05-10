import type { AgentIdentity } from "@praxis-ai/framework";

export function createRaxodeTuiIdentity(): AgentIdentity {
  return {
    id: "agent.raxode.tui",
    name: "Raxode TUI Agent",
    version: "0.1.0",
    description: "A structured-output UI assistant for Raxode terminal presentation tasks.",
  };
}
