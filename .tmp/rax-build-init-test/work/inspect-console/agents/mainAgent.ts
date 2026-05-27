import { praxis } from "@praxis-ai/praxis";

class MainPrompt extends praxis.PromptPack {
  promptPackId = "prompt.inspect-console.main";
  base = praxis.markdownFile("prompts/main.md", "prompt.main");
  patches = [
    praxis.append("prompt.main", praxis.markdownFile("prompts/rules.md", "prompt.rules")),
  ];
}

export default class InspectConsoleAgent extends praxis.AgentArchetype {
  identity = { id: "agent.inspect-console", version: "0.1.0" };
  model = praxis.model("gpt-5.4");
  promptPack = new MainPrompt();
  mainLoop = praxis.mainLoop.standard({
    buildPromptRef: "mainLoop.prompt.default",
    chooseModelRef: "mainLoop.model.primary",
    beforeToolRef: "mainLoop.tool.before",
    afterToolRef: "mainLoop.tool.after",
    onApprovalRef: "mainLoop.approval.route",
    onErrorRef: "mainLoop.error.report",
    onResumeRef: "mainLoop.resume.session",
  });
  sandbox = praxis.sandbox.hostObserved();
  toolPolicy = praxis.toolPolicies.standard();
  storage = praxis.storage.raxWorkspace();
  session = praxis.session({ persistence: "memory", resume: "auto", thread: "durable", logs: "full" });
  statePlane = praxis.statePlane({
    expose: ["phase", "lastAction", "toolCalls", "errors", "approvals"],
    control: ["pause", "resume", "interrupt", "approve", "deny", "rollback", "inspect", "repair"],
    audit: "full",
  });
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.basetool.core.fileRead({ profileName: "codingCore" }),
      praxis.basetool.core.fileSearch({ profileName: "codingCore" }),
    ]),
    loop: praxis.loop.standard({ maxModelTurns: 4, maxToolCalls: 8 }),
    policy: praxis.policy({ allowProviderCall: true, allowToolExecution: true }),
  });
}
