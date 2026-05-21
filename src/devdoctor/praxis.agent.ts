import { praxis } from "@praxis-ai/praxis";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOCTOR_ROOT = path.dirname(fileURLToPath(import.meta.url));

class DoctorPrompt extends praxis.PromptPack {
  promptPackId = "prompt.praxis.doctor";
  base = praxis.prompt.markdownFile(path.join(DOCTOR_ROOT, "prompts/base.md"), "doctor.base");
  patches = [
    praxis.prompt.append("doctor.base", praxis.prompt.markdownFile(path.join(DOCTOR_ROOT, "prompts/evidence.md"), "doctor.evidence")),
  ];
}

export class PraxisDoctorAgent extends praxis.Agent {
  identity = {
    id: "agent.praxis.doctor",
    name: "Praxis Doctor Agent",
    version: "0.1.0",
    description: "Built-in diagnostic agent for applicationLayer compatibility checks.",
  };

  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.praxis.doctor",
  });

  promptPack = new DoctorPrompt();
  sandbox = praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
  });
  toolPolicy = praxis.toolPolicies.standard({
    matrixId: "toolPolicy.praxis.doctor.standard",
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.baseTools.code.read(),
      praxis.baseTools.code.searchRipgrep(),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "promptPack.define", "tool.execute"],
    }),
    loop: praxis.loop.standard({
      maxModelTurns: 2,
      maxToolCalls: 2,
    }),
  });
}

export default PraxisDoctorAgent;
