import { praxis } from "../../../../src/agentCore/index.js";
export class ToolAgent extends praxis.Agent {
  identity = "agent.basetool-host-readiness";
  model = praxis.model("gpt-5.5");
  storage = praxis.storage.memory();
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.basetool.core.fileRead({ profileName: "codingCore" }),
      praxis.basetool.core.fileSearch({ profileName: "codingCore" }),
      praxis.basetool.core.webFetch({ profileName: "codingCore" }),
      praxis.basetool.extension.skillLoad({ profileName: "codingCore" }),
    ]),
    loop: praxis.loop.single(),
  });
}
