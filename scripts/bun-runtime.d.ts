/**
 * The Bun runtime surface the scripts in this directory actually call, and
 * nothing else.
 *
 * This repository installs no ambient runtime types. `bun-types` would pull in a
 * large ambient surface for one small script, and `@types/node` was already
 * refused once on the same grounds -- `packages/test-fixtures/src/sample-edition.test.ts`
 * documents reading a file through an import rather than adding it, under
 * section 11. Adding either here to type a handful of members would contradict that
 * precedent for no gain, so the members that are called are declared.
 *
 * The risk this carries is a declaration that type-checks but does not exist,
 * and the safety net is that `bun run content:validate` and `bun run build` --
 * which stages content -- both run in the blocking check suite: a wrong
 * declaration fails on the next run, loudly, rather than in production. Declare
 * only what is called, so there is less to be wrong about, and verify each
 * member exists at runtime before declaring it.
 */

declare namespace Bun {
  /**
   * Lazy file handle. `text()` rejects when the path is missing or unreadable,
   * which is the failure the CLI turns into an `INTERNAL:` exit rather than a
   * silent empty edition.
   */
  interface BunFile {
    text(): Promise<string>;
    /**
     * Rejects when the path does not exist, and resolves for a directory, which
     * `exists()` does not distinguish -- the CLI needs both apart to tell an
     * operator which mistake was made.
     */
    stat(): Promise<{ isDirectory(): boolean }>;
    /** Removes the file. Rejects when it is missing, so callers list first. */
    delete(): Promise<void>;
    /**
     * The whole file in memory. Used rather than handing the `BunFile` itself
     * to `Response`, which is a Bun-only body type this repository would have
     * to declare a compatibility for; an `ArrayBuffer` is already a `BodyInit`.
     */
    arrayBuffer(): Promise<ArrayBuffer>;
  }

  function file(path: string): BunFile;

  /**
   * Writes `input` to `destination`, creating parent directories, and resolves
   * with the number of bytes written. Passing a `BunFile` copies it verbatim,
   * which is how a staged edition stays byte-identical to the reviewed one.
   */
  function write(
    destination: string | BunFile,
    input: string | BunFile,
  ): Promise<number>;

  /** The small subprocess surface used by the agent hook adapter. */
  interface Subprocess {
    readonly exited: Promise<number>;
    readonly stdout: ReadableStream<Uint8Array> | null;
  }

  function spawn(
    command: readonly string[],
    options?: {
      readonly cwd?: string;
      readonly stderr?: "ignore" | "pipe";
      readonly stdout?: "ignore" | "pipe";
    },
  ): Subprocess;

  /**
   * The process's own streams, as files `Bun.write` can be pointed at.
   *
   * Used instead of `console.log` in `serve-dist.ts`, and the difference is
   * not stylistic. Bun block-buffers `console.log` when stdout is a pipe and
   * flushes it on exit; a long-running server's first line therefore never
   * reaches a parent process that is waiting to read it, which is exactly how
   * the end-to-end suite learns which port to talk to. `Bun.write` performs
   * the write immediately.
   */
  const stdout: BunFile;
  const stderr: BunFile;
  const stdin: BunFile;

  /**
   * One bundled file, produced in memory. `text()` is the only member called:
   * the caller writes the bytes itself, rather than handing `Bun.build` an
   * `outdir`, so exactly one file lands in a directory a deploy will upload.
   */
  interface BuildArtifact {
    text(): Promise<string>;
  }

  /**
   * `success` is false with `logs` populated rather than rejecting, so a
   * failed bundle has to be checked for -- an unchecked call would write an
   * empty worker and report success.
   */
  interface BuildOutput {
    readonly success: boolean;
    readonly outputs: readonly BuildArtifact[];
    /** Bundler diagnostics. Printed through `String`, never destructured. */
    readonly logs: readonly unknown[];
  }

  function build(config: {
    entrypoints: readonly string[];
    /** `"browser"`, which is also the default. Stated rather than assumed. */
    target: "browser";
    /**
     * `"iife"` produces a classic script. A module service worker registers
     * only in browsers that implement one, and the registration fails silently
     * elsewhere, so the offline story would simply be absent there.
     */
    format: "iife";
    minify: boolean;
    /** Identifier replacements, each value a JavaScript expression as text. */
    define: Record<string, string>;
  }): Promise<BuildOutput>;

