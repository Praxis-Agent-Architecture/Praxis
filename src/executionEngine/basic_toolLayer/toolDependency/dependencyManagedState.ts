/*
 * 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / dependencyManagedState。
 * 核心目的：兼容旧 managed dependency state 读取入口。
 * 能力要求1：读取 runtime.dependencyPlane 的 public-safe state record。
 * 能力要求2：不写 secret、不隐式创建目录。
 * 边界：真实写入由 runtime.dependencyPlane installer/state API 负责。
 * 对接：runtime.dependencyPlane.dependencyManagedState。
 * 实现提示：保持旧函数名。
 */

export {
  readManagedDependencyRecord,
} from "../../../runtimeImplementation/runtime.dependencyPlane/index.js";
