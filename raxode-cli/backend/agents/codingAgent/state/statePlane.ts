import { praxis } from "@praxis-ai/framework";
import type { StatePlaneSpec } from "@praxis-ai/framework";

export function createRaxodeStatePlane(): StatePlaneSpec {
  return praxis.statePlane({
    expose: [
      "phase",
      "lastAction",
      "toolCalls",
      "errors",
      "approvals",
      "storage",
      "provider",
      "sandbox",
      "capabilityReadiness",
      "workspace",
      "model",
      "permissionProfile",
    ],
    control: [
      "pause",
      "resume",
      "interrupt",
      "approve",
      "deny",
      "rollback",
      "inspect",
      "repair",
      "configure",
      "switchWorkspace",
      "changeModel",
      "changePermissionProfile",
    ],
    audit: "full",
  });
}

