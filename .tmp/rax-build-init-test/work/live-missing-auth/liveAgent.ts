import { praxis } from "../../../../src/agentCore/index.js";
export class LiveAgent extends praxis.Agent {
  identity = "agent.live-missing-auth";
  model = praxis.model("gpt-5.4");
  storage = praxis.storage.memory();
  harness = praxis.harness({ loop: praxis.loop.single() });
}
