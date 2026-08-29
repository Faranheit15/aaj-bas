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
        name: "index_pointer",
        passed: true,
      },
      {
        name: "sources_registry",
        passed: true,
        detail: "All 10 sources active",
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
      status: "degraded" as const,
      latestEditionDate: null,
      publishedEditionsCount: 0,
    };
    const parsed = statusArtifactSchema.parse(initialStatus);
    expect(parsed.latestEditionDate).toBeNull();
  });

  it("rejects invalid status enum values", () => {
    expect(() => systemHealthStatusSchema.parse("unknown-status")).toThrow();
  });
});
