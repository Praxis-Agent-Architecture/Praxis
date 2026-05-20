import { praxis } from "../../../../src/agentCore/index.js";
export class LspAgent extends praxis.Agent {
  identity = "agent.lsp-dependency-full";
  model = praxis.model("gpt-5.5");
  storage = praxis.storage.memory();
  harness = praxis.harness({
    tools: praxis.tools([praxis.tool("code.lsp_locateDefinition")]),
    loop: praxis.loop.single(),
  });
}