  /**
   * A running HTTP server. Only what `serve-dist.ts` calls: the port it was
   * given, and the stop that must be a real stop.
   */
  interface Server {
    /** The bound port, which is what was asked for unless that was 0. */
    readonly port: number;
    /**
     * @param closeActiveConnections - when true, open keep-alive sockets are
     * destroyed rather than allowed to drain. The end-to-end suite's whole
     * offline mechanism depends on that distinction.
     */
    stop(closeActiveConnections?: boolean): Promise<void>;
  }

  function serve(options: {
    /** Loopback, so the origin is a secure context and nothing is exposed. */
    hostname: string;
    /** 0 lets the operating system choose, and `Server.port` reports it. */
    port: number;
    fetch(request: Request): Promise<Response> | Response;
  }): Server;

  /**
   * Bun's own YAML parser, which is why `content/sources.yml` needs no
   * dependency: section 11 asks that a package not be added for a capability
   * the runtime already has.
   *
   * `parse` throws on malformed input rather than returning a failure, so every
   * caller has to catch -- an unparseable registry is a real failure and must
   * never be reported as a file that simply held nothing. The result is
   * `unknown` because a parsed document is not a registry until a schema says
   * so, and that judgement lives in `@aaj-bas/domain`.
   *
   * `Bun` is undefined under Vitest, which is why the parse happens in this
   * directory at all: `validateSourceRegistry` takes a parsed value rather than
   * text so that the package holding the rules stays runnable under the test
   * runner.
   */
  namespace YAML {
    function parse(text: string): unknown;
  }

  class Glob {
    constructor(pattern: string);
    /**
     * Yields paths relative to `cwd`, in no promised order -- the caller sorts.
     * Async because the walk is streamed, which is why the entry point is async.
     */
    scan(options: {
      cwd: string;
      onlyFiles: boolean;
      /**
       * Whether a leading dot may be matched by a wildcard. False by default,
       * which would walk past exactly the residue a staging sweep is looking
       * for: editor swap and lock files are hidden. Optional, so a scan that
       * has no reason to care reads as it did before.
       */
      dot?: boolean;
    }): AsyncIterable<string>;
  }
}

declare const process: {
  exit(code: number): never;
  /** `[bun, script, ...args]`, so the CLI's own arguments start at index 2. */
  argv: string[];
  /** Only for resolving a user-supplied relative path back to a repo-relative one. */
  cwd(): string;
  /**
   * Signal handlers, and only the two a stoppable server needs. Bun's default
   * for both is to terminate, which already closes every socket; the handler
   * exists so that the close is stated in the file whose reason for existing
   * is being killed, rather than left to a default.
   */
  on(signal: "SIGTERM" | "SIGINT", handler: () => void): void;
};

interface ImportMeta {
  /** Absolute directory of this module, so behaviour does not depend on cwd. */
  readonly dir: string;
}

declare module "node:dns/promises" {
  interface LookupAddress {
    readonly address: string;
    readonly family: 4 | 6;
  }

  function lookup(
    hostname: string,
    options: { readonly all: true; readonly verbatim: true },
  ): Promise<readonly LookupAddress[]>;

  export { lookup };
}

declare module "node:fs/promises" {
  function realpath(path: string): Promise<string>;

  export { realpath };
}

declare module "node:path" {
  function isAbsolute(path: string): boolean;
  function relative(from: string, to: string): string;
  function resolve(...paths: string[]): string;

  export { isAbsolute, relative, resolve };
}

declare module "node:https" {
  interface IncomingMessage {
    readonly statusCode?: number;
    readonly headers: Readonly<
      Record<string, string | readonly string[] | undefined>
    >;
    on(event: "data", listener: (chunk: Uint8Array | string) => void): this;
    on(event: "end" | "aborted" | "close", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    destroy(error?: Error): this;
  }

  interface LookupResultAddress {
    readonly address: string;
    readonly family: 4 | 6;
  }

  interface LookupOptions {
    readonly all?: boolean;
  }

  type LookupCallback = (
    error: Error | null,
    address?: string | readonly LookupResultAddress[],
    family?: 4 | 6,
  ) => void;

  type LookupFunction = (
    hostname: string,
    options: LookupOptions,
    callback: LookupCallback,
  ) => void;

  interface ClientRequest {
    on(event: "error", listener: (error: Error) => void): this;
    setTimeout(milliseconds: number, listener: () => void): this;
    end(): void;
    destroy(error?: Error): this;
  }

  function request(
    options: {
      readonly hostname: string;
      readonly path: string;
      readonly method: "GET";
      readonly headers: Record<string, string>;
      readonly servername: string;
      readonly agent: false;
      readonly rejectUnauthorized: true;
      readonly lookup: LookupFunction;
    },
    callback: (response: IncomingMessage) => void,
  ): ClientRequest;

  export { request };
}
