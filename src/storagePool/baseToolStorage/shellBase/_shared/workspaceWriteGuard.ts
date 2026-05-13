const FILE_WRITE_REDIRECTION_PATTERN = /(?:^|[\s;|&])(?:>|>>|1>|1>>)\s*(?!&|\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const CAT_WRITE_PATTERN = /(?:^|[\s;|&])cat\s+>\s*(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const CAT_HEREDOC_WRITE_PATTERN = /(?:^|[\s;|&])cat\b[^;&|]*<<[^;&|]*>\s*(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const TEE_WRITE_PATTERN = /(?:^|[\s;|&])tee\s+(?:-[a-zA-Z]*a[a-zA-Z]*\s+)?(?!\/dev\/null(?:\s|$))(['"]?)([^'"\s;&|]+)\1/u;
const PROGRAMMATIC_FILE_WRITE_PATTERN =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|write_text|openSync\s*\([^)]*['"]w|open\s*\([^)]*['"]w)\b/u;
const PROGRAMMATIC_FILE_WRITE_TARGET_PATTERN =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|write_text|openSync|open)\s*\(\s*['"]([^'"]+)['"]/u;

function compactShellSource(source: string): string {
  return source.replace(/\\\r?\n/gu, " ").replace(/\s+/gu, " ").trim();
}

function isAllowedTemporaryWriteTarget(target: string | undefined): boolean {
  if (target === undefined) {
    return false;
  }
  return target === "/dev/null"
    || target.startsWith("/tmp/")
    || target.startsWith("/var/tmp/")
    || target.startsWith("/run/user/");
}

function matchWorkspaceWriteTarget(pattern: RegExp, source: string): string | undefined {
  const match = pattern.exec(source);
  if (match === null) {
    return undefined;
  }
  const target = match[2];
  return isAllowedTemporaryWriteTarget(target) ? undefined : target;
}

export function describeShellWorkspaceWrite(source: string): string | undefined {
  const compacted = compactShellSource(source);
  if (compacted.length === 0) {
    return undefined;
  }
  if (matchWorkspaceWriteTarget(CAT_WRITE_PATTERN, compacted) !== undefined) {
    return "cat redirection writes files; use code.overwrite or code.replaceFile for workspace file creation";
  }
  if (matchWorkspaceWriteTarget(CAT_HEREDOC_WRITE_PATTERN, compacted) !== undefined) {
    return "cat heredoc redirection writes files; use code.overwrite or code.replaceFile for workspace file creation";
  }
  if (matchWorkspaceWriteTarget(TEE_WRITE_PATTERN, compacted) !== undefined) {
    return "tee writes files; use code.overwrite or code.modify for workspace file changes";
  }
  if (matchWorkspaceWriteTarget(FILE_WRITE_REDIRECTION_PATTERN, compacted) !== undefined) {
    return "shell output redirection writes files; use code.overwrite, code.modify, or code.replaceFile for workspace file changes";
  }
  if (PROGRAMMATIC_FILE_WRITE_PATTERN.test(compacted)) {
    const target = PROGRAMMATIC_FILE_WRITE_TARGET_PATTERN.exec(compacted)?.[1];
    if (isAllowedTemporaryWriteTarget(target)) {
      return undefined;
    }
    return "ad-hoc shell scripts that write files bypass Code tools; use code.overwrite, code.modify, or code.replaceFile for workspace file changes";
  }
  return undefined;
}

export function shellWorkspaceWriteGuardMessage(reason: string): string {
  return `${reason}. If you need to create or modify workspace files, use code.overwrite, code.modify, or code.replaceFile. Shell tools are reserved for running commands, process control, and verification after file edits.`;
}
