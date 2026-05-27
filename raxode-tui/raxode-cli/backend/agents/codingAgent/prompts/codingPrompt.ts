import { praxis } from "@praxis-ai/praxis";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const promptRoot = dirname(fileURLToPath(import.meta.url));

function promptFile(name: string, ref: string) {
  return praxis.prompt.markdownFile(resolve(promptRoot, name), ref);
}

export class RaxodeCodingPrompt extends praxis.PromptPack {
  promptPackId = "prompt.raxode.coding";
  metadata: {
    purpose: string;
    promptPackageRoot: string;
    providerPayloadBuiltHere: boolean;
    agentRole: string;
    applicationInstructions: string;
    memoryPromptGuide: boolean;
  };

  constructor(options: { memoryPromptGuide?: string } = {}) {
    super();
    const baseApplicationInstructions = "Operate as the Raxode/Praxis coding backend. Keep product-specific behavior in declared runtime context, and rely on Praxis stableSystemCore for universal discipline.";
    const memoryPromptGuide = options.memoryPromptGuide?.trim();
    this.metadata = {
      purpose: "raxode-coding-application-backend",
      promptPackageRoot: promptRoot,
      providerPayloadBuiltHere: false,
      agentRole: "full-capability coding backend for the Praxis TUI harness",
      applicationInstructions: [
        baseApplicationInstructions,
        memoryPromptGuide === undefined || memoryPromptGuide.length === 0
          ? undefined
          : `Praxis memory guide:\n${memoryPromptGuide}`,
      ].filter((line): line is string => line !== undefined).join("\n\n"),
      memoryPromptGuide: memoryPromptGuide !== undefined && memoryPromptGuide.length > 0,
    };
  }

  inherits = ["prompt.praxis.defaultReviewer", "prompt.praxis.runtimeVerifier"];

  sceneTriggers = [
    "coding.work",
    "workspace.inspect",
    "tool.use",
    "application.tui",
  ];

  auditRefs = ["audit.raxode.coding.v1"];

  patches = [
    praxis.prompt.prepend("runtime.declaredRuntimeContext", promptFile("main.md", "raxode.main"), {
      patchId: "raxode.patch.main.prepend",
    }),
    praxis.prompt.prepend("raxode.main", promptFile("evidence.md", "raxode.evidence"), {
      patchId: "raxode.patch.evidence.prepend",
    }),
    praxis.prompt.append("raxode.main", promptFile("tool-use.md", "raxode.toolUse"), {
      patchId: "raxode.patch.toolUse.append",
    }),
    praxis.prompt.append("raxode.main", promptFile("rules.md", "raxode.rules"), {
      patchId: "raxode.patch.rules.append",
    }),
    praxis.prompt.replaceLastLines("raxode.main", 1, promptFile("output-tail.md", "raxode.outputTail"), {
      patchId: "raxode.patch.outputTail.replaceLastLines",
    }),
  ];

  materials = [
    `promptPackage:${promptRoot}`,
    "raxode.main",
    "raxode.evidence",
    "raxode.toolUse",
    "raxode.rules",
    "raxode.outputTail",
  ];

}
