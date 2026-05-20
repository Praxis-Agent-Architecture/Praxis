import { praxis } from "@praxis-ai/praxis";
import type { SandboxSpec } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "../config/repoInspectorOptions.js";

export function createRepoInspectorSandbox(options: NormalizedRepoInspectorOptions): SandboxSpec {
  const resourceLimits = {
    timeoutMs: options.mode === "deep" ? 60_000 : 20_000,
    maxOutputBytes: options.mode === "deep" ? 256_000 : 64_000,
  };

  if (options.sandboxProfile === "workspaceOnly") {
    return praxis.sandbox.workspaceOnly({ resourceLimits });
  }

  if (options.sandboxProfile === "linuxBubblewrap") {
    return praxis.sandbox.linuxBubblewrap({
      filesystem: "workspace-only",
      network: "deny-by-default",
      shell: "approval-for-write",
      resourceLimits,
    });
  }

  return praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
    resourceLimits,
  });
}
