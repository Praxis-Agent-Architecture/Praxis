import { praxis } from "../../../../src/agentCore/index.js";
export class HelperPrompt extends praxis.PromptPack {}
export class NamedAgent extends praxis.Agent {
  identity = "agent.named-export";
  model = praxis.model("gpt-5.4");
  harness = praxis.harness({ loop: praxis.loop.single() });
}
