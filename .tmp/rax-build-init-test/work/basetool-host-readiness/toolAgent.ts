import { praxis } from "../../../../src/agentCore/index.js";
export class ToolAgent extends praxis.Agent {
  identity = "agent.basetool-host-readiness";
  model = praxis.model("gpt-5.5");
  storage = praxis.storage.memory();
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.baseTools.code.read(),
      praxis.baseTools.code.searchRipgrep(),
      praxis.baseTools.git.getRepositoryStatus(),
      praxis.baseTools.skill.ripgrep(),
    ]),
    loop: praxis.loop.single(),
  });
}
