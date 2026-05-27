import type { PraxisApplicationAuthProfileView, PraxisApplicationAuthState } from "@praxis-ai/praxis/application-layer";

import {
  loadResolvedRoleConfig,
  type RaxodeResolvedRoleConfig,
  type RaxodeRoleId,
} from "../../frontend/tui/config/raxode-config.js";

function authProfileStatus(config: RaxodeResolvedRoleConfig): "active" | "expired" | "missing" {
  if (config.authProfile.authMode === "chatgpt_oauth") {
    const expiresAt = config.authProfile.meta.accessTokenExpiresAt;
    if (expiresAt !== undefined && new Date(expiresAt).getTime() <= Date.now()) return "expired";
    return config.authProfile.credentials.accessToken ? "active" : "missing";
  }
  return config.authProfile.credentials.apiKey ? "active" : "missing";
}

export function createRaxodeAuthStateProvider(input: {
  startDir: string;
  roleIds?: readonly RaxodeRoleId[];
  now?: () => string;
}) {
  const roleIds = input.roleIds ?? ["core.main", "tui.main"];
  return ({ sessionId, runtimeId }: { sessionId: string; runtimeId: string }): PraxisApplicationAuthState => {
    const profiles: PraxisApplicationAuthProfileView[] = [];
    let activeProfileId: string | undefined;
    for (const roleId of roleIds) {
      try {
        const resolved = loadResolvedRoleConfig(roleId, input.startDir);
        if (roleId === "core.main") activeProfileId = resolved.authProfile.id;
        profiles.push({
          profileId: resolved.authProfile.id,
          provider: resolved.profile.provider,
          providerLabel: resolved.profile.label,
          endpointShape: resolved.profile.route.apiStyle,
          baseURL: resolved.profile.route.baseURL,
          credentialRefId: `${resolved.authProfile.authMode}:${resolved.authProfile.id}`,
          secretPresent: authProfileStatus(resolved) === "active",
          expiresAt: resolved.authProfile.meta.accessTokenExpiresAt,
          status: authProfileStatus(resolved),
          publicSafe: true,
        });
      } catch {
        profiles.push({
          profileId: `missing.${roleId}`,
          provider: "unknown",
          providerLabel: roleId,
          secretPresent: false,
          status: "missing",
          publicSafe: true,
        });
      }
    }
    return {
      defaultRole: "core.main",
      activeProfileId,
      profiles,
      lastAuditEventKind: `raxode.auth.state:${sessionId}:${runtimeId}`,
      lastAuditAt: input.now?.() ?? new Date().toISOString(),
      publicSafe: true,
    };
  };
}
