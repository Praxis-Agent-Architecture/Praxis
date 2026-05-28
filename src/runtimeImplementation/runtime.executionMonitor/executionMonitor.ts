/*
 * 文件定位：Agent 运行态实现层 / execution monitor 入口类。
 * 核心目的：提供可增量 observe 的 Monitor 类，并复用纯分析器生成完整诊断报告。
 * 边界：只诊断缓存、成本和健康事实；不执行自动修复。
 */

import type { PraxisApplicationEvent, PraxisApplicationViewModel } from "../../applicationLayer/applicationContract.js";
import {
  analyzeExecutionMonitor,
  DEFAULT_EXECUTION_MONITOR_THRESHOLDS,
  type AnalyzeExecutionMonitorInput,
} from "./executionMonitorAnalyzer.js";
import type {
  ExecutionMonitorObserveInput,
  ExecutionMonitorReport,
  ExecutionMonitorThresholds,
} from "./executionMonitorTypes.js";

export type ExecutionMonitorOptions = {
  runDir?: string;
  profileName?: string;
  project?: string;
  thresholds?: Partial<ExecutionMonitorThresholds>;
  now?: () => string;
};

export class ExecutionMonitor {
  readonly runDir?: string;
  readonly profileName?: string;
  readonly project?: string;
  readonly thresholds: ExecutionMonitorThresholds;

  #events: PraxisApplicationEvent[] = [];
  #views: PraxisApplicationViewModel[] = [];
  #now: () => string;

  constructor(options: ExecutionMonitorOptions = {}) {
    this.runDir = options.runDir;
    this.profileName = options.profileName;
    this.project = options.project;
    this.thresholds = { ...DEFAULT_EXECUTION_MONITOR_THRESHOLDS, ...options.thresholds };
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  observe(input: ExecutionMonitorObserveInput): void {
    if (input.event !== undefined) this.observeEvent(input.event);
    if (input.view !== undefined) this.observeView(input.view);
  }

  observeEvent(event: PraxisApplicationEvent): void {
    this.#events.push(event);
  }

  observeEvents(events: readonly PraxisApplicationEvent[]): void {
    this.#events.push(...events);
  }

  observeView(view: PraxisApplicationViewModel): void {
    this.#views.push(view);
  }

  observeViews(views: readonly PraxisApplicationViewModel[]): void {
    this.#views.push(...views);
  }

  analyze(overrides: Partial<AnalyzeExecutionMonitorInput> = {}): ExecutionMonitorReport {
    return analyzeExecutionMonitor({
      events: this.#events,
      views: this.#views,
      generatedAt: this.#now(),
      runDir: this.runDir,
      profileName: this.profileName,
      project: this.project,
      thresholds: this.thresholds,
      ...overrides,
    });
  }
}
