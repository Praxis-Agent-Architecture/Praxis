/*
 * 文件定位：Agent 接口适配层 / 自定义接口层。
 * 核心目的：承载 custom Interface Manager 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：定义接口接入方式，不实现 CMP/MP/TAP/multiagent 的内部策略。
 * 对接：需要被 runtime.interfaceAdapter 拉起，并服务官方模块和自定义接口进入 agentCore。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  type CustomInterfaceDefinition,
  type CustomInterfaceError,
  type CustomInterfaceGate,
} from "./customInterfaceDefiner.js";

export type CustomInterfaceManagerErrorCode =
  | CustomInterfaceError["code"]
  | "DUPLICATE_INTERFACE"
  | "INTERFACE_NOT_FOUND"
  | "INTERFACE_DISABLED";

export type ManagedCustomInterfaceStatus = "registered" | "disabled";

export type CustomInterfaceManagerError = Omit<CustomInterfaceError, "code"> & {
  code: CustomInterfaceManagerErrorCode;
};

export type CustomInterfaceManagerDescriptor = {
  definition: CustomInterfaceDefinition;
  status?: ManagedCustomInterfaceStatus;
};

export type ManagedCustomInterface = CustomInterfaceDefinition & {
  status: ManagedCustomInterfaceStatus;
};

export type CustomInterfaceResolveResult =
  | {
      ok: true;
      interface: ManagedCustomInterface;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomInterfaceManagerError;
      events: readonly string[];
    };

export type CustomInterfaceManager = {
  interfaces: readonly ManagedCustomInterface[];
  list: () => readonly ManagedCustomInterface[];
  has: (interfaceId: string) => boolean;
  resolve: (interfaceId: string) => CustomInterfaceResolveResult;
};

export type CustomInterfaceManagerRequest = {
  interfaces?: readonly CustomInterfaceManagerDescriptor[];
  contract?: CustomInterfaceGate;
  governance?: CustomInterfaceGate;
};

export type CustomInterfaceManagerResult =
  | {
      ok: true;
      manager: CustomInterfaceManager;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomInterfaceManagerError;
      events: readonly string[];
    };

function managerFailure(
  code: CustomInterfaceManagerErrorCode,
  message: string,
  boundary: CustomInterfaceManagerError["boundary"],
): CustomInterfaceManagerResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["custom.interface.manager.rejected"],
  };
}

function resolveFailure(
  code: CustomInterfaceManagerErrorCode,
  message: string,
  boundary: CustomInterfaceManagerError["boundary"],
): CustomInterfaceResolveResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["custom.interface.resolve.rejected"],
  };
}

export function createCustomInterfaceManager(
  request: CustomInterfaceManagerRequest = {},
): CustomInterfaceManagerResult {
  if (request.contract?.accepted === false) {
    return managerFailure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "contract rejected custom interface manager creation",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return managerFailure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "governance rejected custom interface manager creation",
      "governance",
    );
  }

  const interfaces: ManagedCustomInterface[] = [];
  const seen = new Set<string>();

  for (const descriptor of request.interfaces ?? []) {
    const interfaceId = descriptor.definition.interfaceId;
    if (seen.has(interfaceId)) {
      return managerFailure(
        "DUPLICATE_INTERFACE",
        `custom interface ${interfaceId} is registered more than once`,
        "input",
      );
    }

    seen.add(interfaceId);
    interfaces.push({
      ...descriptor.definition,
      status: descriptor.status ?? "registered",
    });
  }

  const interfaceSnapshot: readonly ManagedCustomInterface[] = Object.freeze([...interfaces]);

  const manager: CustomInterfaceManager = {
    interfaces: interfaceSnapshot,
    list(): readonly ManagedCustomInterface[] {
      return interfaceSnapshot;
    },
    has(interfaceId: string): boolean {
      const normalized = interfaceId.trim();
      return interfaces.some((candidate) => candidate.interfaceId === normalized);
    },
    resolve(interfaceId: string): CustomInterfaceResolveResult {
      const normalized = interfaceId.trim();
      if (normalized.length === 0) {
        return resolveFailure("MISSING_INTERFACE_ID", "custom interface resolve requires an interfaceId", "input");
      }

      const match = interfaces.find((candidate) => candidate.interfaceId === normalized);
      if (match === undefined) {
        return resolveFailure("INTERFACE_NOT_FOUND", `custom interface ${normalized} is not registered`, "input");
      }

      if (match.status === "disabled") {
        return resolveFailure("INTERFACE_DISABLED", `custom interface ${normalized} is disabled`, "governance");
      }

      return {
        ok: true,
        interface: match,
        events: ["custom.interface.resolved"],
      };
    },
  };

  return {
    ok: true,
    manager,
    events: ["custom.interface.manager.ready"],
  };
}
