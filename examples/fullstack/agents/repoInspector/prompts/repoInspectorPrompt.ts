import { praxis } from "@praxis-ai/praxis";

const repoInspectorPromptPackageRoot = "examples/fullstack/agents/repoInspector/prompts/repo-inspector";

function promptPackageFile(name: string, ref: string) {
  return praxis.prompt.markdownFile(`${repoInspectorPromptPackageRoot}/${name}`, ref);
}

export class RepoInspectorPrompt extends praxis.PromptPack {
  promptPackId = "prompt.example.repoInspector";

  base = promptPackageFile("base.md", "repoInspector.base");

  inherits = ["prompt.praxis.defaultReviewer"];

  sceneTriggers = ["repo.quick.audit", "repo.deep.audit", "tool.failure.summary"];

  auditRefs = ["audit.prompt.repoInspector.v1"];

  patches = [
    praxis.prompt.prepend(
      "repoInspector.base",
      promptPackageFile("evidence-rule.md", "repoInspector.evidenceRule"),
    ),
    praxis.prompt.append(
      "repoInspector.base",
      promptPackageFile("tool-rules.md", "repoInspector.toolRules"),
    ),
    praxis.prompt.overwrite(
      "repoInspector.mode",
      promptPackageFile("mode-policy.md", "repoInspector.modePolicy"),
      { sceneTrigger: "repo.deep.audit" },
    ),
    praxis.prompt.replaceLastLines(
      "repoInspector.base",
      2,
      promptPackageFile("output-tail.md", "repoInspector.tailFile"),
      { sceneTrigger: "tool.failure.summary" },
    ),
  ];

  stateMachineMutations = [
    praxis.prompt.append(
      "repoInspector.base",
      promptPackageFile("approval-state.md", "repoInspector.approvalStateRule"),
      { stateTrigger: "waitingApproval" },
    ),
    praxis.prompt.append(
      "repoInspector.base",
      praxis.prompt.markdown("如果检测到 prompt package 缺失，必须把它当成工程缺陷报告，而不是静默忽略。", "repoInspector.promptPackageMissingRule"),
      { stateTrigger: "promptPackageMissing" },
    ),
  ];

  materials = [
    `promptPackage:${repoInspectorPromptPackageRoot}`,
    "repoInspector.base",
    "repoInspector.evidenceRule",
    "repoInspector.toolRules",
    "repoInspector.modePolicy",
    "repoInspector.approvalStateRule",
    "repoInspector.promptPackageMissingRule",
  ];

  designOwner = "archetype" as const;

  metadata = {
    purpose: "example-fullstack-prompt-package",
    promptPackageRoot: repoInspectorPromptPackageRoot,
    promptPackageManifest: `${repoInspectorPromptPackageRoot}/prompt-package.json`,
    providerPayloadBuiltHere: false,
  };
}
