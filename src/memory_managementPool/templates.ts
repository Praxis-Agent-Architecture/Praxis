import type { MemoryLayout } from "./types.js";

export function longTermMemoryTemplate(layout: MemoryLayout): string {
  const title = layout.scope === "global" ? "Global Memory" : "Project Memory";
  return `# ${title}

## Stable Facts

## Decisions

## Preferences

## References
`;
}

export function dailyMemoryTemplate(date: string): string {
  return `# Daily Memory ${date}

## Notes
`;
}
