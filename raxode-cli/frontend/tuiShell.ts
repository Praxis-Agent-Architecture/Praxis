/*
 * 文件定位：raxode-cli / 前端 TUI 壳。
 * 核心目的：只渲染 application contract view model，便于 UI fork 独立美化。
 * 边界：不导入 agentCore，不解析 agent 文件，不执行 runtime。
 */

import { Box, Text, render } from "ink";
import React from "react";

import type { RaxodeApplicationViewModel } from "../contracts.js";

const h = React.createElement;

function toneForStatus(status: RaxodeApplicationViewModel["status"]): "green" | "red" {
  return status === "completed" ? "green" : "red";
}

export function RaxodeApplicationTui(props: { view: RaxodeApplicationViewModel }): React.ReactElement {
  const { view } = props;
  return h(
    Box,
    { flexDirection: "column", paddingX: 1, paddingY: 1 },
    h(
      Box,
      { borderStyle: "round", borderColor: "cyan", flexDirection: "column", paddingX: 1, paddingY: 1 },
      h(Box, { justifyContent: "space-between" },
        h(Text, { color: "cyan" }, view.title),
        h(Text, { color: toneForStatus(view.status) }, view.status),
      ),
      h(Text, { color: "gray" }, view.subtitle),
      h(Text, null, `profile=${view.backendCapability.profile}  mode=${view.mode}  model=${view.model}`),
    ),
    h(
      Box,
      { marginTop: 1, borderStyle: "single", borderColor: "gray", flexDirection: "column", paddingX: 1 },
      h(Text, { color: "yellow" }, "Runtime"),
      h(Text, null, `agent   ${view.agentId}`),
      h(Text, null, `runtime ${view.runtimeId}`),
      h(Text, null, `session ${view.sessionId}`),
    ),
    h(
      Box,
      { marginTop: 1, borderStyle: "single", borderColor: "gray", flexDirection: "column", paddingX: 1 },
      h(Text, { color: "yellow" }, "Counters"),
      h(Text, null, `envelopes=${view.counters.envelopes} modelCalls=${view.counters.modelCalls} toolCalls=${view.counters.toolCalls}`),
      h(Text, null, `steps=${view.counters.mainLoopSteps} runtimeEvents=${view.counters.runtimeEvents}`),
      h(Text, null, `tools=${view.counters.mountedTools}/${view.counters.catalogTools}`),
      h(Text, { color: "gray" }, `families=${view.backendCapability.toolCatalog.selectedFamilies.join(", ")}`),
    ),
    h(
      Box,
      { marginTop: 1, borderStyle: "single", borderColor: view.status === "completed" ? "green" : "red", flexDirection: "column", paddingX: 1 },
      h(Text, { color: view.status === "completed" ? "green" : "red" }, view.status === "completed" ? "Final Output" : "Error"),
      h(Text, null, view.finalOutput ?? `${view.error?.code ?? "UNKNOWN"} ${view.error?.message ?? ""}`.trim()),
    ),
  );
}

export function renderRaxodeApplicationTui(view: RaxodeApplicationViewModel): { unmount: () => void } {
  const instance = render(h(RaxodeApplicationTui, { view }));
  return { unmount: () => instance.unmount() };
}
