// check-package-manager:allow-names

/**
 * One small adapter for repository hooks used by Codex and future harnesses.
 *
 * The hook process is a protocol boundary: stdout belongs to the harness, so
 * diagnostics go to stderr and every successful structured response is JSON.
 * The adapter fails open when its own input, transcript, path, or formatter
 * work is unavailable. A policy decision is different: a recognized unsafe
 * command returns the harness response that blocks that command.
 */

import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

type JsonRecord = { readonly [key: string]: unknown };
type HookMode = "antigravity" | "codex" | "gemini";
type HookEvent = "post-tool" | "pre-tool" | "stop";

interface CliOptions {
  readonly event: HookEvent | undefined;
  readonly mode: HookMode | undefined;
}

interface TranscriptFacts {
  hasCheck: boolean;
  hasEdit: boolean;
}

const BIOME_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".json",
  ".jsonc",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".cts",
  ".ts",
  ".tsx",
]);

const FOREIGN_LOCKFILE_NAMES = new Set([
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const FILE_PATH_KEYS = [
  "AbsolutePath",
  "DirectoryPath",
  "file_path",
  "filePath",
  "filename",
  "fileName",
  "path",
  "TargetFile",
  "target_file",
  "target_path",
  "targetPath",
] as const;

const NESTED_RECORD_KEYS = [
  "args",
  "arguments",
  "call",
  "data",
  "event",
  "function",
  "input",
  "params",
  "parameters",
  "payload",
  "tool",
  "tool_call",
  "toolCall",
  "tool_input",
  "toolInput",
] as const;

const APPLY_PATCH_FILE_PATTERN = /^\*\*\* (?:Add|Update) File:\s*(.+?)\s*$/gm;

const PACKAGE_POLICY =
  "Blocked by AGENTS.md section 8: Bun is the only JavaScript/TypeScript package manager. Use Bun commands instead.";
const LOCKFILE_POLICY =
  "Blocked by AGENTS.md section 8: bun.lock is the only permitted lockfile; foreign lockfiles must not be created.";
const DEPLOYMENT_POLICY =
  "Blocked by AGENTS.md section 47: agents must not deploy to production; deployment happens only through CI on develop.";
const SECRET_POLICY =
  "Blocked by AGENTS.md sections 24 and 47: secrets and external API mutations are handled by a human, not an agent.";
const STOP_REMINDER =
  "Files were edited this session but `bun run check` was not run. Run it and report the actual result.";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
  record: JsonRecord,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function getBoolean(
  record: JsonRecord,
  keys: readonly string[],
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function getRecord(
  record: JsonRecord,
  keys: readonly string[],
): JsonRecord | undefined {
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function nestedRecords(input: JsonRecord): JsonRecord[] {
  const records: JsonRecord[] = [input];
  const seen = new Set<JsonRecord>(records);

  // Two explicit levels cover the common hook envelopes without recursively
  // treating arbitrary model data as a tool call or a file path.
  for (let level = 0; level < 2; level += 1) {
    const current = [...records];
    for (const record of current) {
      for (const key of NESTED_RECORD_KEYS) {
        const value = record[key];
        if (!isRecord(value) || seen.has(value)) {
          continue;
        }
        seen.add(value);
        records.push(value);
      }
    }
  }

  return records;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseMode(value: string | undefined): HookMode | undefined {
  switch (normalize(value ?? "")) {
    case "codex":
      return "codex";
    case "gemini":
      return "gemini";
    case "antigravity":
      return "antigravity";
    default:
      return undefined;
  }
}

function parseEvent(value: string | undefined): HookEvent | undefined {
  switch (normalize(value ?? "")) {
    case "pretool":
    case "pretooluse":
    case "beforetool":
    case "beforetooluse":
      return "pre-tool";
    case "posttool":
    case "posttooluse":
    case "aftertool":
    case "aftertooluse":
      return "post-tool";
    case "stop":
      return "stop";
    default:
      return undefined;
  }
}

function parseCli(args: readonly string[]): CliOptions {
  let modeValue: string | undefined;
  let eventValue: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }

    if (argument === "--mode" || argument === "--harness") {
      modeValue = args[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("--mode=") || argument.startsWith("--harness=")) {
      modeValue = argument.slice(argument.indexOf("=") + 1);
      continue;
    }
    if (argument === "--event") {
      eventValue = args[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("--event=")) {
      eventValue = argument.slice("--event=".length);
      continue;
    }
    positional.push(argument);
  }

  const positionalMode = parseMode(positional[0]);
  const positionalEvent = parseEvent(positional[1] ?? positional[0]);

  return {
    event: parseEvent(eventValue) ?? positionalEvent,
    mode: parseMode(modeValue) ?? positionalMode,
  };
}

function getToolName(input: JsonRecord): string | undefined {
  const direct = getString(input, ["tool_name", "toolName"]);
  if (direct !== undefined) {
    return direct;
  }

  const toolValue = input.tool;
  if (typeof toolValue === "string") {
    return toolValue;
  }

  for (const record of nestedRecords(input)) {
    const name = getString(record, ["tool_name", "toolName"]);
    if (name !== undefined) {
      return name;
    }
    const nestedName = getString(record, ["name"]);
    if (nestedName !== undefined && record !== input) {
      return nestedName;
    }
  }

  return getString(input, ["name"]);
}

function getCommand(input: JsonRecord): string | undefined {
  const direct = getString(input, [
    "CommandLine",
    "command_line",
    "command",
    "cmd",
    "script",
    "shell_command",
    "shellCommand",
  ]);
  if (direct !== undefined) {
    return direct;
  }

  for (const record of nestedRecords(input)) {
    const command = getString(record, [
      "CommandLine",
      "command_line",
      "command",
      "cmd",
      "script",
      "shell_command",
      "shellCommand",
    ]);
    if (command !== undefined) {
      return command;
    }
  }

  const rawInput = input.tool_input ?? input.toolInput ?? input.input;
  return typeof rawInput === "string" ? rawInput : undefined;
}

function collectFilePaths(
  input: JsonRecord,
  includePatchHeaders: boolean,
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  for (const record of nestedRecords(input)) {
    for (const key of FILE_PATH_KEYS) {
      const value = record[key];
      if (typeof value !== "string" || value.trim() === "") {
        continue;
      }
      const path = value.trim();
      if (!seen.has(path)) {
        seen.add(path);
        paths.push(path);
      }
    }
  }

  if (includePatchHeaders) {
    const command = getCommand(input);
    if (command !== undefined) {
      for (const match of command.matchAll(APPLY_PATCH_FILE_PATTERN)) {
        const path = match[1]?.trim();
        if (path !== undefined && path !== "" && !seen.has(path)) {
          seen.add(path);
          paths.push(path);
        }
      }
    }
  }

  return paths;
}

function isShellTool(toolName: string | undefined): boolean {
  if (toolName === undefined) {
    return true;
  }
  return new Set([
    "bash",
    "cmd",
    "command",
    "exec",
    "execcommand",
    "powershell",
    "runcommand",
    "runshellcommand",
    "shell",
    "shellcommand",
    "terminal",
  ]).has(normalize(toolName));
}

function isPatchTool(
  toolName: string | undefined,
  command: string | undefined,
): boolean {
  if (toolName !== undefined) {
    const name = normalize(toolName);
    if (
      new Set([
        "applypatch",
        "edit",
        "fileedit",
        "filewrite",
        "multiedit",
        "multireplacefilecontent",
        "notebookedit",
        "replacefilecontent",
        "write",
        "writetofile",
        "writefile",
      ]).has(name)
    ) {
      return true;
    }
  }
  return command?.trimStart().startsWith("*** Begin Patch") ?? false;
}

function commandSegments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .filter((word) => word !== "")
        .map((word) => word.replace(/^["'`]+|["'`,]+$/g, "")),
    )
    .filter((words) => words.length > 0);
}

function executableName(value: string | undefined): string {
  if (value === undefined) {
    return "";
  }
  const withoutPath = value.split(/[\\/]/).at(-1) ?? value;
  return withoutPath.replace(/\.(?:cmd|exe)$/i, "").toLowerCase();
}

function hasAlternativePackageManager(command: string): boolean {
  for (const words of commandSegments(command)) {
    let index = 0;
    while (
      index < words.length &&
      /^(?:sudo|command|corepack|env|[A-Za-z_][A-Za-z0-9_]*=.+)$/.test(
        words[index] ?? "",
      )
    ) {
      index += 1;
    }

    const first = executableName(words[index]);
    if (new Set(["npm", "npx", "pnpm", "pnpx", "yarn"]).has(first)) {
      return true;
    }
    if (first === "bunx" && words[index + 1] !== undefined) {
      if (
        new Set(["npm", "npx", "pnpm", "pnpx", "yarn"]).has(
          executableName(words[index + 1]),
        )
      ) {
        return true;
      }
    }
    if (
      first === "bun" &&
      executableName(words[index + 1]) === "x" &&
      words[index + 2] !== undefined &&
      new Set(["npm", "npx", "pnpm", "pnpx", "yarn"]).has(
        executableName(words[index + 2]),
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasDeploymentCommand(command: string): boolean {
  const deploymentTools = new Set([
    "aws",
    "az",
    "firebase",
    "fly",
    "flyctl",
    "gcloud",
    "netlify",
    "railway",
    "vercel",
  ]);
  const deploymentActions = new Set([
    "deploy",
    "publish",
    "release",
    "up",
    "--prod",
  ]);

  for (const words of commandSegments(command)) {
    const first = executableName(words[0]);
    const lowerWords = words.map((word) => word.toLowerCase());

    if (first === "wrangler") {
      return true;
    }
    if (first === "bunx" && executableName(words[1]) === "wrangler") {
      return true;
    }
    if (
      first === "bun" &&
      ((executableName(words[1]) === "x" &&
        executableName(words[2]) === "wrangler") ||
        (executableName(words[1]) === "run" &&
          executableName(words[2]) === "wrangler"))
    ) {
      return true;
    }
    if (
      (first === "bun" || first === "make" || first === "just") &&
      lowerWords.some(
        (word) => deploymentActions.has(word) || word === "deploy",
      )
    ) {
      return true;
    }
    if (
      deploymentTools.has(first) &&
      lowerWords.some((word) => deploymentActions.has(word))
    ) {
      return true;
    }
    if (first === "git" && lowerWords.includes("push")) {
      if (lowerWords.includes("develop") || lowerWords.includes("main")) {
        return true;
      }
    }
    if (
      first === "cloudflare" &&
      lowerWords.includes("pages") &&
      lowerWords.includes("deploy")
    ) {
      return true;
    }
  }

  return false;
}

function hasSecretOrApiMutation(command: string): boolean {
  const mutationMethods = new Set(["post", "put", "patch", "delete"]);

  for (const words of commandSegments(command)) {
    const first = executableName(words[0]);
    const lowerWords = words.map((word) => word.toLowerCase());

    if (first === "gh") {
      if (
        lowerWords.includes("secret") ||
        lowerWords.includes("variable") ||
        lowerWords.includes("api")
      ) {
        return true;
      }
      if (
        lowerWords.includes("workflow") &&
        (lowerWords.includes("run") ||
          lowerWords.includes("enable") ||
          lowerWords.includes("disable"))
      ) {
        return true;
      }
      if (lowerWords.includes("run") && lowerWords.includes("rerun")) {
        return true;
      }
    }

    if (first === "curl" || first === "wget") {
      for (let index = 0; index < lowerWords.length - 1; index += 1) {
        if (
          (lowerWords[index] === "-x" || lowerWords[index] === "--request") &&
          mutationMethods.has(lowerWords[index + 1] ?? "")
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

function isForeignLockfilePath(path: string): boolean {
  const basename = path.split(/[\\/]/).at(-1)?.toLowerCase();
  return basename !== undefined && FOREIGN_LOCKFILE_NAMES.has(basename);
}

function hasForeignLockfileMutation(command: string): boolean {
  const lower = command.toLowerCase();
  if (![...FOREIGN_LOCKFILE_NAMES].some((name) => lower.includes(name))) {
    return false;
  }

  // Reads and explicit removals do not create a foreign lockfile. Unknown
  // operations stay blocked because the hook cannot safely prove they are
  // non-mutating.
  if (
    /\b(?:cat|head|tail|grep|rg|git\s+(?:diff|show|status)|rm|del|unlink|remove-item|git\s+rm)\b/i.test(
      command,
    ) &&
    !/[>]{1,2}/.test(command)
  ) {
    return false;
  }

  return (
    /[>]{1,2}/.test(command) ||
    /\b(?:add-content|copy|copy-item|cp|echo|install|mkdir|move|move-item|mv|new-item|out-file|perl|printf|rename|sed|set-content|tee|touch|write)\b/i.test(
      command,
    )
  );
}

function findPolicyViolation(input: JsonRecord): string | undefined {
  const toolName = getToolName(input);
  const command = getCommand(input);
  const patchTool = isPatchTool(toolName, command);
  const filePaths = collectFilePaths(input, patchTool);

  if (filePaths.some(isForeignLockfilePath)) {
    return LOCKFILE_POLICY;
  }

  if (patchTool || !isShellTool(toolName) || command === undefined) {
    return undefined;
  }
  if (hasAlternativePackageManager(command)) {
    return PACKAGE_POLICY;
  }
  if (hasForeignLockfileMutation(command)) {
    return LOCKFILE_POLICY;
  }
  if (hasDeploymentCommand(command)) {
    return DEPLOYMENT_POLICY;
  }
  if (hasSecretOrApiMutation(command)) {
    return SECRET_POLICY;
  }
  return undefined;
}

function codexBlockResponse(reason: string): JsonRecord {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

function genericBlockResponse(reason: string): JsonRecord {
  return { decision: "deny", reason };
}

async function writeJson(value: JsonRecord): Promise<void> {
  try {
    await Bun.write(Bun.stdout, `${JSON.stringify(value)}\n`);
  } catch {
    await writeDiagnostic("could not write the hook response; continuing open");
  }
}

async function writeDiagnostic(message: string): Promise<void> {
  try {
    await Bun.write(Bun.stderr, `agent-hook: ${message}\n`);
  } catch {
    // A hook must never turn an unavailable diagnostic stream into a session
    // failure. The policy response, when any, has already been decided.
  }
}

async function readInput(): Promise<JsonRecord | undefined> {
  try {
    const text = await Bun.stdin.text();
    if (text.trim() === "") {
      return {};
    }
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) {
      await writeDiagnostic(
        "ignored a hook payload that was not a JSON object",
      );
      return undefined;
    }
    return parsed;
  } catch {
    await writeDiagnostic("ignored malformed hook JSON input");
    return undefined;
  }
}

async function repositoryRoot(): Promise<string | undefined> {
  try {
    const child = Bun.spawn(
      ["git", "-C", process.cwd(), "rev-parse", "--show-toplevel"],
      { stderr: "ignore", stdout: "pipe" },
    );
    if (child.stdout === null) {
      return undefined;
    }
    const output = await new Response(child.stdout).text();
    const exitCode = await child.exited;
    if (exitCode !== 0 || output.trim() === "") {
      return undefined;
    }
    return output.trim();
  } catch {
    return undefined;
  }
}

function isInside(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot !== "" &&
    !isAbsolute(pathFromRoot) &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith("../") &&
    !pathFromRoot.startsWith("..\\")
  );
}

function isBiomeFile(path: string): boolean {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return BIOME_EXTENSIONS.has(extension);
}

async function safeRepositoryFile(
  root: string,
  base: string,
  filePath: string,
): Promise<string | undefined> {
  if (
    filePath.includes("\0") ||
    filePath.startsWith("data:") ||
    filePath.startsWith("file://")
  ) {
    return undefined;
  }

  try {
    const resolvedRoot = await realpath(root);
    const candidate = resolve(base, filePath);
    const resolvedTarget = await realpath(candidate);
    if (
      !isInside(resolvedRoot, resolvedTarget) ||
      !isBiomeFile(resolvedTarget)
    ) {
      return undefined;
    }
    if ((await Bun.file(resolvedTarget).stat()).isDirectory()) {
      return undefined;
    }
    return resolvedTarget;
  } catch {
    // A deleted file, a broken symlink, or a missing git root is a formatting
    // opportunity lost, not a reason to interrupt the agent session.
    return undefined;
  }
}

async function formatPostTool(input: JsonRecord): Promise<void> {
  try {
    const toolName = getToolName(input);
    const command = getCommand(input);
    const paths = collectFilePaths(input, isPatchTool(toolName, command));
    if (paths.length === 0) {
      return;
    }

    const root = await repositoryRoot();
    if (root === undefined) {
      return;
    }
    const base = resolve(getString(input, ["cwd"]) ?? process.cwd());
    const targets = new Set<string>();
    for (const path of paths) {
      const target = await safeRepositoryFile(root, base, path);
      if (target !== undefined) {
        targets.add(target);
      }
    }

    for (const target of targets) {
      try {
        const child = Bun.spawn(
          ["bunx", "@biomejs/biome", "format", "--write", target],
          { cwd: root, stderr: "ignore", stdout: "ignore" },
        );
        const exitCode = await child.exited;
        if (exitCode !== 0) {
          await writeDiagnostic(
            "Biome did not format the edited file; continuing open",
          );
        }
      } catch {
        await writeDiagnostic(
          "Biome formatting was unavailable; continuing open",
        );
      }
    }
  } catch {
    await writeDiagnostic("post-tool formatting was skipped; continuing open");
  }
}

function parseJsonRecord(value: unknown): JsonRecord | undefined {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function inspectTranscriptNode(
  value: unknown,
  facts: TranscriptFacts,
  depth = 0,
): void {
  if (depth > 8 || (facts.hasEdit && facts.hasCheck)) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      inspectTranscriptNode(item, facts, depth + 1);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const type = normalize(getString(value, ["type", "kind"]) ?? "");
  const name = getToolName(value);
  const isToolCall =
    type.includes("tooluse") ||
    type.includes("toolcall") ||
    type.includes("functioncall") ||
    getString(value, ["tool_name", "toolName"]) !== undefined;

  if (isToolCall && name !== undefined) {
    const normalizedName = normalize(name);
    if (
      new Set([
        "applypatch",
        "edit",
        "fileedit",
        "filewrite",
        "multiedit",
        "multireplacefilecontent",
        "notebookedit",
        "replacefilecontent",
        "write",
        "writetofile",
        "writefile",
      ]).has(normalizedName)
    ) {
      facts.hasEdit = true;
    }

    const argumentsRecord =
      getRecord(value, [
        "input",
        "tool_input",
        "toolInput",
        "args",
        "arguments",
      ]) ?? parseJsonRecord(value.arguments);
    const command =
      getString(value, ["command", "cmd", "script"]) ??
      (argumentsRecord === undefined ? undefined : getCommand(argumentsRecord));
    if (command !== undefined && /\bbun\s+run\s+check(?:\s|$)/i.test(command)) {
      facts.hasCheck = true;
    }
  }

  for (const key of [
    "content",
    "data",
    "event",
    "items",
    "message",
    "output",
    "parts",
    "payload",
    "response",
  ]) {
    const nested = value[key];
    if (nested !== undefined) {
      inspectTranscriptNode(nested, facts, depth + 1);
    }
  }
}

function inspectTranscriptText(text: string): TranscriptFacts {
  const facts: TranscriptFacts = { hasCheck: false, hasEdit: false };
  const trimmed = text.trim();
  if (trimmed === "") {
    return facts;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    inspectTranscriptNode(parsed, facts);
    return facts;
  } catch {
    for (const line of text.split(/\r?\n/)) {
      if (facts.hasEdit && facts.hasCheck) {
        break;
      }
      try {
        const parsed: unknown = JSON.parse(line);
        inspectTranscriptNode(parsed, facts);
      } catch {
        // JSONL transcripts may contain non-JSON bookkeeping lines. Ignore
        // them rather than searching arbitrary text for a command or secret.
      }
    }
  }
  return facts;
}

function inspectTranscript(value: unknown): TranscriptFacts {
  if (typeof value === "string") {
    return inspectTranscriptText(value);
  }
  const facts: TranscriptFacts = { hasCheck: false, hasEdit: false };
  inspectTranscriptNode(value, facts);
  return facts;
}

async function stopReminder(input: JsonRecord): Promise<void> {
  if (getBoolean(input, ["stop_hook_active", "stopHookActive"]) === true) {
    return;
  }

  const inlineTranscript = input.transcript ?? input.messages ?? input.events;
  if (inlineTranscript !== undefined) {
    const facts = inspectTranscript(inlineTranscript);
    if (facts.hasEdit && !facts.hasCheck) {
      await writeJson({ systemMessage: STOP_REMINDER });
    }
    return;
  }

  const transcriptPath = getString(input, [
    "transcript_path",
    "transcriptPath",
  ]);
  if (transcriptPath === undefined) {
    return;
  }

  try {
    const facts = inspectTranscriptText(await Bun.file(transcriptPath).text());
    if (facts.hasEdit && !facts.hasCheck) {
      await writeJson({ systemMessage: STOP_REMINDER });
    }
  } catch {
    await writeDiagnostic(
      "stop reminder could not inspect the transcript; continuing open",
    );
  }
}

async function main(): Promise<void> {
  const input = await readInput();
  if (input === undefined) {
    return;
  }

  const cli = parseCli(process.argv.slice(2));
  const mode =
    cli.mode ?? parseMode(getString(input, ["mode", "harness"])) ?? "codex";
  const event =
    cli.event ??
    parseEvent(
      getString(input, [
        "hook_event_name",
        "hookEventName",
        "event_name",
        "eventName",
        "event",
      ]),
    );
  if (event === undefined) {
    return;
  }

  if (event === "pre-tool") {
    const violation = findPolicyViolation(input);
    if (violation !== undefined) {
      await writeJson(
        mode === "codex"
          ? codexBlockResponse(violation)
          : genericBlockResponse(violation),
      );
    } else if (mode !== "codex") {
      // Antigravity requires an explicit decision for PreToolUse. Gemini also
      // accepts this response, and it makes the adapter's allow path visible.
      await writeJson({ decision: "allow" });
    }
    return;
  }
  if (event === "post-tool") {
    await formatPostTool(input);
    await writeJson({});
    return;
  }
  await stopReminder(input);
}

await main().catch(async () => {
  // Hook implementation errors must not turn into a broken agent session or
  // leak a stack trace into a JSON-only stdout protocol.
  await writeDiagnostic("hook execution failed; continuing open");
});
