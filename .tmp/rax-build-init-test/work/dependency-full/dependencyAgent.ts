import { praxis } from "../../../../src/agentCore/index.js";
export class DependencyAgent extends praxis.Agent {
  identity = "agent.core-dependency-full";
  model = praxis.model("gpt-5.5");
  storage = praxis.storage.memory();
  harness = praxis.harness({
    tools: praxis.tools([praxis.basetool.core.fileSearch({ profileName: "codingCore" })]),
    loop: praxis.loop.single(),
  });
}
