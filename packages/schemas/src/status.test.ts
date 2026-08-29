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

  it("validates offline and degraded status artifacts", () => {
    const offlineStatus: StatusArtifact = {
      schemaVersion: 1,
      generatedAt: "2026-08-29T12:00:00.000Z",
      status: "offline",
      latestEditionDate: null,
      publishedEditionsCount: 0,
      sources: { total: 3, active: 0 },
      checks: [
        {
          name: "source_registry",
          passed: false,
          detail: "0 active sources",
        },
        {
          name: "published_editions",
          passed: true,
          detail:
            "0 published editions found (1 sample/unpublishable edition withheld)",
        },
        {
          name: "latest_pointer",
          passed: true,
          detail: "No editions published yet",
        },
      ],
    };

    const degradedStatus: StatusArtifact = {
      schemaVersion: 1,
      generatedAt: "2026-08-29T12:00:00.000Z",
      status: "degraded",
      latestEditionDate: "2026-08-28",
      publishedEditionsCount: 1,
      sources: { total: 5, active: 5 },
      checks: [
        {
          name: "latest_pointer",
          passed: false,
          detail: "Pointer targets missing edition",
        },
      ],
    };

    expect(statusArtifactSchema.parse(offlineStatus).status).toBe("offline");
    expect(statusArtifactSchema.parse(degradedStatus).status).toBe("degraded");
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
