import { praxis } from "@praxis-ai/praxis";
import type { StatePlaneSpec } from "@praxis-ai/praxis";

export function createRepoInspectorStatePlane(): StatePlaneSpec {
  return praxis.statePlane({
    expose: ["phase", "lastAction", "toolCalls", "errors", "approvals"],
    control: ["pause", "resume", "interrupt", "approve", "deny", "rollback", "inspect", "repair", "configure"],
    audit: "full",
  });
}
