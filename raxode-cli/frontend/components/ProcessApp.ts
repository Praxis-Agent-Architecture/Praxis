import { Box, Text, useApp, useInput } from "ink";
import React, { useEffect, useMemo, useState } from "react";

import type { RaxodeApplicationAttachment, RaxodeApplicationViewModel } from "../../contracts.js";
import { createProcessApplicationClient, type RaxodeApplicationClient } from "../bridge/applicationClient.js";
import { extractComposerAttachments, extractPastedFileAttachments } from "../state/composerAttachments.js";
import { buildRaxodeSlashPanel, type RaxodeSlashPanel as RaxodeSlashPanelModel } from "../state/slashPanels.js";
import { resolveRaxodeSlashCommand } from "../state/slashCommands.js";
import { loadWorkspaceIndex, type WorkspaceIndexSnapshot } from "../state/workspaceIndex.js";
import { enableTerminalMouseReporting, parseMouseScrollDelta } from "../tui-input/mouse.js";
import { RaxodeComposer } from "./Composer.js";
import { RaxodeShell } from "./Shell.js";
import { RaxodeSlashPanel } from "./SlashPanel.js";

const h = React.createElement;

function mergeAttachments(...groups: readonly (readonly RaxodeApplicationAttachment[])[]): readonly RaxodeApplicationAttachment[] {
  const seen = new Set<string>();
  const merged: RaxodeApplicationAttachment[] = [];
  for (const group of groups) {
    for (const attachment of group) {
      const key = attachment.localPath ?? attachment.remoteUrl ?? attachment.id;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(attachment);
    }
  }
  return merged;
}

export function RaxodeProcessApp(): React.ReactElement {
  const { exit } = useApp();
  const client = useMemo<RaxodeApplicationClient>(() => createProcessApplicationClient(), []);
  const [view, setView] = useState<RaxodeApplicationViewModel | null>(null);
  const [activePanel, setActivePanel] = useState<RaxodeSlashPanelModel | null>(null);
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndexSnapshot | null>(null);
  const [panelScrollOffset, setPanelScrollOffset] = useState(0);
  const [selectedPanelActionIndex, setSelectedPanelActionIndex] = useState(0);
  const [composerPrefill, setComposerPrefill] = useState<{ nonce: number; value: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void client.ready
      .then((readyView) => {
        if (mounted) setView(readyView);
      })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : String(caught));
      });
    const unsubscribe = client.subscribe(() => {
      void client.getView().then((nextView) => {
        if (mounted) setView(nextView);
      });
    });
    return () => {
      mounted = false;
      unsubscribe();
      void client.close();
    };
  }, [client]);

  useEffect(() => enableTerminalMouseReporting(process.stdout), []);

  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    void loadWorkspaceIndex(view.workspaceRoot)
      .then((snapshot) => {
        if (!cancelled) setWorkspaceIndex(snapshot);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceIndex(null);
      });
    return () => {
      cancelled = true;
    };
  }, [view?.workspaceRoot]);

  useInput((input, key) => {
    if (activePanel?.actions && activePanel.actions.length > 0) {
      if (key.upArrow || input === "k") {
        setSelectedPanelActionIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedPanelActionIndex((current) => Math.min(activePanel.actions!.length - 1, current + 1));
        return;
      }
      if (key.return) {
        const action = activePanel.actions[selectedPanelActionIndex];
        if (!action) return;
        setActivePanel(null);
        if (action.prefill) {
          setComposerPrefill((current) => ({
            nonce: (current?.nonce ?? 0) + 1,
            value: action.prefill ?? "",
          }));
          return;
        }
        if (!action.command) return;
        setBusy(true);
        void client.dispatch(action.command)
          .then((result) => setView(result.view))
          .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
          .finally(() => setBusy(false));
        return;
      }
    }
    const delta = parseMouseScrollDelta(input);
    if (delta === null || !activePanel) return;
    setPanelScrollOffset((current) =>
      Math.max(0, Math.min(Math.max(0, activePanel.lines.length + (activePanel.actions?.length ?? 0) - 1), current + delta)));
  });

  const submit = (value: string, composerAttachments: readonly RaxodeApplicationAttachment[] = []) => {
    if (value === "/exit" || value === "/quit") {
      void client.close().finally(() => exit());
      return;
    }
    if (view) {
      const panel = buildRaxodeSlashPanel(value, view, workspaceIndex);
      if (panel) {
        setActivePanel(panel);
        setPanelScrollOffset(0);
        setSelectedPanelActionIndex(0);
        return;
      }
    }
    const slashCommand = resolveRaxodeSlashCommand(value, {
      cwd: view?.workspaceRoot ?? process.cwd(),
      workspaceIndex,
    });
    setActivePanel(null);
    setBusy(true);
    void client.dispatch(slashCommand ?? {
      type: "application.submitTurn",
      mode: "dry-run",
      input: {
        type: "application.input",
        text: value,
        attachments: mergeAttachments(
          composerAttachments,
          extractComposerAttachments(value, process.cwd()),
          extractPastedFileAttachments(value, process.cwd()),
        ),
        cwd: process.cwd(),
      },
    })
      .then((result) => setView(result.view))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setBusy(false));
  };

  if (error) {
    return h(Box, { flexDirection: "column" }, h(Text, { color: "red" }, error));
  }

  if (!view) {
    return h(Box, null, h(Text, { color: "gray" }, "Starting Raxode..."));
  }

  return h(
    Box,
    { flexDirection: "column" },
    h(RaxodeShell, { view }),
    activePanel ? h(RaxodeSlashPanel, {
      panel: activePanel,
      scrollOffset: panelScrollOffset,
      selectedActionIndex: selectedPanelActionIndex,
    }) : null,
    h(RaxodeComposer, {
      disabled: busy,
      placeholder: busy
        ? "Raxode is working..."
        : "Drag to select text, Ctrl+V to paste images, @ to choose files, / to choose commands",
      sessionId: view.sessionId,
      prefill: composerPrefill,
      onSubmit: submit,
    }),
  );
}
