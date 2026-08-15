/**
 * The two values the build inlines into the worker, and the sliver of the
 * service worker global scope the worker actually calls.
 *
 * Both halves follow `scripts/bun-runtime.d.ts` and its stated discipline:
 * declare only what is called, so there is less to be wrong about, and let a
 * blocking check catch a declaration that does not match reality.
 *
 * THE CONSTANTS do not exist in any source file. `scripts/build-service-worker.ts`
 * replaces the two identifiers with literals at bundle time -- the precache
 * list and the id naming it -- because a worker that fetched its own file list
 * would have to reach the network before it could install one. Getting either
 * name wrong fails at the next build rather than at runtime: an undefined
 * identifier survives no bundle.
 *
 * THE GLOBAL SCOPE is declared because this repository's TypeScript
 * configuration loads the DOM library and not the WebWorker one, and the two
 * cannot both be loaded -- they declare incompatible versions of the same
 * globals. `lib.dom.d.ts` therefore has no `FetchEvent`, no `ExtendableEvent`
 * and no `ServiceWorkerGlobalScope` at all, so the worker would not type-check
 * without these. A second `tsconfig` for two source files would be the
 * alternative, and it would take the worker out of the program `bun run
 * typecheck` already covers.
 *
 * The safety net is that `bun run build` bundles both workers on every run, and
 * the end-to-end suite ADR-0010 introduces exercises a real one in a browser: a
 * member declared here that does not exist fails there, loudly, rather than on
 * a reader's device.
 */

/**
 * Root-relative paths installed atomically during `install`.
 *
 * Computed by `planPrecache` over the built output, so it never contains
 * published content: an edition installed with the shell would be served to a
 * returning reader after a correction had rewritten it (ADR-0006).
 */
declare const __PRECACHE__: readonly string[];

/**
 * Eight hex characters naming the precache list, and through it the shell
 * cache. It changes when the built assets change and not when an edition is
 * published, which is what stops a daily deploy replacing every reader's worker.
 */
declare const __BUILD_ID__: string;

/** An event that can hold the worker open until a promise settles. */
interface ExtendableEvent extends Event {
  /**
   * Rejection is not cosmetic: during `install` it fails the installation, so
   * the worker never activates. That is what makes an atomic precache possible.
   */
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  /**
   * Must be called synchronously from the handler. Not calling it at all is
   * the documented way to let the browser make the request itself, which is
   * how every request this worker declines to intercept is served.
   */
  respondWith(response: Response | Promise<Response>): void;
}

/** A page this worker controls. Only the tombstone worker touches one. */
interface WindowClient {
  readonly url: string;
  navigate(url: string): Promise<WindowClient | null>;
}

interface ServiceWorkerClients {
  /** Takes control of pages loaded before this worker activated. */
  claim(): Promise<void>;
  matchAll(options: { type: "window" }): Promise<readonly WindowClient[]>;
}

interface ServiceWorkerGlobalScope {
  readonly caches: CacheStorage;
  readonly clients: ServiceWorkerClients;
  readonly registration: ServiceWorkerRegistration;
  /** Only `origin` is read, to tell a same-origin request from a publisher's. */
  readonly location: { readonly origin: string };
  /** Activates this worker without waiting for controlled pages to close. */
  skipWaiting(): Promise<void>;
  addEventListener(
    type: "install" | "activate",
    listener: (event: ExtendableEvent) => void,
  ): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
}
