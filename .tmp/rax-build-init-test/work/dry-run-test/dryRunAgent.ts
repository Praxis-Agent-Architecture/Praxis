import { praxis } from "../../../../src/agentCore/index.js";
export class DryRunAgent extends praxis.Agent {
  identity = "agent.dry-run-test";
  model = praxis.model("gpt-5.4");
  storage = praxis.storage.memory();
  harness = praxis.harness({ loop: praxis.loop.single() });
}
