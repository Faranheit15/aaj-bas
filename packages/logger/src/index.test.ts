import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function spyOnConsole() {
  return {
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

describe("createLogger", () => {
  it("routes each level to the matching console method", () => {
    const spies = spyOnConsole();
    const log = createLogger("reader", "debug");

    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");

    expect(spies.debug).toHaveBeenCalledWith("%s", "[reader] d");
    expect(spies.info).toHaveBeenCalledWith("%s", "[reader] i");
    expect(spies.warn).toHaveBeenCalledWith("%s", "[reader] w");
    expect(spies.error).toHaveBeenCalledWith("%s", "[reader] e");
  });

  it("suppresses levels below the debug-to-warn threshold", () => {
    const spies = spyOnConsole();
    const log = createLogger("reader", "warn");

    log.debug("dropped");
    log.info("dropped");
    log.warn("kept");
    log.error("kept");

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("keeps info at the info threshold and drops only debug", () => {
    const spies = spyOnConsole();
    const log = createLogger("reader", "info");

    log.debug("dropped");
    log.info("kept");

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledTimes(1);
  });

  it("keeps only error at the error threshold", () => {
    const spies = spyOnConsole();
    const log = createLogger("reader", "error");

    log.warn("dropped");
    log.error("kept");

    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("emits nothing at the silent threshold", () => {
    const spies = spyOnConsole();
    const log = createLogger("reader", "silent");

    log.debug("dropped");
    log.info("dropped");
    log.warn("dropped");
    log.error("dropped");

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });

  it("prefixes output with its own scope", () => {
    const spies = spyOnConsole();

    createLogger("landing", "debug").debug("mounted");
    createLogger("reader", "debug").debug("mounted");

    expect(spies.debug).toHaveBeenNthCalledWith(1, "%s", "[landing] mounted");
    expect(spies.debug).toHaveBeenNthCalledWith(2, "%s", "[reader] mounted");
  });

  it("passes fields through as a separate argument so they stay inspectable", () => {
    const spies = spyOnConsole();
    const log = createLogger("reader", "debug");

    log.warn("edition unavailable", { editionDate: "2026-08-13", attempt: 2 });

    expect(spies.warn).toHaveBeenCalledWith(
      "%s",
      "[reader] edition unavailable",
      {
        editionDate: "2026-08-13",
        attempt: 2,
      },
    );
  });

  it("keeps fields intact when the message contains console format specifiers", () => {
    // A percent-encoded publisher URL interpolated into a message is the
    // realistic trigger: `%c3%a9` starts with the `%c` specifier, which would
    // consume `fields` if the message were the format string.
    const spies = spyOnConsole();
    const log = createLogger("reader", "debug");

    log.error("fetch failed for /a%c3%a9b and %s and %d", { attempt: 2 });

    expect(spies.error).toHaveBeenCalledWith(
      "%s",
      "[reader] fetch failed for /a%c3%a9b and %s and %d",
      { attempt: 2 },
    );
  });

  it("omits the trailing fields argument entirely when none are supplied", () => {
    const spies = spyOnConsole();
    const log = createLogger("reader", "debug");

    log.info("mounted");

    // An empty object would render as a stray `{}` in devtools.
    expect(spies.info).toHaveBeenCalledWith("%s", "[reader] mounted");
    expect(spies.info.mock.calls[0]).toHaveLength(2);
  });

  it("exposes only the four level methods", () => {
    // A `flush`, `sink`, or `setLevel` appearing here would be an API change,
    // not a refactor. This asserts the surface only; the network guarantee is
    // the next test.
    expect(Object.keys(createLogger("reader", "debug")).sort()).toEqual([
      "debug",
      "error",
      "info",
      "warn",
    ]);
  });

  it("touches no network global on any level, with or without fields", () => {
    // The claim in this package's doc comment is that output cannot leave the
    // device. Asserting it here means a future `fetch` or `sendBeacon` fails
    // the merge-blocking suite rather than relying on review alone.
    spyOnConsole();
    const fetchSpy = vi.fn();
    const sendBeaconSpy = vi.fn();
    const xhrSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { sendBeacon: sendBeaconSpy });
    vi.stubGlobal("XMLHttpRequest", xhrSpy);

    const log = createLogger("reader", "debug");
    log.debug("d", { a: 1 });
    log.info("i");
    log.warn("w", { b: 2 });
    log.error("e");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });
});
