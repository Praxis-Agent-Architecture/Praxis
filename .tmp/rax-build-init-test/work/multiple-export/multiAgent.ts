import { praxis } from "../../../../src/agentCore/index.js";
class Base extends praxis.Agent {
  identity = "agent.multi.base";
  model = praxis.model("gpt-5.4");
  harness = praxis.harness({ loop: praxis.loop.single() });
}
export class FirstAgent extends Base {}
export class SecondAgent extends Base { identity = "agent.multi.second"; }
