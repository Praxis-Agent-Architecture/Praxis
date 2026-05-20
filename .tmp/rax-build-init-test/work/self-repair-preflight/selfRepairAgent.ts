import { praxis } from "../../../../src/agentCore/index.js";
export class SelfRepairAgent extends praxis.Agent {
  identity = "agent.self-repair-preflight";
  model = praxis.model("gpt-5.4");
  storage = praxis.storage.memory();
  sandbox = praxis.sandbox.rootlessContainer();
  harness = praxis.harness({ loop: praxis.loop.single() });
}
