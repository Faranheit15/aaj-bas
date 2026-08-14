/**
 * The only file in the repository that names localStorage.
 *
 * Section 15 keeps this boundary narrow so that no component and no hook
 * carries an assumption about where state is kept, and section 37 keeps it
 * honest: browser storage has two genuinely different failures, and this module
 * reports both rather than turning either into a value.
 *
 * Neither function here may throw, ever. Persisting which stories were expanded
 * is a convenience; an exception escaping it would take down the reader's
 * edition over it. The tests assert the no-throw property directly rather than
 * trusting the reading.
 *
 * The awkward part is that the PROPERTY ACCESS itself throws. Safari in private
 * browsing, a browser with cookies blocked for the site, and a sandboxed iframe
 * without `allow-same-origin` all raise a SecurityError on evaluating
 * `window.localStorage`, before any method is called. So the `try` has to wrap
 * the access, not just the call, and the reference must be resolved per
 * operation: capturing it at module scope would move the throw to module
 * evaluation, where nothing can catch it and the whole application fails to
 * start for exactly the readers whose browsers are most locked down.
 */

export type StorageRead =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false };

/**
 * Reads one key.
 *
 * `ok: false` (storage could not be reached) stays distinct from
 * `value: null` (storage was reached and holds nothing). Today's caller renders
 * an empty set for both, but they are not the same fact: one means this device
 * has nothing stored, the other means we do not know what this device has
 * stored — and a caller that cannot tell them apart could overwrite a document
 * it was never able to read. Section 37 forbids the collapse for that reason.
 */
export function readRaw(key: string): StorageRead {
  const store = storage();
  if (store === null) {
    return { ok: false };
  }

  try {
    return { ok: true, value: store.getItem(key) };
  } catch {
    return { ok: false };
  }
}

/** Writes one key. `false` means the write was refused and nothing changed. */
export function writeRaw(key: string, value: string): boolean {
  const store = storage();
  if (store === null) {
    return false;
  }

  try {
    store.setItem(key, value);
    return true;
  } catch {
    // Quota exhaustion and a blocked origin arrive as different exception names
    // in different browsers, and neither is worth branching on: the answer to
    // both is that the write did not happen and the reader is unaffected.
    return false;
  }
}

/** Resolves storage for one operation, or `null` if it cannot be reached. */
function storage(): Storage | null {
  try {
    const available: Storage | undefined = globalThis.localStorage;
    return available ?? null;
  } catch {
    return null;
  }
}
