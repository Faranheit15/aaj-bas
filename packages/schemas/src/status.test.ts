import { describe, expect, it } from "vitest";
import {
  type StatusArtifact,
  statusArtifactSchema,
  systemHealthStatusSchema,
} from "./status";

describe("statusArtifactSchema (AB-803)", () => {
  const validStatus: StatusArtifact = {
    schemaVersion: 1,
    generatedAt: "2026-08-29T12:00:00.000Z",
    status: "healthy",
    latestEditionDate: "2026-08-29",
    publishedEditionsCount: 12,
    sources: {
      total: 10,
      active: 10,
    },
    checks: [
      {
        name: "latest_pointer",
        passed: true,
      },
      {
        name: "source_registry",
        passed: true,
        detail: "10/10 sources active",
      },
    ],
  };

  it("validates a healthy status artifact", () => {
    const parsed = statusArtifactSchema.parse(validStatus);
    expect(parsed.status).toBe("healthy");
    expect(parsed.publishedEditionsCount).toBe(12);
  });

  it("validates a status artifact with null latestEditionDate", () => {
    const initialStatus = {
      ...validStatus,
      status: "warning" as const,
      latestEditionDate: null,
      publishedEditionsCount: 0,
    };
    const parsed = statusArtifactSchema.parse(initialStatus);
    expect(parsed.latestEditionDate).toBeNull();
    expect(parsed.status).toBe("warning");
  });

  it("validates all 4 system health statuses", () => {
    expect(systemHealthStatusSchema.parse("healthy")).toBe("healthy");
    expect(systemHealthStatusSchema.parse("warning")).toBe("warning");
    expect(systemHealthStatusSchema.parse("degraded")).toBe("degraded");
    expect(systemHealthStatusSchema.parse("offline")).toBe("offline");
  });

  it("rejects invalid status enum values", () => {
    expect(() => systemHealthStatusSchema.parse("unknown-status")).toThrow();
  });
});
