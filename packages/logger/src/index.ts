/**
 * Developer-facing logging.
 *
 * This package writes to the ambient `console` and does nothing else: it makes
 * no network call, holds no state of its own, buffers nothing, and derives no
 * identifier. It therefore cannot accumulate the behavioral record that
 * AGENTS.md section 23 and product constitution rules 3, 4, and 8 prohibit.
 *
 * That property depends on callers as well as on this file. `console` is
 * itself a replaceable sink, so wrapping or patching it in an application is
 * the one way to route this output off-device. Adding a network transport, a
 * buffer, a pluggable sink, or an identifier — here or in any caller —
 * requires a new ADR.
 *
 * `scope` must be a static literal such as "web". A per-session, per-device,
 * or per-user value would turn every line into a correlation id, which is
 * precisely what the prohibition above exists to prevent. This package does
 * not invent an identifier; it cannot stop a caller from passing one.
 *
 * There is deliberately no redaction of `fields`. A key denylist would catch
 * `token` but not `headers.authorization`, a URL carrying a query token, or a
 * secret already interpolated into `message`, so it would imply a guarantee it
 * cannot keep. Section 38 binds the caller instead, and its list is the
 * binding one: no secrets, tokens, personal identifiers, user-provided private
 * text, and no full third-party copyrighted content. For a news product the
 * last is the live risk — never pass a fetched article body or a raw feed
 * payload as a field (section 18).
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/** Every level that produces output. `silent` is a threshold, never a call. */
type WritableLevel = Exclude<LogLevel, "silent">;

export type Logger = {
  readonly debug: (message: string, fields?: Record<string, unknown>) => void;
  readonly info: (message: string, fields?: Record<string, unknown>) => void;
  readonly warn: (message: string, fields?: Record<string, unknown>) => void;
  readonly error: (message: string, fields?: Record<string, unknown>) => void;
};

/**
 * Ranked as a record rather than an array because `noUncheckedIndexedAccess`
 * would otherwise widen every lookup to `number | undefined`.
 */
const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/**
 * Resolved at call time rather than captured once, so that a test spying on
 * `console` observes the call and so that no console reference is retained.
 */
function emit(
  level: WritableLevel,
  scope: string,
  message: string,
  fields: Record<string, unknown> | undefined,
): void {
  const line = `[${scope}] ${message}`;

  // `line` is passed as a substitution value rather than as the first
  // argument, because console treats its first argument as a format string.
  // An interpolated message carrying a percent sequence would otherwise
  // consume `fields` and drop the structured data at exactly the moment it is
  // needed. A lowercase percent-encoded publisher URL is the realistic case:
  // `%c3%a9` begins with the `%c` specifier. Substituted strings are not
  // rescanned, so this closes the whole class.
  const args: readonly unknown[] =
    fields === undefined ? ["%s", line] : ["%s", line, fields];

  switch (level) {
    case "debug":
      console.debug(...args);
      return;
    case "info":
      console.info(...args);
      return;
    case "warn":
      console.warn(...args);
      return;
    case "error":
      console.error(...args);
      return;
    default: {
      // Adding a member to LogLevel must fail to compile here. Without this,
      // a new level type-checks clean and then silently emits nothing.
      const _unreachable: never = level;
      return;
    }
  }
}

/**
 * Creates a logger for one scope.
 *
 * `threshold` is a required argument rather than something this package reads
 * from the environment: shared packages carry no `vite/client` types, and the
 * package must stay usable outside a bundler. The application entry point owns
 * that decision, which also keeps this function a pure function of its inputs.
 */
export function createLogger(scope: string, threshold: LogLevel): Logger {
  const enabled = (level: WritableLevel): boolean =>
    LEVEL_RANK[level] >= LEVEL_RANK[threshold];

  return {
    debug: (message, fields) => {
      if (enabled("debug")) emit("debug", scope, message, fields);
    },
    info: (message, fields) => {
      if (enabled("info")) emit("info", scope, message, fields);
    },
    warn: (message, fields) => {
      if (enabled("warn")) emit("warn", scope, message, fields);
    },
    error: (message, fields) => {
      if (enabled("error")) emit("error", scope, message, fields);
    },
  };
}
