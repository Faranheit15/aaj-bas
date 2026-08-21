/**
 * The two validators' exit codes, pinned to each other.
 *
 * `REGISTRY_EXIT_CODES` is a deliberate copy of `VALIDATION_EXIT_CODES`: two
 * commands with independent lifetimes should not be coupled by a constant
 * neither of them owns. What must never drift is what a number means, because a
 * CI script reading an exit code has no way to tell which command produced it.
 * This test is the whole of that guarantee, so it compares field for field and
 * then compares the sets, which is what catches a sixth code added to one side.
 */
import { describe, expect, it } from "vitest";
import { VALIDATION_EXIT_CODES } from "../edition-validation";
import { REGISTRY_EXIT_CODES } from "./report";

describe("REGISTRY_EXIT_CODES", () => {
  it("means the same thing by every number as the edition validator does", () => {
    expect(REGISTRY_EXIT_CODES.ok).toBe(VALIDATION_EXIT_CODES.ok);
    expect(REGISTRY_EXIT_CODES.blocking).toBe(VALIDATION_EXIT_CODES.blocking);
    expect(REGISTRY_EXIT_CODES.usage).toBe(VALIDATION_EXIT_CODES.usage);
    // Named for what each command validates, identical in meaning: the run
    // finished having checked nothing.
    expect(REGISTRY_EXIT_CODES.nothingValidated).toBe(
      VALIDATION_EXIT_CODES.noEditionsFound,
    );
    expect(REGISTRY_EXIT_CODES.internal).toBe(VALIDATION_EXIT_CODES.internal);
  });

  it("declares neither more nor fewer codes than the edition validator", () => {
    expect(Object.values(REGISTRY_EXIT_CODES).sort()).toEqual(
      Object.values(VALIDATION_EXIT_CODES).sort(),
    );
  });
});
