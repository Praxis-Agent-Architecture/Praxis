import { praxis } from "../../../../src/agentCore/index.js";
export class AllToolAgent extends praxis.Agent {
  identity = "agent.all-testable-readiness";
  model = praxis.model("gpt-5.5");
  storage = praxis.storage.memory();
  harness = praxis.harness({
    tools: praxis.tools([praxis.baseTools.code.read()]),
    loop: praxis.loop.single(),
  });
}
